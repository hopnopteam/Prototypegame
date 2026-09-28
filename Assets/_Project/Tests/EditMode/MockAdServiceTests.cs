using NightExpress.Services.Ads;
using NUnit.Framework;

namespace NightExpress.Tests
{
    public sealed class MockAdServiceTests
    {
        private const string Placement = "test";

        private ManualScheduler _scheduler;
        private MockAdService _ads;

        [SetUp]
        public void SetUp()
        {
            _scheduler = new ManualScheduler();
            _ads = new MockAdService(_scheduler, 1f, 1f);
            _ads.Initialize(null);
        }

        [Test]
        public void Rewarded_CompletesAfterDelay_AndIsShowingMeanwhile()
        {
            AdResult? result = null;

            _ads.ShowRewarded(Placement, r => result = r);

            Assert.IsTrue(_ads.IsShowing);
            Assert.IsNull(result);

            _scheduler.RunAll();

            Assert.IsFalse(_ads.IsShowing);
            Assert.AreEqual(AdResult.Completed, result);
        }

        [Test]
        public void NoFill_ReturnsNotAvailableImmediately()
        {
            _ads.SimulateNoFill = true;
            AdResult? result = null;

            _ads.ShowRewarded(Placement, r => result = r);

            Assert.AreEqual(AdResult.NotAvailable, result);
            Assert.IsFalse(_ads.IsRewardedReady(Placement));
            Assert.AreEqual(0, _scheduler.PendingCount);
        }

        [Test]
        public void SimulatedSkip_EndsRewardedAsSkipped_ButInterstitialCompletes()
        {
            _ads.SimulateRewardedSkip = true;
            AdResult? rewarded = null;
            AdResult? interstitial = null;

            _ads.ShowRewarded(Placement, r => rewarded = r);
            _scheduler.RunAll();
            _ads.ShowInterstitial(Placement, r => interstitial = r);
            _scheduler.RunAll();

            Assert.AreEqual(AdResult.Skipped, rewarded);
            Assert.AreEqual(AdResult.Completed, interstitial);
        }

        [Test]
        public void SecondAdWhileShowing_Fails()
        {
            AdResult? second = null;
            _ads.ShowRewarded(Placement, null);

            UnityEngine.TestTools.LogAssert.Expect(UnityEngine.LogType.Warning, new System.Text.RegularExpressions.Regex("still showing"));
            _ads.ShowInterstitial(Placement, r => second = r);

            Assert.AreEqual(AdResult.Failed, second);
        }

        [Test]
        public void BeforeInitialize_NotReady()
        {
            var ads = new MockAdService(_scheduler, 1f, 1f);

            Assert.IsFalse(ads.IsRewardedReady(Placement));
            Assert.IsFalse(ads.IsInterstitialReady(Placement));
        }
    }
}
