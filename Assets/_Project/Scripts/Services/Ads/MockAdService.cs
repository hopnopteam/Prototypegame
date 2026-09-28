using System;
using NightExpress.Core;

namespace NightExpress.Services.Ads
{
    /// <summary>
    /// Fake ads that "play" for a configurable time, then complete. The switches let us test every result path
    /// (no fill, skipped) before a real SDK exists. The developer panel draws a placeholder while one is showing.
    /// </summary>
    public sealed class MockAdService : IAdService
    {
        private const string Tag = "Ads";

        private readonly IScheduler _scheduler;
        private readonly float _rewardedSeconds;
        private readonly float _interstitialSeconds;

        public MockAdService(IScheduler scheduler, float rewardedSeconds, float interstitialSeconds)
        {
            _scheduler = scheduler ?? throw new ArgumentNullException(nameof(scheduler));
            _rewardedSeconds = Math.Max(0f, rewardedSeconds);
            _interstitialSeconds = Math.Max(0f, interstitialSeconds);
        }

        public bool IsInitialized { get; private set; }

        public bool IsShowing { get; private set; }

        /// <summary>Placement of the ad currently showing, for the developer panel placeholder.</summary>
        public string CurrentPlacement { get; private set; }

        public bool CurrentIsRewarded { get; private set; }

        /// <summary>When true, no ad is ever available.</summary>
        public bool SimulateNoFill { get; set; }

        /// <summary>When true, rewarded ads end as <see cref="AdResult.Skipped"/>.</summary>
        public bool SimulateRewardedSkip { get; set; }

        public void Initialize(Action<bool> onComplete)
        {
            IsInitialized = true;
            onComplete?.Invoke(true);
        }

        public bool IsRewardedReady(string placement)
        {
            return IsReady();
        }

        public bool IsInterstitialReady(string placement)
        {
            return IsReady();
        }

        public void ShowRewarded(string placement, Action<AdResult> onComplete)
        {
            Show(placement, true, _rewardedSeconds, onComplete);
        }

        public void ShowInterstitial(string placement, Action<AdResult> onComplete)
        {
            Show(placement, false, _interstitialSeconds, onComplete);
        }

        private bool IsReady()
        {
            return IsInitialized && !IsShowing && !SimulateNoFill;
        }

        private void Show(string placement, bool rewarded, float durationSeconds, Action<AdResult> onComplete)
        {
            if (!IsInitialized)
            {
                GameLog.Warn(Tag, $"Ad '{placement}' requested before Initialize().");
                onComplete?.Invoke(AdResult.Failed);
                return;
            }

            if (IsShowing)
            {
                GameLog.Warn(Tag, $"Ad '{placement}' requested while '{CurrentPlacement}' is still showing.");
                onComplete?.Invoke(AdResult.Failed);
                return;
            }

            if (SimulateNoFill)
            {
                GameLog.Info(Tag, $"Mock no-fill for '{placement}'.");
                onComplete?.Invoke(AdResult.NotAvailable);
                return;
            }

            IsShowing = true;
            CurrentPlacement = placement;
            CurrentIsRewarded = rewarded;
            GameLog.Info(Tag, $"Mock {(rewarded ? "rewarded" : "interstitial")} '{placement}' playing for {durationSeconds:0.#}s.");

            _scheduler.RunAfter(durationSeconds, () =>
            {
                IsShowing = false;
                CurrentPlacement = null;
                AdResult result = rewarded && SimulateRewardedSkip ? AdResult.Skipped : AdResult.Completed;
                GameLog.Info(Tag, $"Mock ad '{placement}' finished: {result}.");
                onComplete?.Invoke(result);
            });
        }
    }
}
