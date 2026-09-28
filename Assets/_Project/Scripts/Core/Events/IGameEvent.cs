namespace NightExpress.Core
{
    /// <summary>
    /// Marker for anything published on the <see cref="EventBus"/>.
    /// Events are structs so publishing never allocates, even from hot gameplay paths.
    /// </summary>
    public interface IGameEvent
    {
    }
}
