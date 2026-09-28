namespace NightExpress.Core.Save
{
    /// <summary>
    /// Upgrades a save by exactly one schema version: <see cref="FromVersion"/> to FromVersion + 1.
    /// </summary>
    public interface ISaveMigration
    {
        int FromVersion { get; }

        /// <summary>
        /// <paramref name="data"/> already holds every field whose name and type did not change; new fields hold
        /// their initial values. Read renamed or restructured fields from <paramref name="rawJson"/> with a small
        /// legacy DTO and JsonUtility, then write them into <paramref name="data"/>.
        /// </summary>
        void Apply(SaveData data, string rawJson);
    }
}
