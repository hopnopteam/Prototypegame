namespace NightExpress.Core
{
    /// <summary>
    /// The app lost or regained focus (e.g. notification shade, system dialog). Focus can be lost without
    /// the app pausing, so this is kept separate from <see cref="AppPauseChanged"/>.
    /// </summary>
    public readonly struct AppFocusChanged : IGameEvent
    {
        public readonly bool HasFocus;

        public AppFocusChanged(bool hasFocus)
        {
            HasFocus = hasFocus;
        }
    }
}
