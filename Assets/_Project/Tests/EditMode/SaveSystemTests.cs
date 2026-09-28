using System;
using System.Text.RegularExpressions;
using NightExpress.Core;
using NightExpress.Core.Save;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class SaveSystemTests
    {
        private const string Key = "test_save";
        private const float MinSecondsBetweenAutosaves = 2f;
        private const float PeriodicSaveSeconds = 30f;

        private static readonly DateTime Start = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

        private InMemorySaveStorage _storage;
        private EventBus _events;
        private FakeClock _clock;
        private SaveSystem _save;

        [SetUp]
        public void SetUp()
        {
            _storage = new InMemorySaveStorage();
            _events = new EventBus();
            _clock = new FakeClock(Start);
            _save = CreateSaveSystem();
        }

        [TearDown]
        public void TearDown()
        {
            _save.Dispose();
        }

        [Test]
        public void Load_WithNoSave_CreatesNewPlayerAndWritesImmediately()
        {
            _save.Load();

            Assert.AreEqual(SaveLoadOutcome.NewPlayer, _save.LastLoadOutcome);
            Assert.AreEqual(SaveData.CurrentVersion, _save.Data.version);
            Assert.IsFalse(string.IsNullOrEmpty(_save.Data.profile.installId));
            Assert.AreEqual(0d, _save.SecondsAwayOnLaunch);
            Assert.AreEqual(1, _storage.WriteCount);
        }

        [Test]
        public void SaveThenLoad_RoundTripsData()
        {
            _save.Load();
            _save.Data.profile.sessionCount = 7;
            _save.Data.settings.musicOn = false;
            string installId = _save.Data.profile.installId;
            _save.SaveNow("test");

            SaveSystem reloaded = CreateSaveSystem();
            reloaded.Load();

            Assert.AreEqual(SaveLoadOutcome.Loaded, reloaded.LastLoadOutcome);
            Assert.AreEqual(7, reloaded.Data.profile.sessionCount);
            Assert.IsFalse(reloaded.Data.settings.musicOn);
            Assert.AreEqual(installId, reloaded.Data.profile.installId);
            reloaded.Dispose();
        }

        [Test]
        public void Load_ReportsTimeAwaySinceLastSave()
        {
            _save.Load();
            _clock.Advance(TimeSpan.FromHours(3));

            SaveSystem reloaded = CreateSaveSystem();
            reloaded.Load();

            Assert.AreEqual(TimeSpan.FromHours(3).TotalSeconds, reloaded.SecondsAwayOnLaunch, 0.001d);
            reloaded.Dispose();
        }

        [Test]
        public void Load_ClockMovedBackwards_ReportsZeroTimeAway()
        {
            _save.Load();
            _clock.Advance(TimeSpan.FromHours(-5));

            SaveSystem reloaded = CreateSaveSystem();
            reloaded.Load();

            Assert.AreEqual(0d, reloaded.SecondsAwayOnLaunch);
            reloaded.Dispose();
        }

        [Test]
        public void Load_CorruptMainCopy_RestoresRecoveryCopy()
        {
            _save.Load();
            _save.Data.profile.sessionCount = 3;
            _save.SaveNow("test");
            string good = _storage.GetMain(Key);
            _storage.SetCandidates(Key, "{ this is not json", good);

            SaveSystem reloaded = CreateSaveSystem();
            reloaded.Load();

            Assert.AreEqual(SaveLoadOutcome.RestoredFromBackup, reloaded.LastLoadOutcome);
            Assert.AreEqual(3, reloaded.Data.profile.sessionCount);
            reloaded.Dispose();
        }

        [Test]
        public void Load_AllCopiesCorrupt_StartsFreshAndKeepsDamagedCopy()
        {
            const string damaged = "{ broken";
            _storage.SetCandidates(Key, damaged, "also broken");

            LogAssert.Expect(LogType.Error, new Regex("unreadable"));
            _save.Load();

            Assert.AreEqual(SaveLoadOutcome.ResetAfterCorruption, _save.LastLoadOutcome);
            Assert.AreEqual(0, _save.Data.profile.sessionCount);
            Assert.AreEqual(damaged, _storage.GetMain(Key + ".corrupt"));
        }

        [Test]
        public void Load_MissingFields_KeepDefaults()
        {
            // A save written before settings existed must still load with sensible settings.
            _storage.SetCandidates(Key, "{\"version\":1,\"profile\":{\"installId\":\"abc\",\"sessionCount\":2}}");

            _save.Load();

            Assert.AreEqual(SaveLoadOutcome.Loaded, _save.LastLoadOutcome);
            Assert.AreEqual(2, _save.Data.profile.sessionCount);
            Assert.IsNotNull(_save.Data.settings);
            Assert.IsTrue(_save.Data.settings.soundOn);
        }

        [Test]
        public void Load_VersionZeroOrMissing_IsTreatedAsUnreadable()
        {
            _storage.SetCandidates(Key, "{\"profile\":{\"sessionCount\":2}}");

            LogAssert.Expect(LogType.Error, new Regex("unreadable"));
            _save.Load();

            Assert.AreEqual(SaveLoadOutcome.ResetAfterCorruption, _save.LastLoadOutcome);
        }

        [Test]
        public void Tick_DirtySave_WaitsForMinimumInterval()
        {
            _save.Load();
            int writesAfterLoad = _storage.WriteCount;

            _save.MarkDirty();
            _save.Tick(MinSecondsBetweenAutosaves * 0.5f);
            Assert.AreEqual(writesAfterLoad, _storage.WriteCount, "Should batch writes inside the minimum interval.");

            _save.Tick(MinSecondsBetweenAutosaves);
            Assert.AreEqual(writesAfterLoad + 1, _storage.WriteCount);
        }

        [Test]
        public void Tick_CleanSave_WritesPeriodically()
        {
            _save.Load();
            int writesAfterLoad = _storage.WriteCount;

            _save.Tick(PeriodicSaveSeconds - 1f);
            Assert.AreEqual(writesAfterLoad, _storage.WriteCount);

            _save.Tick(1f);
            Assert.AreEqual(writesAfterLoad + 1, _storage.WriteCount);
        }

        [Test]
        public void AppPaused_SavesImmediately()
        {
            _save.Load();
            int writesAfterLoad = _storage.WriteCount;

            _events.Publish(new AppPauseChanged(true));

            Assert.AreEqual(writesAfterLoad + 1, _storage.WriteCount);
        }

        [Test]
        public void AppResumed_PublishesTimeAway()
        {
            _save.Load();
            double reported = -1d;
            _events.Subscribe<PlayerReturned>(e => reported = e.SecondsAway);

            _events.Publish(new AppPauseChanged(true));
            _clock.Advance(TimeSpan.FromMinutes(10));
            _events.Publish(new AppPauseChanged(false));

            Assert.AreEqual(TimeSpan.FromMinutes(10).TotalSeconds, reported, 0.001d);
        }

        [Test]
        public void AppResumed_WithoutPriorPause_PublishesNothing()
        {
            _save.Load();
            bool published = false;
            _events.Subscribe<PlayerReturned>(_ => published = true);

            _events.Publish(new AppPauseChanged(false));

            Assert.IsFalse(published);
        }

        [Test]
        public void ResetToNewPlayer_ReplacesDataWithFreshProfile()
        {
            _save.Load();
            _save.Data.profile.sessionCount = 9;
            string oldId = _save.Data.profile.installId;

            _save.ResetToNewPlayer();

            Assert.AreEqual(0, _save.Data.profile.sessionCount);
            Assert.AreNotEqual(oldId, _save.Data.profile.installId);
        }

        private SaveSystem CreateSaveSystem()
        {
            var settings = new SaveSettings(Key, MinSecondsBetweenAutosaves, PeriodicSaveSeconds, false);
            return new SaveSystem(_storage, settings, _events, _clock, SaveMigrations.All);
        }
    }
}
