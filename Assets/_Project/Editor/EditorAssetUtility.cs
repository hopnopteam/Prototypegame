using UnityEditor;
using UnityEngine;

namespace NightExpress.EditorTools
{
    internal static class EditorAssetUtility
    {
        /// <summary>Creates every missing folder along a project-relative path such as "Assets/_Project/Data/Config".</summary>
        public static void EnsureFolder(string folderPath)
        {
            if (AssetDatabase.IsValidFolder(folderPath))
            {
                return;
            }

            string[] parts = folderPath.Split('/');
            string current = parts[0];
            for (int i = 1; i < parts.Length; i++)
            {
                string next = current + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, parts[i]);
                }

                current = next;
            }
        }

        /// <summary>Loads the asset at <paramref name="path"/>, creating it first if it doesn't exist.</summary>
        public static T LoadOrCreate<T>(string path, out bool created) where T : ScriptableObject
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                created = false;
                return existing;
            }

            int lastSlash = path.LastIndexOf('/');
            EnsureFolder(path.Substring(0, lastSlash));

            var asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
            created = true;
            return asset;
        }
    }
}
