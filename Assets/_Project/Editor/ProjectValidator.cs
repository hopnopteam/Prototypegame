using System.Text;
using NightExpress.Core;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;

namespace NightExpress.EditorTools
{
    /// <summary>Checks everything M0 depends on and reports what is missing, in plain language.</summary>
    public static class ProjectValidator
    {
        [MenuItem(SetupConstants.MenuRoot + "Validate Project Setup", priority = 100)]
        public static void ValidateFromMenu()
        {
            Validate(true);
        }

        /// <summary>Returns true when every required check passes. Warnings don't fail validation.</summary>
        public static bool Validate(bool showDialog)
        {
            var report = new StringBuilder();
            int failures = 0;

            RenderPipelineAsset pipeline = GraphicsSettings.currentRenderPipeline;
            bool isUrp = pipeline != null && pipeline.GetType().Name.Contains("Universal");
            Check(report, ref failures, isUrp, "URP is the active render pipeline",
                "Create the project from Unity Hub's 'Universal 3D' template (see README).");

            var gameConfig = AssetDatabase.LoadAssetAtPath<GameConfig>(SetupConstants.GameConfigPath);
            Check(report, ref failures, gameConfig != null, "GameConfig exists in Resources",
                "Run Night Express > Setup > 2. Create Config Assets.");
            if (gameConfig != null)
            {
                Check(report, ref failures, gameConfig.MockServices != null && gameConfig.IapCatalog != null,
                    "GameConfig references MockServicesConfig and IAPCatalog", "Run Night Express > Setup > 2. Create Config Assets.");
            }

            Check(report, ref failures, IsGameSceneInBuild(), "Game scene exists and is in the build",
                "Run Night Express > Setup > 3. Create Placeholder Game Scene.");

            Check(report, ref failures, PlayerSettings.defaultInterfaceOrientation == UIOrientation.Portrait,
                "Orientation is Portrait", "Run Night Express > Setup > 1. Apply Player Settings.");
            Check(report, ref failures, PlayerSettings.GetApplicationIdentifier(NamedBuildTarget.Android) == SetupConstants.ApplicationId,
                $"Android application id is {SetupConstants.ApplicationId}", "Run Night Express > Setup > 1. Apply Player Settings.");
            Check(report, ref failures, PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android) == ScriptingImplementation.IL2CPP,
                "Android scripting backend is IL2CPP", "Run Night Express > Setup > 1. Apply Player Settings.");
            Check(report, ref failures, (PlayerSettings.Android.targetArchitectures & AndroidArchitecture.ARM64) != 0,
                "Android builds include ARM64", "Run Night Express > Setup > 1. Apply Player Settings.");
            Check(report, ref failures, PlayerSettings.colorSpace == ColorSpace.Linear,
                "Color space is Linear", "Run Night Express > Setup > 1. Apply Player Settings.");

            bool isAndroid = EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android;
            report.AppendLine(isAndroid
                ? "OK    Active platform is Android"
                : "WARN  Active platform is not Android yet. Use Night Express > Setup > Switch Platform to Android.");

            string summary = failures == 0
                ? "All required checks passed."
                : $"{failures} check(s) failed. Fix them and validate again.";
            string message = report + "\n" + summary;

            if (failures == 0)
            {
                Debug.Log("[Setup] Validation passed.\n" + message);
            }
            else
            {
                Debug.LogError("[Setup] Validation failed.\n" + message);
            }

            if (showDialog)
            {
                EditorUtility.DisplayDialog("Night Express setup", message, "OK");
            }

            return failures == 0;
        }

        private static bool IsGameSceneInBuild()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(SetupConstants.GameScenePath) == null)
            {
                return false;
            }

            foreach (EditorBuildSettingsScene scene in EditorBuildSettings.scenes)
            {
                if (scene.enabled && scene.path == SetupConstants.GameScenePath)
                {
                    return true;
                }
            }

            return false;
        }

        private static void Check(StringBuilder report, ref int failures, bool passed, string description, string fix)
        {
            if (passed)
            {
                report.AppendLine("OK    " + description);
                return;
            }

            failures++;
            report.AppendLine("FAIL  " + description + "\n      Fix: " + fix);
        }
    }
}
