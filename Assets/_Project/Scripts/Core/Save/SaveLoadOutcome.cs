namespace NightExpress.Core.Save
{
    public enum SaveLoadOutcome
    {
        /// <summary>Load has not run yet.</summary>
        NotLoaded,

        /// <summary>No save existed: first launch.</summary>
        NewPlayer,

        /// <summary>The main save loaded normally.</summary>
        Loaded,

        /// <summary>The main save was missing or damaged; a recovery copy was used.</summary>
        RestoredFromBackup,

        /// <summary>Every copy was damaged; the player starts fresh and the damaged file is kept for support.</summary>
        ResetAfterCorruption,
    }
}
