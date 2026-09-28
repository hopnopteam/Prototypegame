namespace NightExpress.Core
{
    /// <summary>
    /// The app is quitting cleanly. Not guaranteed on mobile (the OS can kill a backgrounded app),
    /// so never rely on this alone for saving; <see cref="AppPauseChanged"/> is the primary save point.
    /// </summary>
    public readonly struct AppQuitting : IGameEvent
    {
    }
}
