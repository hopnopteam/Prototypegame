using System;
using System.Collections.Generic;
using System.IO;

namespace NightExpress.Core.Save
{
    /// <summary>
    /// Stores saves as files. Each write goes to a temp file first, then files are rotated with renames
    /// (atomic on the same volume), so at every instant at least one complete copy exists on disk:
    /// main -> .bak, .tmp -> main.
    /// </summary>
    public sealed class FileSaveStorage : ISaveStorage
    {
        private const string Tag = "Save";
        private const string Extension = ".json";
        private const string TempSuffix = ".tmp";
        private const string BackupSuffix = ".bak";

        private readonly string _directory;

        public FileSaveStorage(string directory)
        {
            _directory = directory;
        }

        public string GetPath(string key)
        {
            return Path.Combine(_directory, key + Extension);
        }

        public IReadOnlyList<string> ReadCandidates(string key)
        {
            string path = GetPath(key);
            var candidates = new List<string>(3);

            // A leftover .tmp is newer than .bak: it only survives when a crash hit after it was fully written.
            // A partially written .tmp simply fails to parse and the loader moves on.
            TryAdd(path, candidates);
            TryAdd(path + TempSuffix, candidates);
            TryAdd(path + BackupSuffix, candidates);
            return candidates;
        }

        public bool Write(string key, string contents)
        {
            string path = GetPath(key);
            string tempPath = path + TempSuffix;
            string backupPath = path + BackupSuffix;

            try
            {
                Directory.CreateDirectory(_directory);
                File.WriteAllText(tempPath, contents);

                if (File.Exists(path))
                {
                    if (File.Exists(backupPath))
                    {
                        File.Delete(backupPath);
                    }

                    File.Move(path, backupPath);
                }

                File.Move(tempPath, path);
                return true;
            }
            catch (Exception exception)
            {
                GameLog.Error(Tag, $"Could not write '{path}': {exception.Message}");
                return false;
            }
        }

        public void Delete(string key)
        {
            string path = GetPath(key);
            TryDelete(path);
            TryDelete(path + TempSuffix);
            TryDelete(path + BackupSuffix);
        }

        private static void TryAdd(string path, List<string> candidates)
        {
            try
            {
                if (File.Exists(path))
                {
                    candidates.Add(File.ReadAllText(path));
                }
            }
            catch (Exception exception)
            {
                GameLog.Warn(Tag, $"Could not read '{path}': {exception.Message}");
            }
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (Exception exception)
            {
                GameLog.Warn(Tag, $"Could not delete '{path}': {exception.Message}");
            }
        }
    }
}
