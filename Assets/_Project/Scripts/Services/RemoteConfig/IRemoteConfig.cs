using System;

namespace NightExpress.Services.RemoteConfig
{
    /// <summary>
    /// Server-side overrides for tuning values (ad rules, timers, prices) so live balance can change without an update.
    /// Pattern: the ScriptableObject value is always the fallback; remote config only overrides it, e.g.
    /// <c>remote.GetFloat("ads.interstitial_min_interval_s", adPolicyConfig.MinIntervalSeconds)</c>.
    /// </summary>
    public interface IRemoteConfig
    {
        bool IsFetched { get; }

        void Fetch(Action<bool> onComplete);

        bool HasKey(string key);

        int GetInt(string key, int fallback);

        float GetFloat(string key, float fallback);

        bool GetBool(string key, bool fallback);

        string GetString(string key, string fallback);
    }
}
