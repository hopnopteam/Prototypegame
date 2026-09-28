using System;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Everything persisted for the player, serialized with JsonUtility.
    /// Rules that keep old saves loading forever:
    /// - Adding a field with a sensible initial value needs no version bump (missing fields keep their initializer).
    /// - Renaming, removing or changing the meaning of a field: bump <see cref="CurrentVersion"/> and add an
    ///   <see cref="ISaveMigration"/> to <see cref="SaveMigrations.All"/> in the same change.
    /// Field names are the JSON keys, so they use Unity's camelCase serialized-field style.
    /// </summary>
    [Serializable]
    public sealed class SaveData
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public long createdUtcTicks;
        public long lastActiveUtcTicks;
        public PlayerProfileData profile = new PlayerProfileData();
        public SettingsData settings = new SettingsData();

        public static SaveData CreateNew(DateTime utcNow)
        {
            var data = new SaveData
            {
                createdUtcTicks = utcNow.Ticks,
                lastActiveUtcTicks = utcNow.Ticks,
            };
            data.profile.installId = NewInstallId();
            return data;
        }

        /// <summary>Repairs nulls left by hand-edited or partial files so gameplay code never has to null-check.</summary>
        public void EnsureValid()
        {
            if (profile == null)
            {
                profile = new PlayerProfileData();
            }

            if (settings == null)
            {
                settings = new SettingsData();
            }

            if (string.IsNullOrEmpty(profile.installId))
            {
                profile.installId = NewInstallId();
            }
        }

        private static string NewInstallId()
        {
            return Guid.NewGuid().ToString("N");
        }
    }
}
