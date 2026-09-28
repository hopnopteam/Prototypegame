using System;
using System.Collections.Generic;
using NightExpress.Core;
using UnityEngine;

namespace NightExpress.Services.IAP
{
    /// <summary>
    /// Fake store. Owned non-consumables are kept in PlayerPrefs, outside the save file, to mimic a real store:
    /// ownership survives a progress reset just as a real receipt survives a reinstall.
    /// </summary>
    public sealed class MockIAPService : IIAPService
    {
        private const string Tag = "IAP";
        private const string OwnedPrefsKey = "nx_mock_iap_owned";
        private const char OwnedSeparator = ',';

        private readonly IReadOnlyList<ProductDefinition> _products;
        private readonly IScheduler _scheduler;
        private readonly float _purchaseDelaySeconds;
        private readonly bool _persistOwnership;
        private readonly HashSet<string> _owned = new HashSet<string>();

        private bool _purchaseInFlight;

        public MockIAPService(IReadOnlyList<ProductDefinition> products, IScheduler scheduler, float purchaseDelaySeconds, bool persistOwnership)
        {
            _products = products ?? Array.Empty<ProductDefinition>();
            _scheduler = scheduler ?? throw new ArgumentNullException(nameof(scheduler));
            _purchaseDelaySeconds = Math.Max(0f, purchaseDelaySeconds);
            _persistOwnership = persistOwnership;
        }

        public bool IsInitialized { get; private set; }

        public IReadOnlyList<ProductDefinition> Products => _products;

        /// <summary>When true, purchases fail after the delay, to test the failure path.</summary>
        public bool SimulatePurchaseFailure { get; set; }

        /// <summary>Editor tool: forget mock ownership without entering play mode.</summary>
        public static void ClearPersistedOwnership()
        {
            PlayerPrefs.DeleteKey(OwnedPrefsKey);
            PlayerPrefs.Save();
        }

        public void Initialize(Action<bool> onComplete)
        {
            LoadOwned();
            IsInitialized = true;
            onComplete?.Invoke(true);
        }

        public string GetPriceLabel(string productId)
        {
            ProductDefinition product = Find(productId);
            return product != null ? product.MockPriceLabel : string.Empty;
        }

        public bool IsOwned(string productId)
        {
            return productId != null && _owned.Contains(productId);
        }

        public void Purchase(string productId, Action<PurchaseResult> onComplete)
        {
            if (!IsInitialized)
            {
                onComplete?.Invoke(PurchaseResult.NotInitialized);
                return;
            }

            ProductDefinition product = Find(productId);
            if (product == null)
            {
                GameLog.Error(Tag, $"Unknown product '{productId}'. Add it to the IAPCatalog asset.");
                onComplete?.Invoke(PurchaseResult.UnknownProduct);
                return;
            }

            if (product.Kind == ProductKind.NonConsumable && IsOwned(productId))
            {
                onComplete?.Invoke(PurchaseResult.AlreadyOwned);
                return;
            }

            if (_purchaseInFlight)
            {
                GameLog.Warn(Tag, $"Purchase of '{productId}' ignored: another purchase is in progress.");
                onComplete?.Invoke(PurchaseResult.Failed);
                return;
            }

            _purchaseInFlight = true;
            GameLog.Info(Tag, $"Mock purchase of '{productId}' ({product.MockPriceLabel}) started.");

            _scheduler.RunAfter(_purchaseDelaySeconds, () =>
            {
                _purchaseInFlight = false;

                if (SimulatePurchaseFailure)
                {
                    GameLog.Info(Tag, $"Mock purchase of '{productId}' failed (simulated).");
                    onComplete?.Invoke(PurchaseResult.Failed);
                    return;
                }

                if (product.Kind != ProductKind.Consumable)
                {
                    _owned.Add(productId);
                    SaveOwned();
                }

                GameLog.Info(Tag, $"Mock purchase of '{productId}' succeeded.");
                onComplete?.Invoke(PurchaseResult.Success);
            });
        }

        public void RestorePurchases(Action<bool> onComplete)
        {
            LoadOwned();
            onComplete?.Invoke(true);
        }

        /// <summary>Developer tool: forget every owned product in this run and in PlayerPrefs.</summary>
        public void ClearOwned()
        {
            _owned.Clear();
            if (_persistOwnership)
            {
                ClearPersistedOwnership();
            }
        }

        private ProductDefinition Find(string productId)
        {
            if (string.IsNullOrEmpty(productId))
            {
                return null;
            }

            for (int i = 0; i < _products.Count; i++)
            {
                if (_products[i] != null && _products[i].Id == productId)
                {
                    return _products[i];
                }
            }

            return null;
        }

        private void LoadOwned()
        {
            if (!_persistOwnership)
            {
                return;
            }

            _owned.Clear();
            string stored = PlayerPrefs.GetString(OwnedPrefsKey, string.Empty);
            string[] ids = stored.Split(new[] { OwnedSeparator }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < ids.Length; i++)
            {
                _owned.Add(ids[i]);
            }
        }

        private void SaveOwned()
        {
            if (!_persistOwnership)
            {
                return;
            }

            PlayerPrefs.SetString(OwnedPrefsKey, string.Join(OwnedSeparator.ToString(), _owned));
            PlayerPrefs.Save();
        }
    }
}
