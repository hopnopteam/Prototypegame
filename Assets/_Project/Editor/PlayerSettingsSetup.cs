using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

namespace NightExpress.EditorTools
{
    /// <summary>
    /// Applies the Player Settings Night Express needs: identity, portrait-only, and a Google Play ready
    /// Android configuration (IL2CPP + ARM64, which Play requires for 64-bit support).
    /// Safe to run repeatedly; it never lowers a version number you have already bumped.
    /// </summary>
    public static class PlayerSettingsSetup
    {
        // Unity's defaults for a fresh project; only these get replaced by our initial version.
        private static readonly string[] DefaultVersions = { "", "0.1", "1.0" };

        [MenuItem(SetupConstants.MenuRoot + "Setup/1. Apply Player Settings (Android, Portrait)", priority = 1)]
        public static void Apply()
        {
            PlayerSettings.companyName = SetupConstants.CompanyName;
            PlayerSettings.productName = SetupConstants.ProductName;

            if (System.Array.IndexOf(DefaultVersions, PlayerSettings.bundleVersion) >= 0)
            {
                PlayerSettings.bundleVersion = SetupConstants.InitialVersion;
            }

            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, SetupConstants.ApplicationId);
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, SetupConstants.ApplicationId);

            // Portrait only: the train runs up the screen and the game is played one-handed.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.allowedAutorotateToPortrait = true;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;

            if (PlayerSettings.colorSpace != ColorSpace.Linear)
            {
                PlayerSettings.colorSpace = ColorSpace.Linear;
            }

            AssetDatabase.SaveAssets();
            Debug.Log($"[Setup] Player Settings applied: {SetupConstants.ProductName} ({SetupConstants.ApplicationId}), portrait, Android IL2CPP ARM64.");
        }
    }
}
