using UnityEditor;
using UnityEngine;

namespace NightExpress.EditorTools
{
    public static class ProjectSetupMenu
    {
        [MenuItem(SetupConstants.MenuRoot + "Setup/Run All Setup Steps", priority = 0)]
        public static void RunAll()
        {
            PlayerSettingsSetup.Apply();
            ConfigAssetsSetup.CreateOrUpdate();
            PlaceholderSceneBuilder.Create(true);
            ProjectValidator.Validate(true);
        }

        [MenuItem(SetupConstants.MenuRoot + "Setup/Switch Platform to Android", priority = 20)]
        public static void SwitchToAndroid()
        {
            if (EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android)
            {
                Debug.Log("[Setup] Active platform is already Android.");
                return;
            }

            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
            {
                EditorUtility.DisplayDialog(
                    "Android Build Support missing",
                    "Unity Hub > Installs > (your Unity 6 version) > Manage > Add modules > Android Build Support, " +
                    "including OpenJDK and Android SDK & NDK Tools. Then restart the Editor.",
                    "OK");
                return;
            }

            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
        }
    }
}
