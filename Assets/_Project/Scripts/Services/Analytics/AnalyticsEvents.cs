namespace NightExpress.Services.Analytics
{
    /// <summary>
    /// Every analytics event name, in one place. These are the events a publisher asks for to judge
    /// retention and the first-session funnel. snake_case, 40 characters max (the strictest SDK limit).
    /// </summary>
    public static class AnalyticsEvents
    {
        public const string SessionStart = "session_start";
        public const string SessionEnd = "session_end";
        public const string FtueStep = "ftue_step";
        public const string UnlockCompleted = "unlock_completed";
        public const string StaffHired = "staff_hired";
        public const string CarriageCoupled = "carriage_coupled";
        public const string StationResult = "station_result";
        public const string RouteLevelUp = "route_level_up";
        public const string RewardedOfferShown = "rewarded_offer_shown";
        public const string RewardedOfferAccepted = "rewarded_offer_accepted";
        public const string RewardedOfferCompleted = "rewarded_offer_completed";
        public const string InterstitialShown = "interstitial_shown";
        public const string IapOfferShown = "iap_offer_shown";
        public const string IapOfferPurchased = "iap_offer_purchased";
        public const string CurrencyEarned = "currency_earned";
        public const string CurrencySpent = "currency_spent";
    }
}
