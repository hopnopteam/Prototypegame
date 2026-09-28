using System.Text.RegularExpressions;
using NightExpress.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class ServiceLocatorTests
    {
        private interface ITestService
        {
        }

        private sealed class TestService : ITestService
        {
        }

        [SetUp]
        public void SetUp()
        {
            ServiceLocator.Reset();
        }

        [TearDown]
        public void TearDown()
        {
            ServiceLocator.Reset();
        }

        [Test]
        public void Get_ReturnsServiceRegisteredByInterface()
        {
            var service = new TestService();
            ServiceLocator.Register<ITestService>(service);

            Assert.AreSame(service, ServiceLocator.Get<ITestService>());
            Assert.IsTrue(ServiceLocator.IsRegistered<ITestService>());
        }

        [Test]
        public void Get_Missing_ReturnsNullAndLogsError()
        {
            LogAssert.Expect(LogType.Error, new Regex("ITestService is not registered"));

            Assert.IsNull(ServiceLocator.Get<ITestService>());
        }

        [Test]
        public void TryGet_Missing_ReturnsFalseWithoutLogging()
        {
            Assert.IsFalse(ServiceLocator.TryGet(out ITestService service));
            Assert.IsNull(service);
        }

        [Test]
        public void Register_Twice_ReplacesAndWarns()
        {
            var second = new TestService();
            ServiceLocator.Register<ITestService>(new TestService());

            LogAssert.Expect(LogType.Warning, new Regex("already registered"));
            ServiceLocator.Register<ITestService>(second);

            Assert.AreSame(second, ServiceLocator.Get<ITestService>());
        }

        [Test]
        public void Unregister_RemovesService()
        {
            ServiceLocator.Register<ITestService>(new TestService());
            ServiceLocator.Unregister<ITestService>();

            Assert.IsFalse(ServiceLocator.IsRegistered<ITestService>());
        }
    }
}
