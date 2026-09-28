using System.Text.RegularExpressions;
using NightExpress.Services.RemoteConfig;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class LocalRemoteConfigTests
    {
        private static LocalRemoteConfig Create(params RemoteConfigEntry[] overrides)
        {
            return new LocalRemoteConfig(overrides);
        }

        [Test]
        public void MissingKey_ReturnsFallback()
        {
            LocalRemoteConfig config = Create();

            Assert.AreEqual(5, config.GetInt("missing", 5));
            Assert.AreEqual(1.5f, config.GetFloat("missing", 1.5f));
            Assert.IsTrue(config.GetBool("missing", true));
            Assert.AreEqual("x", config.GetString("missing", "x"));
            Assert.IsFalse(config.HasKey("missing"));
        }

        [Test]
        public void Overrides_AreParsedWithInvariantCulture()
        {
            LocalRemoteConfig config = Create(
                new RemoteConfigEntry("ads.interval", "180"),
                new RemoteConfigEntry("station.seconds", "40.5"),
                new RemoteConfigEntry("feature.on", "true"),
                new RemoteConfigEntry("feature.flag", "0"));

            Assert.AreEqual(180, config.GetInt("ads.interval", 0));
            Assert.AreEqual(40.5f, config.GetFloat("station.seconds", 0f));
            Assert.IsTrue(config.GetBool("feature.on", false));
            Assert.IsFalse(config.GetBool("feature.flag", true));
        }

        [Test]
        public void UnparsableValue_ReturnsFallbackAndWarns()
        {
            LocalRemoteConfig config = Create(new RemoteConfigEntry("ads.interval", "soon"));

            LogAssert.Expect(LogType.Warning, new Regex("not a valid int"));

            Assert.AreEqual(90, config.GetInt("ads.interval", 90));
        }

        [Test]
        public void Fetch_CompletesSuccessfully()
        {
            LocalRemoteConfig config = Create();
            bool? result = null;

            config.Fetch(success => result = success);

            Assert.IsTrue(config.IsFetched);
            Assert.AreEqual(true, result);
        }
    }
}
