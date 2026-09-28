using System.Collections.Generic;
using UnityEngine;

namespace NightExpress.Services.IAP
{
    /// <summary>
    /// Every product the game sells. Data, not code, so offers can change without a rebuild of gameplay logic.
    /// Edit: Assets/_Project/Data/Config/IAPCatalog.asset
    /// </summary>
    [CreateAssetMenu(fileName = "IAPCatalog", menuName = "Night Express/Config/IAP Catalog", order = 2)]
    public sealed class IAPCatalog : ScriptableObject
    {
        [SerializeField] private List<ProductDefinition> products = new List<ProductDefinition>();

        public IReadOnlyList<ProductDefinition> Products => products;

        public bool TryGet(string productId, out ProductDefinition product)
        {
            for (int i = 0; i < products.Count; i++)
            {
                if (products[i] != null && products[i].Id == productId)
                {
                    product = products[i];
                    return true;
                }
            }

            product = null;
            return false;
        }

        private void OnValidate()
        {
            // Duplicate ids would make purchases grant the wrong product; catch it the moment it's typed.
            var seen = new HashSet<string>();
            for (int i = 0; i < products.Count; i++)
            {
                string productId = products[i]?.Id;
                if (string.IsNullOrEmpty(productId))
                {
                    continue;
                }

                if (!seen.Add(productId))
                {
                    Debug.LogError($"[IAPCatalog] Duplicate product id '{productId}'.", this);
                }
            }
        }
    }
}
