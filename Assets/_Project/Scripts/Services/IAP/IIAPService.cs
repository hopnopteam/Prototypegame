using System;
using System.Collections.Generic;

namespace NightExpress.Services.IAP
{
    /// <summary>
    /// Store access. This layer only talks to the store; granting gems or removing ads on
    /// <see cref="PurchaseResult.Success"/> is the caller's job (M7), so the real SDK can replace the mock
    /// without touching reward logic.
    /// </summary>
    public interface IIAPService
    {
        bool IsInitialized { get; }

        IReadOnlyList<ProductDefinition> Products { get; }

        void Initialize(Action<bool> onComplete);

        /// <summary>Localised price text for a product, or an empty string if unknown.</summary>
        string GetPriceLabel(string productId);

        /// <summary>True for non-consumables the player owns, e.g. the First Class Ticket.</summary>
        bool IsOwned(string productId);

        void Purchase(string productId, Action<PurchaseResult> onComplete);

        /// <summary>Required by the App Store for non-consumables; restores ownership after a reinstall.</summary>
        void RestorePurchases(Action<bool> onComplete);
    }
}
