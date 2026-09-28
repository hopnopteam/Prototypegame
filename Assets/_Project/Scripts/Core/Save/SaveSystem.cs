using System;
using System.Collections.Generic;
using UnityEngine;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Loads, migrates and writes <see cref="SaveData"/>.
    /// When it writes:
    /// - <see cref="MarkDirty"/> after anything important (unlock, purchase); writes are batched by
    ///   <see cref="SaveSettings.MinSecondsBetweenAutosaves"/>.
    /// - Periodically, so play time and timestamps survive a crash.
    /// - Immediately when the app is backgrounded, loses focus or quits.
    /// It also measures time away for offline earnings.
    /// </summary>
    public sealed class SaveSystem : ITickable, IDisposable
    {
        private const string Tag = "Save";
        private const string CorruptSuffix = ".corrupt";

        private readonly ISaveStorage _storage;
        private readonly SaveSettings _settings;
        private readonly EventBus _events;
        private readonly IClock _clock;
        private readonly IReadOnlyList<ISaveMigration> _migrations;

        private bool _dirty;
        private float _secondsSinceSave;
        private bool _isBackgrounded;

        public SaveSystem(ISaveStorage storage, SaveSettings settings, EventBus events, IClock clock, IReadOnlyList<ISaveMigration> migrations)
        {
            _storage = storage ?? throw new ArgumentNullException(nameof(storage));
            _settings = settings ?? new SaveSettings();
            _events = events ?? throw new ArgumentNullException(nameof(events));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _migrations = migrations ?? Array.Empty<ISaveMigration>();

            _events.Subscribe<AppPauseChanged>(OnAppPauseChanged);
            _events.Subscribe<AppFocusChanged>(OnAppFocusChanged);
            _events.Subscribe<AppQuitting>(OnAppQuitting);
        }

        /// <summary>The live save. Gameplay systems read and write it directly, then call <see cref="MarkDirty"/>.</summary>
        public SaveData Data { get; private set; }

        public bool IsLoaded => Data != null;

        public SaveLoadOutcome LastLoadOutcome { get; private set; } = SaveLoadOutcome.NotLoaded;

        /// <summary>Seconds between the previous session's last save and this launch. 0 for a new player.</summary>
        public double SecondsAwayOnLaunch { get; private set; }

        public void Load()
        {
            DateTime now = _clock.UtcNow;
            LastLoadOutcome = LoadFromStorage(now, out SaveData data);
            Data = data;

            bool hasHistory = LastLoadOutcome == SaveLoadOutcome.Loaded || LastLoadOutcome == SaveLoadOutcome.RestoredFromBackup;
            SecondsAwayOnLaunch = hasHistory ? SecondsBetween(Data.lastActiveUtcTicks, now) : 0d;

            GameLog.Info(Tag, $"Load finished: {LastLoadOutcome}, away {SecondsAwayOnLaunch:0}s, version {Data.version}.");

            // Persist right away so new-player data and migration results are on disk before anything can go wrong.
            SaveNow("load");
        }

        /// <summary>Requests a save soon. Cheap to call often; writes are batched.</summary>
        public void MarkDirty()
        {
            _dirty = true;
        }

        public bool SaveNow(string reason)
        {
            if (Data == null)
            {
                GameLog.Error(Tag, $"SaveNow('{reason}') was called before Load().");
                return false;
            }

            Data.lastActiveUtcTicks = _clock.UtcNow.Ticks;
            string json = JsonUtility.ToJson(Data, _settings.PrettyPrint);

            if (!_storage.Write(_settings.FileKey, json))
            {
                // Keep the dirty flag so the next tick retries.
                return false;
            }

            _dirty = false;
            _secondsSinceSave = 0f;
            GameLog.Info(Tag, $"Saved ({reason}).");
            return true;
        }

        /// <summary>Developer tool: wipes progress and starts over as a brand-new player.</summary>
        public void ResetToNewPlayer()
        {
            Data = SaveData.CreateNew(_clock.UtcNow);
            LastLoadOutcome = SaveLoadOutcome.NewPlayer;
            SecondsAwayOnLaunch = 0d;
            SaveNow("reset");
        }

        public void Tick(float unscaledDeltaTime)
        {
            if (Data == null || _isBackgrounded)
            {
                return;
            }

            _secondsSinceSave += unscaledDeltaTime;

            if (_dirty && _secondsSinceSave >= _settings.MinSecondsBetweenAutosaves)
            {
                SaveNow("autosave");
            }
            else if (_secondsSinceSave >= _settings.PeriodicSaveSeconds)
            {
                SaveNow("periodic");
            }
        }

        public void Dispose()
        {
            _events.Unsubscribe<AppPauseChanged>(OnAppPauseChanged);
            _events.Unsubscribe<AppFocusChanged>(OnAppFocusChanged);
            _events.Unsubscribe<AppQuitting>(OnAppQuitting);
        }

        private SaveLoadOutcome LoadFromStorage(DateTime now, out SaveData data)
        {
            IReadOnlyList<string> candidates = _storage.ReadCandidates(_settings.FileKey);

            for (int i = 0; i < candidates.Count; i++)
            {
                if (TryParse(candidates[i], out data))
                {
                    if (i > 0)
                    {
                        GameLog.Warn(Tag, $"Main save was missing or unreadable; restored recovery copy #{i}.");
                        return SaveLoadOutcome.RestoredFromBackup;
                    }

                    return SaveLoadOutcome.Loaded;
                }
            }

            data = SaveData.CreateNew(now);

            if (candidates.Count == 0)
            {
                return SaveLoadOutcome.NewPlayer;
            }

            // Keep the damaged file so a support request can still recover it.
            _storage.Write(_settings.FileKey + CorruptSuffix, candidates[0]);
            GameLog.Error(Tag, $"All {candidates.Count} save copies are unreadable. Starting fresh; the damaged copy was kept as '{_settings.FileKey}{CorruptSuffix}'.");
            return SaveLoadOutcome.ResetAfterCorruption;
        }

        private bool TryParse(string json, out SaveData data)
        {
            data = null;
            if (string.IsNullOrWhiteSpace(json))
            {
                return false;
            }

            try
            {
                var header = JsonUtility.FromJson<SaveHeader>(json);
                if (header == null || header.version < 1)
                {
                    return false;
                }

                // Start from defaults and overwrite with what the file has, so fields added since keep their initial values.
                var parsed = new SaveData();
                JsonUtility.FromJsonOverwrite(json, parsed);

                if (header.version < SaveData.CurrentVersion)
                {
                    SaveMigrator.Migrate(parsed, json, header.version, SaveData.CurrentVersion, _migrations);
                }
                else if (header.version > SaveData.CurrentVersion)
                {
                    GameLog.Warn(Tag, $"Save is from a newer build (v{header.version}, this build is v{SaveData.CurrentVersion}). Loading the fields this build understands.");
                }

                parsed.EnsureValid();
                data = parsed;
                return true;
            }
            catch (Exception exception)
            {
                GameLog.Warn(Tag, $"Save copy could not be parsed: {exception.Message}");
                return false;
            }
        }

        private static double SecondsBetween(long earlierUtcTicks, DateTime now)
        {
            // Clamp at zero: a clock moved backwards must never produce negative time away.
            double seconds = (now.Ticks - earlierUtcTicks) / (double)TimeSpan.TicksPerSecond;
            return seconds > 0d ? seconds : 0d;
        }

        private void OnAppPauseChanged(AppPauseChanged gameEvent)
        {
            if (Data == null)
            {
                return;
            }

            if (gameEvent.IsPaused)
            {
                _isBackgrounded = true;
                SaveNow("paused");
                return;
            }

            if (!_isBackgrounded)
            {
                return;
            }

            _isBackgrounded = false;
            double secondsAway = SecondsBetween(Data.lastActiveUtcTicks, _clock.UtcNow);
            _events.Publish(new PlayerReturned(secondsAway));
        }

        private void OnAppFocusChanged(AppFocusChanged gameEvent)
        {
            if (Data != null && !gameEvent.HasFocus && !_isBackgrounded)
            {
                SaveNow("focus lost");
            }
        }

        private void OnAppQuitting(AppQuitting gameEvent)
        {
            if (Data != null)
            {
                SaveNow("quit");
            }
        }

        [Serializable]
        private sealed class SaveHeader
        {
#pragma warning disable CS0649 // Assigned by JsonUtility.
            public int version;
#pragma warning restore CS0649
        }
    }
}
