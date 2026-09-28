using NightExpress.Core;
using NightExpress.Core.Save;
using NightExpress.Services.IAP;
using UnityEditor;
using UnityEngine;

namespace NightExpress.EditorTools
{
    public static class SaveToolsMenu
    {
        [MenuItem(SetupConstants.MenuRoot + "Save/Open Save Folder", priority = 200)]
        public static void OpenSaveFolder()
        {
            EditorUtility.RevealInFinder(Application.persistentDataPath);
        }

        [MenuItem(SetupConstants.MenuRoot + "Save/Delete Save File", priority = 201)]
        public static void DeleteSave()
        {
            if (EditorApplication.isPlaying)
            {
                // The running game would write its in-memory copy straight back on the next save.
                EditorUtility.DisplayDialog("Stop play mode first", "Exit play mode, then delete the save.", "OK");
                return;
            }

            var gameConfig = AssetDatabase.LoadAssetAtPath<GameConfig>(SetupConstants.GameConfigPath);
            string key = gameConfig != null ? gameConfig.SaveSettings.FileKey : SaveSettings.DefaultFileKey;

            new FileSaveStorage(Application.persistentDataPath).Delete(key);
            Debug.Log($"[Save] Deleted '{key}' from {Application.persistentDataPath}. Next play starts as a new player.");
        }

        [MenuItem(SetupConstants.MenuRoot + "Save/Clear Mock Purchases", priority = 202)]
        public static void ClearMockPurchases()
        {
            MockIAPService.ClearPersistedOwnership();
            Debug.Log("[IAP] Mock purchases cleared.");
        }
    }
}
