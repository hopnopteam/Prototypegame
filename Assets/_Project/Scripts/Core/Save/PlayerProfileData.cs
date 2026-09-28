using System;

namespace NightExpress.Core.Save
{
    [Serializable]
    public sealed class PlayerProfileData
    {
        /// <summary>Random id created on first launch; the analytics user id until a publisher SDK provides one.</summary>
        public string installId;

        public int sessionCount;

        /// <summary>Foreground play time across all sessions. The ad policy (M7) uses it for "no forced ads before minute 10".</summary>
        public double lifetimePlaySeconds;
    }
}
