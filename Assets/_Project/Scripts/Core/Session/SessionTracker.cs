using System;
using System.Collections.Generic;
using NightExpress.Core.Save;
using NightExpress.Services.Analytics;

namespace NightExpress.Core.Session
{
    /// <summary>
    /// Counts sessions and foreground play time, and fires session_start / session_end.
    /// session_end is sent when the app is backgrounded because mobile OSes rarely deliver a clean quit;
    /// if the player returns within the timeout the session continues, and a later session_end with the
    /// same session_number supersedes the earlier one.
    /// </summary>
    public sealed class SessionTracker : ITickable, IDisposable
    {
        private const double SecondsPerMinute = 60d;

        private readonly SaveSystem _save;
        private readonly EventBus _events;
        private readonly IAnalyticsService _analytics;
        private readonly IClock _clock;
        private readonly float _sessionTimeoutSeconds;

        private bool _isBackgrounded;
        private DateTime _backgroundedAtUtc;

        public SessionTracker(SaveSystem save, EventBus events, IAnalyticsService analytics, IClock clock, float sessionTimeoutSeconds)
        {
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _events = events ?? throw new ArgumentNullException(nameof(events));
            _analytics = analytics ?? throw new ArgumentNullException(nameof(analytics));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _sessionTimeoutSeconds = sessionTimeoutSeconds;

            _events.Subscribe<AppPauseChanged>(OnAppPauseChanged);
            _events.Subscribe<AppQuitting>(OnAppQuitting);
        }

        public bool IsSessionActive { get; private set; }

        public double SessionSeconds { get; private set; }

        public int SessionNumber => _save.Data.profile.sessionCount;

        public double LifetimePlaySeconds => _save.Data.profile.lifetimePlaySeconds;

        public void StartSession()
        {
            if (!_save.IsLoaded)
            {
                GameLog.Error("Session", "StartSession() needs a loaded save.");
                return;
            }

            IsSessionActive = true;
            SessionSeconds = 0d;
            _save.Data.profile.sessionCount++;
            _save.MarkDirty();

            _analytics.LogEvent(AnalyticsEvents.SessionStart, new Dictionary<string, object>
            {
                { AnalyticsParams.SessionNumber, SessionNumber },
                { AnalyticsParams.LifetimeMinutes, Math.Floor(LifetimePlaySeconds / SecondsPerMinute) },
            });
        }

        public void Tick(float unscaledDeltaTime)
        {
            if (!IsSessionActive || _isBackgrounded || !_save.IsLoaded)
            {
                return;
            }

            SessionSeconds += unscaledDeltaTime;
            // Not marked dirty on purpose: the save system's periodic write picks this up without a write every frame.
            _save.Data.profile.lifetimePlaySeconds += unscaledDeltaTime;
        }

        public void Dispose()
        {
            _events.Unsubscribe<AppPauseChanged>(OnAppPauseChanged);
            _events.Unsubscribe<AppQuitting>(OnAppQuitting);
        }

        private void OnAppPauseChanged(AppPauseChanged gameEvent)
        {
            if (!IsSessionActive)
            {
                return;
            }

            if (gameEvent.IsPaused)
            {
                _isBackgrounded = true;
                _backgroundedAtUtc = _clock.UtcNow;
                LogSessionEnd();
                return;
            }

            if (!_isBackgrounded)
            {
                return;
            }

            _isBackgrounded = false;
            double secondsAway = (_clock.UtcNow - _backgroundedAtUtc).TotalSeconds;
            if (secondsAway >= _sessionTimeoutSeconds)
            {
                StartSession();
            }
        }

        private void OnAppQuitting(AppQuitting gameEvent)
        {
            if (IsSessionActive && !_isBackgrounded)
            {
                LogSessionEnd();
            }
        }

        private void LogSessionEnd()
        {
            _analytics.LogEvent(AnalyticsEvents.SessionEnd, new Dictionary<string, object>
            {
                { AnalyticsParams.SessionNumber, SessionNumber },
                { AnalyticsParams.SessionSeconds, Math.Round(SessionSeconds) },
            });
        }
    }
}
