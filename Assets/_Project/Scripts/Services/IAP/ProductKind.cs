namespace NightExpress.Services.IAP
{
    public enum ProductKind
    {
        /// <summary>Can be bought repeatedly (gem packs).</summary>
        Consumable,

        /// <summary>Bought once, owned forever, restorable (First Class Ticket, Conductor's Scooter).</summary>
        NonConsumable,

        /// <summary>Recurring (a possible Grand Tour Pass later).</summary>
        Subscription,
    }
}
