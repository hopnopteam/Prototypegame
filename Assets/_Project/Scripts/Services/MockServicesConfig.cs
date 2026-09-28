using System.Collections.Generic;
using NightExpress.Services.RemoteConfig;
using UnityEngine;

namespace NightExpress.Services
{
    /// <summary>
    /// Behaviour of the stand-in services used until a publisher's SDKs are plugged in.
    /// Values are copied at startup, so toggling them in the developer panel never edits this asset.
    /// Edit: Assets/_Project/Data/Config/MockServicesConfig.asset
    /// </summary>
    [CreateAssetMenu(fileName = "MockServicesConfig", menuName = "Night Express/Config/Mock Services Config", order = 1)]
    public sealed class MockServicesConfig : ScriptableObject
    {
        private const int DefaultAnalyticsHistory = 30;

        [Header("Ads")]
        [Tooltip("Seconds a fake rewarded ad 'plays' before it completes.")]
        [Min(0f)]
        [SerializeField] private float rewardedAdSeconds = 2f;

        [Tooltip("Seconds a fake interstitial 'plays' before it closes.")]
        [Min(0f)]
        [SerializeField] private float interstitialAdSeconds = 1.5f;

        [Tooltip("Start with no ads available, to test the 'no fill' path (offers must fall back to gems or hide).")]
        [SerializeField] private bool simulateNoFill;

        [Tooltip("Rewarded ads end as 'skipped' (no reward), to test that path.")]
        [SerializeField] private bool simulateRewardedSkip;

        [Header("In-app purchases")]
        [Tooltip("Seconds the fake store takes to confirm a purchase.")]
        [Min(0f)]
        [SerializeField] private float purchaseDelaySeconds = 1f;

        [Tooltip("Purchases fail after the delay, to test the failure path.")]
        [SerializeField] private bool simulatePurchaseFailure;

        [Tooltip("Remember owned non-consumables between runs (PlayerPrefs), like a real store receipt.")]
        [SerializeField] private bool persistOwnedProducts = true;

        [Header("Analytics")]
        [Tooltip("Print every analytics event to the Console (Editor and Development Builds only).")]
        [SerializeField] private bool logAnalyticsToConsole = true;

        [Tooltip("How many recent events the developer panel keeps.")]
        [Min(1)]
        [SerializeField] private int analyticsHistorySize = DefaultAnalyticsHistory;

        [Header("Remote config")]
        [Tooltip("Values the offline remote config returns as if fetched from a server. Leave empty to use in-game defaults.")]
        [SerializeField] private List<RemoteConfigEntry> remoteConfigOverrides = new List<RemoteConfigEntry>();

        public float RewardedAdSeconds => rewardedAdSeconds;
        public float InterstitialAdSeconds => interstitialAdSeconds;
        public bool SimulateNoFill => simulateNoFill;
        public bool SimulateRewardedSkip => simulateRewardedSkip;
        public float PurchaseDelaySeconds => purchaseDelaySeconds;
        public bool SimulatePurchaseFailure => simulatePurchaseFailure;
        public bool PersistOwnedProducts => persistOwnedProducts;
        public bool LogAnalyticsToConsole => logAnalyticsToConsole;
        public int AnalyticsHistorySize => analyticsHistorySize;
        public IReadOnlyList<RemoteConfigEntry> RemoteConfigOverrides => remoteConfigOverrides;
    }
}
