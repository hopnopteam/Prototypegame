namespace NightExpress.EditorTools
{
    /// <summary>Project identity and asset paths used by the setup tools. Change identity here, then re-run setup.</summary>
    internal static class SetupConstants
    {
        public const string MenuRoot = "Night Express/";

        public const string CompanyName = "Hopnop";
        public const string ProductName = "Night Express";
        public const string ApplicationId = "com.hopnop.nightexpress";
        public const string InitialVersion = "0.1.0";

        public const string ProjectRoot = "Assets/_Project";
        public const string ConfigFolder = ProjectRoot + "/Data/Config";
        public const string ResourcesFolder = ProjectRoot + "/Resources";
        public const string ScenesFolder = ProjectRoot + "/Scenes";
        public const string PlaceholderMaterialsFolder = ProjectRoot + "/Art/Materials/Placeholder";

        public const string GameConfigPath = ResourcesFolder + "/GameConfig.asset";
        public const string MockServicesConfigPath = ConfigFolder + "/MockServicesConfig.asset";
        public const string IapCatalogPath = ConfigFolder + "/IAPCatalog.asset";
        public const string GameScenePath = ScenesFolder + "/Game.unity";
    }
}
