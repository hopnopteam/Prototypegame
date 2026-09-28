using System;
using System.Collections.Generic;
using System.Globalization;
using NightExpress.Core;

namespace NightExpress.Services.RemoteConfig
{
    /// <summary>
    /// Offline stand-in for remote config. Returns the overrides listed on the MockServicesConfig asset as if
    /// they came from a server, so a designer can rehearse a live tweak in the Editor. With no overrides,
    /// every getter returns its fallback, i.e. the in-game default.
    /// </summary>
    public sealed class LocalRemoteConfig : IRemoteConfig
    {
        private const string Tag = "RemoteConfig";

        private readonly Dictionary<string, string> _values = new Dictionary<string, string>(StringComparer.Ordinal);

        public LocalRemoteConfig(IReadOnlyList<RemoteConfigEntry> overrides)
        {
            if (overrides == null)
            {
                return;
            }

            for (int i = 0; i < overrides.Count; i++)
            {
                RemoteConfigEntry entry = overrides[i];
                if (entry == null || string.IsNullOrWhiteSpace(entry.Key))
                {
                    continue;
                }

                if (_values.ContainsKey(entry.Key))
                {
                    GameLog.Warn(Tag, $"Duplicate override '{entry.Key}'; the last one wins.");
                }

                _values[entry.Key] = entry.Value ?? string.Empty;
            }
        }

        public bool IsFetched { get; private set; }

        public void Fetch(Action<bool> onComplete)
        {
            IsFetched = true;
            onComplete?.Invoke(true);
        }

        public bool HasKey(string key)
        {
            return key != null && _values.ContainsKey(key);
        }

        public int GetInt(string key, int fallback)
        {
            if (!TryGetRaw(key, out string raw))
            {
                return fallback;
            }

            if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
            {
                return value;
            }

            WarnUnparsable(key, raw, "int");
            return fallback;
        }

        public float GetFloat(string key, float fallback)
        {
            if (!TryGetRaw(key, out string raw))
            {
                return fallback;
            }

            if (float.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out float value))
            {
                return value;
            }

            WarnUnparsable(key, raw, "float");
            return fallback;
        }

        public bool GetBool(string key, bool fallback)
        {
            if (!TryGetRaw(key, out string raw))
            {
                return fallback;
            }

            if (bool.TryParse(raw, out bool value))
            {
                return value;
            }

            if (raw == "1")
            {
                return true;
            }

            if (raw == "0")
            {
                return false;
            }

            WarnUnparsable(key, raw, "bool");
            return fallback;
        }

        public string GetString(string key, string fallback)
        {
            return TryGetRaw(key, out string raw) ? raw : fallback;
        }

        private bool TryGetRaw(string key, out string raw)
        {
            if (key == null)
            {
                raw = null;
                return false;
            }

            return _values.TryGetValue(key, out raw);
        }

        private static void WarnUnparsable(string key, string raw, string typeName)
        {
            GameLog.Warn(Tag, $"Override '{key}' = '{raw}' is not a valid {typeName}; using the in-game default.");
        }
    }
}
