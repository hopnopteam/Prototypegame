using NightExpress.Core;
using NightExpress.Services;
using NightExpress.Services.IAP;
using UnityEditor;
using UnityEngine;

namespace NightExpress.EditorTools
{
    /// <summary>
    /// Creates the config assets and wires them into GameConfig. Existing assets and values are kept,
    /// so re-running never overwrites tuning.
    /// </summary>
    public static class ConfigAssetsSetup
    {
        private const int GemTierCount = 6;

        // Placeholder price points for the mock store only; real prices come from the store listings (M7).
        private const string FirstClassTicketPrice = "$4.99";
        private const string ConductorScooterPrice = "$6.99";
        private static readonly string[] GemTierPrices = { "$0.99", "$4.99", "$9.99", "$19.99", "$49.99", "$99.99" };

        [MenuItem(SetupConstants.MenuRoot + "Setup/2. Create Config Assets", priority = 2)]
        public static void CreateOrUpdate()
        {
            var mockServices = EditorAssetUtility.LoadOrCreate<MockServicesConfig>(SetupConstants.MockServicesConfigPath, out _);
            var catalog = EditorAssetUtility.LoadOrCreate<IAPCatalog>(SetupConstants.IapCatalogPath, out bool catalogCreated);
            if (catalogCreated)
            {
                PopulateCatalog(catalog);
            }

            var gameConfig = EditorAssetUtility.LoadOrCreate<GameConfig>(SetupConstants.GameConfigPath, out _);
            var serialized = new SerializedObject(gameConfig);
            AssignIfEmpty(serialized, "mockServices", mockServices);
            AssignIfEmpty(serialized, "iapCatalog", catalog);
            serialized.ApplyModifiedPropertiesWithoutUndo();

            EditorUtility.SetDirty(gameConfig);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Setup] Config assets ready: {SetupConstants.GameConfigPath}, {SetupConstants.MockServicesConfigPath}, {SetupConstants.IapCatalogPath}.", gameConfig);
        }

        private static void AssignIfEmpty(SerializedObject serialized, string propertyName, Object value)
        {
            SerializedProperty property = serialized.FindProperty(propertyName);
            if (property == null)
            {
                Debug.LogError($"[Setup] GameConfig has no serialized field '{propertyName}'. Did the field get renamed?");
                return;
            }

            if (property.objectReferenceValue == null)
            {
                property.objectReferenceValue = value;
            }
        }

        private static void PopulateCatalog(IAPCatalog catalog)
        {
            var serialized = new SerializedObject(catalog);
            SerializedProperty products = serialized.FindProperty("products");
            products.ClearArray();

            AddProduct(products, ProductIds.FirstClassTicket, ProductKind.NonConsumable, FirstClassTicketPrice);
            AddProduct(products, ProductIds.ConductorScooter, ProductKind.NonConsumable, ConductorScooterPrice);
            for (int tier = 1; tier <= GemTierCount; tier++)
            {
                AddProduct(products, ProductIds.GemsTierPrefix + tier, ProductKind.Consumable, GemTierPrices[tier - 1]);
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
        }

        private static void AddProduct(SerializedProperty products, string id, ProductKind kind, string mockPrice)
        {
            int index = products.arraySize;
            products.InsertArrayElementAtIndex(index);
            SerializedProperty element = products.GetArrayElementAtIndex(index);
            element.FindPropertyRelative("id").stringValue = id;
            element.FindPropertyRelative("kind").enumValueIndex = (int)kind;
            element.FindPropertyRelative("mockPriceLabel").stringValue = mockPrice;
        }
    }
}
