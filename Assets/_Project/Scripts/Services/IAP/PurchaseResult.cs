namespace NightExpress.Services.IAP
{
    public enum PurchaseResult
    {
        /// <summary>Paid. The caller grants the content.</summary>
        Success,

        /// <summary>The player backed out. Never nag after this.</summary>
        Cancelled,

        Failed,

        /// <summary>A non-consumable the player already owns.</summary>
        AlreadyOwned,

        NotInitialized,

        UnknownProduct,
    }
}
