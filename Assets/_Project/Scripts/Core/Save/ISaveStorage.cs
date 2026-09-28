using System.Collections.Generic;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Where save text lives. Implementations keep recovery copies so a crash or power loss mid-write
    /// can never wipe a player's progress.
    /// </summary>
    public interface ISaveStorage
    {
        /// <summary>
        /// Every stored copy for <paramref name="key"/>: the main copy first, then recovery copies, newest first.
        /// The caller loads the first one that parses. Empty if nothing was ever saved.
        /// </summary>
        IReadOnlyList<string> ReadCandidates(string key);

        /// <summary>Writes the main copy, keeping the previous one as a recovery copy. Returns false on failure.</summary>
        bool Write(string key, string contents);

        /// <summary>Deletes the main copy and every recovery copy.</summary>
        void Delete(string key);
    }
}
