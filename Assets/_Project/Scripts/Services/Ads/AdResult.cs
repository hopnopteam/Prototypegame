namespace NightExpress.Services.Ads
{
    public enum AdResult
    {
        /// <summary>Rewarded: the player earned the reward. Interstitial: shown and closed.</summary>
        Completed,

        /// <summary>Rewarded ad closed early. No reward, and never a penalty.</summary>
        Skipped,

        /// <summary>No ad to show (no fill). Offers should fall back to gems or hide.</summary>
        NotAvailable,

        /// <summary>Something went wrong while showing.</summary>
        Failed,
    }
}
