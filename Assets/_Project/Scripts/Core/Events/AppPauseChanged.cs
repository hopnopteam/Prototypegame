namespace NightExpress.Core
{
    /// <summary>
    /// The app went to the background (paused) or came back. On mobile this is the last reliable moment
    /// to save: the OS may kill a backgrounded app without ever calling quit.
    /// </summary>
    public readonly struct AppPauseChanged : IGameEvent
    {
        public readonly bool IsPaused;

        public AppPauseChanged(bool isPaused)
        {
            IsPaused = isPaused;
        }
    }
}
