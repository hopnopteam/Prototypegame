using NightExpress.Core.Save;
using NightExpress.Services;
using NightExpress.Services.IAP;
using UnityEngine;

namespace NightExpress.Core
{
    /// <summary>
    /// Root game settings. Lives in a Resources folder so <see cref="GameBootstrap"/> can load it before any
    /// scene, which makes every scene playable directly from the Editor.
    /// Edit: Assets/_Project/Resources/GameConfig.asset
    /// </summary>
    [CreateAssetMenu(fileName = "GameConfig", menuName = "Night Express/Config/Game Config", order = 0)]
    public sealed class GameConfig : ScriptableObject
    {
        public const string ResourcePath = "GameConfig";

        private const int MinFrameRate = 30;
        private const int MaxFrameRate = 120;

        [Header("Performance")]
        [Tooltip("Frame rate requested from the device. Android runs at 30 fps unless told otherwise.")]
        [Range(MinFrameRate, MaxFrameRate)]
        [SerializeField] private int targetFrameRate = 60;

        [Tooltip("Stop the screen dimming while the game is open, so idle players can watch their staff work.")]
        [SerializeField] private bool keepScreenOn = true;

        [Header("Session")]
        [Tooltip("Seconds in the background after which coming back counts as a new session (session count + analytics). " +
                 "Kept above a typical rewarded ad length so watching an ad never splits a session.")]
        [Min(1f)]
        [SerializeField] private float sessionTimeoutSeconds = 60f;

        [Header("Save")]
        [SerializeField] private SaveSettings save = new SaveSettings();

        [Header("Services (mocks until a publisher SDK is signed)")]
        [Tooltip("Timings and failure switches for the fake ads, purchases, analytics and remote config.")]
        [SerializeField] private MockServicesConfig mockServices;

        [Tooltip("Every in-app product the game sells. Ids must match the store listings once they exist.")]
        [SerializeField] private IAPCatalog iapCatalog;

        [Header("Developer")]
        [Tooltip("Show the developer panel (top-left button) in the Editor and Development Builds. Never shown in release builds.")]
        [SerializeField] private bool showDebugOverlay = true;

        public int TargetFrameRate => targetFrameRate;
        public bool KeepScreenOn => keepScreenOn;
        public float SessionTimeoutSeconds => sessionTimeoutSeconds;
        public SaveSettings SaveSettings => save;
        public MockServicesConfig MockServices => mockServices;
        public IAPCatalog IapCatalog => iapCatalog;
        public bool ShowDebugOverlay => showDebugOverlay;
    }
}
