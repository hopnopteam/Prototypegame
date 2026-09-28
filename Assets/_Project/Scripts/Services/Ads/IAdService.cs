using System;

namespace NightExpress.Services.Ads
{
    /// <summary>
    /// Raw ad playback. This layer only shows ads; it never decides when. Every rule about when an ad may
    /// appear (Departing phase only, not before minute 10, spacing...) belongs to AdPolicy (M7), and gameplay
    /// must go through AdPolicy rather than calling this directly.
    /// </summary>
    public interface IAdService
    {
        bool IsInitialized { get; }

        /// <summary>True while an ad covers the screen. Gameplay and audio should pause while it is.</summary>
        bool IsShowing { get; }

        void Initialize(Action<bool> onComplete);

        bool IsRewardedReady(string placement);

        bool IsInterstitialReady(string placement);

        void ShowRewarded(string placement, Action<AdResult> onComplete);

        void ShowInterstitial(string placement, Action<AdResult> onComplete);
    }
}
