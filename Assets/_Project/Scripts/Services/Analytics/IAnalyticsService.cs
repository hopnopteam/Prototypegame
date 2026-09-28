using System.Collections.Generic;

namespace NightExpress.Services.Analytics
{
    /// <summary>
    /// Analytics sink. Gameplay code logs through this interface only, so the publisher's SDK
    /// (GameAnalytics, Firebase, AppsFlyer...) plugs in later without touching gameplay.
    /// Use names from <see cref="AnalyticsEvents"/> and keys from <see cref="AnalyticsParams"/>.
    /// </summary>
    public interface IAnalyticsService
    {
        void Initialize(string userId);

        void LogEvent(string eventName);

        /// <summary>Values should be string, bool, int, long, float or double; every SDK supports those.</summary>
        void LogEvent(string eventName, IReadOnlyDictionary<string, object> parameters);
    }
}
