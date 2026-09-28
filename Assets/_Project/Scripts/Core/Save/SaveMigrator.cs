using System.Collections.Generic;

namespace NightExpress.Core.Save
{
    /// <summary>Runs migration steps one version at a time. Pure logic, so it is unit tested directly.</summary>
    public static class SaveMigrator
    {
        private const string Tag = "Save";

        /// <summary>
        /// Upgrades <paramref name="data"/> from <paramref name="fromVersion"/> to <paramref name="toVersion"/>.
        /// A missing step is logged and skipped rather than aborting, because a half-migrated save with
        /// default values is far better for the player than losing everything.
        /// </summary>
        /// <returns>True if every step existed.</returns>
        public static bool Migrate(SaveData data, string rawJson, int fromVersion, int toVersion, IReadOnlyList<ISaveMigration> migrations)
        {
            bool allStepsFound = true;

            for (int version = fromVersion; version < toVersion; version++)
            {
                ISaveMigration step = FindStep(migrations, version);
                if (step == null)
                {
                    GameLog.Error(Tag, $"Missing save migration v{version} -> v{version + 1}. Fields added in that version keep their defaults.");
                    allStepsFound = false;
                    continue;
                }

                step.Apply(data, rawJson);
                GameLog.Info(Tag, $"Migrated save v{version} -> v{version + 1}.");
            }

            data.version = toVersion;
            return allStepsFound;
        }

        private static ISaveMigration FindStep(IReadOnlyList<ISaveMigration> migrations, int fromVersion)
        {
            if (migrations == null)
            {
                return null;
            }

            for (int i = 0; i < migrations.Count; i++)
            {
                if (migrations[i] != null && migrations[i].FromVersion == fromVersion)
                {
                    return migrations[i];
                }
            }

            return null;
        }
    }
}
