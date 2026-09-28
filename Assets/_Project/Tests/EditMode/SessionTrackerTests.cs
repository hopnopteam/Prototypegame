using System;
using System.Linq;
using NightExpress.Core;
using NightExpress.Core.Save;
using NightExpress.Core.Session;
using NightExpress.Services.Analytics;
using NUnit.Framework;

namespace NightExpress.Tests
{
    public sealed class SessionTrackerTests
    {
        private const float SessionTimeoutSeconds = 60f;
        private const int AnalyticsHistory = 20;

        private static readonly DateTime Start = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

        private EventBus _events;
        private FakeClock _clock;
        private SaveSystem _save;
        private MockAnalyticsService _analytics;
        private SessionTracker _session;

        [SetUp]
        public void SetUp()
        {
            _events = new EventBus();
            _clock = new FakeClock(Start);
            _save = new SaveSystem(new InMemorySaveStorage(), new SaveSettings("session_test", 2f, 30f, false), _events, _clock, SaveMigrations.All);
            _save.Load();
            _analytics = new MockAnalyticsService(false, AnalyticsHistory);
            _session = new SessionTracker(_save, _events, _analytics, _clock, SessionTimeoutSeconds);
        }

        [TearDown]
        public void TearDown()
        {
            _session.Dispose();
            _save.Dispose();
        }

        [Test]
        public void StartSession_IncrementsCountAndLogsSessionStart()
        {
            _session.StartSession();

            Assert.AreEqual(1, _session.SessionNumber);
            Assert.IsTrue(_analytics.RecentEvents.Last().StartsWith(AnalyticsEvents.SessionStart));
        }

        [Test]
        public void Tick_AccumulatesSessionAndLifetimePlayTime()
        {
            _session.StartSession();

            _session.Tick(1.5f);
            _session.Tick(2.5f);

            Assert.AreEqual(4d, _session.SessionSeconds, 0.0001d);
            Assert.AreEqual(4d, _session.LifetimePlaySeconds, 0.0001d);
        }

        [Test]
        public void Backgrounded_StopsCountingPlayTimeAndLogsSessionEnd()
        {
            _session.StartSession();
            _events.Publish(new AppPauseChanged(true));

            _session.Tick(10f);

            Assert.AreEqual(0d, _session.LifetimePlaySeconds);
            Assert.IsTrue(_analytics.RecentEvents.Last().StartsWith(AnalyticsEvents.SessionEnd));
        }

        [Test]
        public void ShortBreak_ContinuesSameSession()
        {
            _session.StartSession();
            _events.Publish(new AppPauseChanged(true));
            _clock.Advance(TimeSpan.FromSeconds(SessionTimeoutSeconds - 1f));
            _events.Publish(new AppPauseChanged(false));

            Assert.AreEqual(1, _session.SessionNumber);
        }

        [Test]
        public void LongBreak_StartsNewSession()
        {
            _session.StartSession();
            _events.Publish(new AppPauseChanged(true));
            _clock.Advance(TimeSpan.FromSeconds(SessionTimeoutSeconds + 1f));
            _events.Publish(new AppPauseChanged(false));

            Assert.AreEqual(2, _session.SessionNumber);
            Assert.AreEqual(0d, _session.SessionSeconds);
        }
    }
}
