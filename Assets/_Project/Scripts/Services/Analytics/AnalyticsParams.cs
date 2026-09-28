namespace NightExpress.Services.Analytics
{
    /// <summary>Analytics parameter keys. Add keys here as milestones add events; never inline strings.</summary>
    public static class AnalyticsParams
    {
        public const string SessionNumber = "session_number";
        public const string SessionSeconds = "session_seconds";
        public const string LifetimeMinutes = "lifetime_minutes";
    }
}
