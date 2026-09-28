using System.Collections.Generic;
using System.Text.RegularExpressions;
using NightExpress.Core.Save;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class SaveMigratorTests
    {
        private sealed class RecordingMigration : ISaveMigration
        {
            private readonly List<int> _log;

            public RecordingMigration(int fromVersion, List<int> log)
            {
                FromVersion = fromVersion;
                _log = log;
            }

            public int FromVersion { get; }

            public void Apply(SaveData data, string rawJson)
            {
                _log.Add(FromVersion);
            }
        }

        [Test]
        public void Migrate_RunsEachStepInOrder()
        {
            var log = new List<int>();
            var steps = new ISaveMigration[] { new RecordingMigration(2, log), new RecordingMigration(1, log) };
            var data = new SaveData { version = 1 };

            bool complete = SaveMigrator.Migrate(data, "{}", 1, 3, steps);

            Assert.IsTrue(complete);
            CollectionAssert.AreEqual(new[] { 1, 2 }, log);
            Assert.AreEqual(3, data.version);
        }

        [Test]
        public void Migrate_MissingStep_ContinuesAndReportsIncomplete()
        {
            var log = new List<int>();
            var steps = new ISaveMigration[] { new RecordingMigration(2, log) };
            var data = new SaveData { version = 1 };

            LogAssert.Expect(LogType.Error, new Regex("Missing save migration v1 -> v2"));
            bool complete = SaveMigrator.Migrate(data, "{}", 1, 3, steps);

            Assert.IsFalse(complete);
            CollectionAssert.AreEqual(new[] { 2 }, log);
            Assert.AreEqual(3, data.version);
        }

        [Test]
        public void Migrate_AlreadyCurrent_DoesNothing()
        {
            var log = new List<int>();
            var data = new SaveData { version = 3 };

            bool complete = SaveMigrator.Migrate(data, "{}", 3, 3, new ISaveMigration[] { new RecordingMigration(3, log) });

            Assert.IsTrue(complete);
            Assert.IsEmpty(log);
        }
    }
}
