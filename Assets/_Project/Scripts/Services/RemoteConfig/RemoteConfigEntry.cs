using System;
using UnityEngine;

namespace NightExpress.Services.RemoteConfig
{
    [Serializable]
    public sealed class RemoteConfigEntry
    {
        [Tooltip("Remote config key, e.g. ads.interstitial_min_interval_s.")]
        [SerializeField] private string key;

        [Tooltip("Value as text. Numbers use a dot as the decimal separator; booleans are true/false or 1/0.")]
        [SerializeField] private string value;

        public RemoteConfigEntry()
        {
        }

        public RemoteConfigEntry(string key, string value)
        {
            this.key = key;
            this.value = value;
        }

        public string Key => key;
        public string Value => value;
    }
}
