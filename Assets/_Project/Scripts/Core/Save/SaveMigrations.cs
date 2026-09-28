using System.Collections.Generic;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Every save migration the game knows. Add one step per schema bump, in the same change that
    /// increases <see cref="SaveData.CurrentVersion"/>. Never delete old steps: players can skip many updates.
    /// </summary>
    public static class SaveMigrations
    {
        public static readonly IReadOnlyList<ISaveMigration> All = new ISaveMigration[]
        {
            // Example for the first bump: new SaveV1ToV2(),
        };
    }
}
