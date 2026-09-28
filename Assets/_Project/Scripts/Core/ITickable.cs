namespace NightExpress.Core
{
    /// <summary>
    /// A plain C# system that needs a per-frame update. Ticked by <see cref="SystemsHost"/>,
    /// which keeps game systems out of MonoBehaviours and therefore unit-testable.
    /// </summary>
    public interface ITickable
    {
        void Tick(float unscaledDeltaTime);
    }
}
