using System;
using System.IO;
using NightExpress.Core.Save;
using NUnit.Framework;

namespace NightExpress.Tests
{
    public sealed class FileSaveStorageTests
    {
        private const string Key = "save";

        private string _directory;
        private FileSaveStorage _storage;

        [SetUp]
        public void SetUp()
        {
            _directory = Path.Combine(Path.GetTempPath(), "nx_save_tests_" + Guid.NewGuid().ToString("N"));
            _storage = new FileSaveStorage(_directory);
        }

        [TearDown]
        public void TearDown()
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, true);
            }
        }

        [Test]
        public void ReadCandidates_NothingSaved_IsEmpty()
        {
            Assert.AreEqual(0, _storage.ReadCandidates(Key).Count);
        }

        [Test]
        public void Write_ThenRead_ReturnsMainCopyFirst()
        {
            Assert.IsTrue(_storage.Write(Key, "first"));
            Assert.IsTrue(_storage.Write(Key, "second"));

            var candidates = _storage.ReadCandidates(Key);

            Assert.AreEqual(2, candidates.Count);
            Assert.AreEqual("second", candidates[0]);
            Assert.AreEqual("first", candidates[1], "Previous write should be kept as the backup.");
        }

        [Test]
        public void Write_LeavesNoTempFileBehind()
        {
            _storage.Write(Key, "data");

            Assert.IsFalse(File.Exists(_storage.GetPath(Key) + ".tmp"));
        }

        [Test]
        public void ReadCandidates_MainMissingAfterCrash_FallsBackToTempThenBackup()
        {
            // Simulates a crash between the two renames: main is gone, .tmp (newest) and .bak remain.
            Directory.CreateDirectory(_directory);
            string path = _storage.GetPath(Key);
            File.WriteAllText(path + ".tmp", "newest");
            File.WriteAllText(path + ".bak", "older");

            var candidates = _storage.ReadCandidates(Key);

            Assert.AreEqual(2, candidates.Count);
            Assert.AreEqual("newest", candidates[0]);
            Assert.AreEqual("older", candidates[1]);
        }

        [Test]
        public void Delete_RemovesEveryCopy()
        {
            _storage.Write(Key, "one");
            _storage.Write(Key, "two");

            _storage.Delete(Key);

            Assert.AreEqual(0, _storage.ReadCandidates(Key).Count);
        }
    }
}
