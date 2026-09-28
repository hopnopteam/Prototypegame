namespace NightExpress.Core
{
    /// <summary>
    /// The player came back to a backgrounded app. Offline earnings (M5) listen to this.
    /// For a cold start, read <see cref="Save.SaveSystem.SecondsAwayOnLaunch"/> instead: it is known before
    /// any scene system exists to receive an event.
    /// </summary>
    public readonly struct PlayerReturned : IGameEvent
    {
        public readonly double SecondsAway;

        public PlayerReturned(double secondsAway)
        {
            SecondsAway = secondsAway;
        }
    }
}
