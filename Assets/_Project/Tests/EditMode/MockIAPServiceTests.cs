using System.Text.RegularExpressions;
using NightExpress.Services.IAP;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class MockIAPServiceTests
    {
        private const string GemPack = "gems_tier_1";

        private ManualScheduler _scheduler;
        private MockIAPService _iap;

        [SetUp]
        public void SetUp()
        {
            _scheduler = new ManualScheduler();
            var products = new[]
            {
                new ProductDefinition(ProductIds.FirstClassTicket, ProductKind.NonConsumable, "$4.99"),
                new ProductDefinition(GemPack, ProductKind.Consumable, "$0.99"),
            };

            // persistOwnership: false keeps tests out of PlayerPrefs.
            _iap = new MockIAPService(products, _scheduler, 1f, false);
            _iap.Initialize(null);
        }

        [Test]
        public void NonConsumable_IsOwnedAfterPurchase()
        {
            PurchaseResult? result = null;

            _iap.Purchase(ProductIds.FirstClassTicket, r => result = r);
            Assert.IsFalse(_iap.IsOwned(ProductIds.FirstClassTicket), "Ownership must wait for the store to confirm.");

            _scheduler.RunAll();

            Assert.AreEqual(PurchaseResult.Success, result);
            Assert.IsTrue(_iap.IsOwned(ProductIds.FirstClassTicket));
        }

        [Test]
        public void NonConsumable_BuyingAgain_ReturnsAlreadyOwned()
        {
            _iap.Purchase(ProductIds.FirstClassTicket, null);
            _scheduler.RunAll();
            PurchaseResult? second = null;

            _iap.Purchase(ProductIds.FirstClassTicket, r => second = r);

            Assert.AreEqual(PurchaseResult.AlreadyOwned, second);
        }

        [Test]
        public void Consumable_CanBeBoughtRepeatedly_AndIsNeverOwned()
        {
            _iap.Purchase(GemPack, null);
            _scheduler.RunAll();
            PurchaseResult? second = null;

            _iap.Purchase(GemPack, r => second = r);
            _scheduler.RunAll();

            Assert.AreEqual(PurchaseResult.Success, second);
            Assert.IsFalse(_iap.IsOwned(GemPack));
        }

        [Test]
        public void SimulatedFailure_DoesNotGrantOwnership()
        {
            _iap.SimulatePurchaseFailure = true;
            PurchaseResult? result = null;

            _iap.Purchase(ProductIds.FirstClassTicket, r => result = r);
            _scheduler.RunAll();

            Assert.AreEqual(PurchaseResult.Failed, result);
            Assert.IsFalse(_iap.IsOwned(ProductIds.FirstClassTicket));
        }

        [Test]
        public void UnknownProduct_IsRejected()
        {
            PurchaseResult? result = null;

            LogAssert.Expect(LogType.Error, new Regex("Unknown product"));
            _iap.Purchase("does_not_exist", r => result = r);

            Assert.AreEqual(PurchaseResult.UnknownProduct, result);
        }

        [Test]
        public void GetPriceLabel_ReturnsCatalogLabel()
        {
            Assert.AreEqual("$4.99", _iap.GetPriceLabel(ProductIds.FirstClassTicket));
            Assert.AreEqual(string.Empty, _iap.GetPriceLabel("does_not_exist"));
        }
    }
}
