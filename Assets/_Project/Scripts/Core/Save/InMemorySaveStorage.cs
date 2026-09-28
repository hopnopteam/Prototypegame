using System;
using System.Collections.Generic;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Save storage that never touches disk. Used by tests, and handy for Creative Mode recordings later.
    /// Keeps the previous write as a recovery copy, mirroring <see cref="FileSaveStorage"/>.
    /// </summary>
    public sealed class InMemorySaveStorage : ISaveStorage
    {
        private const int MaxCopies = 2;

        private readonly Dictionary<string, List<string>> _copies = new Dictionary<string, List<string>>();

        public int WriteCount { get; private set; }

        public IReadOnlyList<string> ReadCandidates(string key)
        {
            return _copies.TryGetValue(key, out List<string> copies) ? copies.ToArray() : Array.Empty<string>();
        }

        public bool Write(string key, string contents)
        {
            if (!_copies.TryGetValue(key, out List<string> copies))
            {
                copies = new List<string>(MaxCopies + 1);
                _copies.Add(key, copies);
            }

            copies.Insert(0, contents);
            if (copies.Count > MaxCopies)
            {
                copies.RemoveAt(copies.Count - 1);
            }

            WriteCount++;
            return true;
        }

        public void Delete(string key)
        {
            _copies.Remove(key);
        }

        /// <summary>Replaces every stored copy for a key (main first). Lets tests simulate corrupted files.</summary>
        public void SetCandidates(string key, params string[] mainFirst)
        {
            _copies[key] = new List<string>(mainFirst);
        }

        public string GetMain(string key)
        {
            return _copies.TryGetValue(key, out List<string> copies) && copies.Count > 0 ? copies[0] : null;
        }
    }
}
