using System;

namespace NightExpress.Core
{
    /// <summary>
    /// Wall-clock time source. Abstracted so offline-time and session logic can be unit tested with a fake clock.
    /// </summary>
    public interface IClock
    {
        DateTime UtcNow { get; }
    }
}
