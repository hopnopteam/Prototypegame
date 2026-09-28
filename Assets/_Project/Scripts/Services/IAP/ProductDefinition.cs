using System;
using UnityEngine;

namespace NightExpress.Services.IAP
{
    [Serializable]
    public sealed class ProductDefinition
    {
        [Tooltip("Store product id. Must match Google Play / App Store exactly once the listings exist.")]
        [SerializeField] private string id;

        [Tooltip("Consumable (gem packs) or NonConsumable (First Class Ticket, Scooter).")]
        [SerializeField] private ProductKind kind;

        [Tooltip("Price text the mock store shows. Real builds display the store's localised price instead.")]
        [SerializeField] private string mockPriceLabel;

        public ProductDefinition()
        {
        }

        public ProductDefinition(string id, ProductKind kind, string mockPriceLabel)
        {
            this.id = id;
            this.kind = kind;
            this.mockPriceLabel = mockPriceLabel;
        }

        public string Id => id;
        public ProductKind Kind => kind;
        public string MockPriceLabel => mockPriceLabel;
    }
}
