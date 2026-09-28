using NightExpress.Core.Save;
using NightExpress.Core.Session;
using NightExpress.Services;
using NightExpress.Services.Ads;
using NightExpress.Services.Analytics;
using NightExpress.Services.IAP;
using NightExpress.Services.RemoteConfig;
using NightExpress.UI.DevTools;
using UnityEngine;

namespace NightExpress.Core
{
    /// <summary>
    /// Composition root. Runs automatically before the first scene loads, so pressing Play in any scene works.
    /// Builds every service once and registers it in the <see cref="ServiceLocator"/>. This is the only place
    /// that knows which implementation (mock or real SDK) backs each interface.
    /// </summary>
    public static class GameBootstrap
    {
        private const string Tag = "Bootstrap";
        private const string HostObjectName = "[Systems]";

        public static bool IsInitialized { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Initialize()
        {
            if (IsInitialized)
            {
                return;
            }

            GameConfig config = LoadConfig();
            ApplyPlatformSettings(config);

            var hostObject = new GameObject(HostObjectName);
            Object.DontDestroyOnLoad(hostObject);
            var host = hostObject.AddComponent<SystemsHost>();

            var events = new EventBus();
            var clock = new SystemClock();
            host.Initialize(events);

            ServiceLocator.Register(config);
            ServiceLocator.Register(events);
            ServiceLocator.Register<IClock>(clock);
            ServiceLocator.Register<IScheduler>(host);

            RegisterServices(config, host);

            var save = new SaveSystem(
                new FileSaveStorage(Application.persistentDataPath),
                config.SaveSettings,
                events,
                clock,
                SaveMigrations.All);
            ServiceLocator.Register(save);
            host.AddTickable(save);
            save.Load();

            var analytics = ServiceLocator.Get<IAnalyticsService>();
            analytics.Initialize(save.Data.profile.installId);

            var session = new SessionTracker(save, events, analytics, clock, config.SessionTimeoutSeconds);
            ServiceLocator.Register(session);
            host.AddTickable(session);
            session.StartSession();

            if (config.ShowDebugOverlay && (Application.isEditor || Debug.isDebugBuild))
            {
                hostObject.AddComponent<DebugOverlay>();
            }

            IsInitialized = true;
            GameLog.Info(Tag, $"Ready. Session #{session.SessionNumber}, save: {save.LastLoadOutcome}.");
        }

        private static GameConfig LoadConfig()
        {
            var config = Resources.Load<GameConfig>(GameConfig.ResourcePath);
            if (config != null)
            {
                return config;
            }

            GameLog.Error(Tag, "Resources/GameConfig.asset is missing. Run 'Night Express > Setup > Run All Setup Steps'. Using built-in defaults for now.");
            return ScriptableObject.CreateInstance<GameConfig>();
        }

        private static void ApplyPlatformSettings(GameConfig config)
        {
            // Mobile ignores vSync and uses this; without it Android caps the game at 30 fps.
            Application.targetFrameRate = config.TargetFrameRate;
            Screen.sleepTimeout = config.KeepScreenOn ? SleepTimeout.NeverSleep : SleepTimeout.SystemSetting;
        }

        private static void RegisterServices(GameConfig config, SystemsHost host)
        {
            MockServicesConfig mocks = config.MockServices;
            if (mocks == null)
            {
                GameLog.Error(Tag, "GameConfig has no MockServicesConfig assigned. Using defaults.");
                mocks = ScriptableObject.CreateInstance<MockServicesConfig>();
            }

            if (config.IapCatalog == null)
            {
                GameLog.Error(Tag, "GameConfig has no IAPCatalog assigned. The store will be empty.");
            }

            // Mocks until a publisher is signed; their SDK adapters will implement the same interfaces.
            var analytics = new MockAnalyticsService(mocks.LogAnalyticsToConsole, mocks.AnalyticsHistorySize);
            ServiceLocator.Register<IAnalyticsService>(analytics);

            var remoteConfig = new LocalRemoteConfig(mocks.RemoteConfigOverrides);
            ServiceLocator.Register<IRemoteConfig>(remoteConfig);
            remoteConfig.Fetch(null);

            var ads = new MockAdService(host, mocks.RewardedAdSeconds, mocks.InterstitialAdSeconds)
            {
                SimulateNoFill = mocks.SimulateNoFill,
                SimulateRewardedSkip = mocks.SimulateRewardedSkip,
            };
            ServiceLocator.Register<IAdService>(ads);
            ads.Initialize(null);

            var iap = new MockIAPService(config.IapCatalog != null ? config.IapCatalog.Products : null, host,
                mocks.PurchaseDelaySeconds, mocks.PersistOwnedProducts)
            {
                SimulatePurchaseFailure = mocks.SimulatePurchaseFailure,
            };
            ServiceLocator.Register<IIAPService>(iap);
            iap.Initialize(null);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlayModeEnter()
        {
            IsInitialized = false;
        }
    }
}
