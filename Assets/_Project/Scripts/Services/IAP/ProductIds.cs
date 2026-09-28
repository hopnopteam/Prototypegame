namespace NightExpress.Services.IAP
{
    /// <summary>
    /// Product ids that code needs to know by name (e.g. the First Class Ticket turns off forced ads).
    /// Everything else about a product lives in the <see cref="IAPCatalog"/> asset.
    /// </summary>
    public static class ProductIds
    {
        public const string FirstClassTicket = "first_class_ticket";
        public const string ConductorScooter = "conductor_scooter";

        /// <summary>Gem packs are "gems_tier_1" to "gems_tier_6".</summary>
        public const string GemsTierPrefix = "gems_tier_";
    }
}
