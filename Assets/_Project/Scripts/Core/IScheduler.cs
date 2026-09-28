using System;

namespace NightExpress.Core
{
    /// <summary>
    /// Runs a callback later on the main thread. Mock services use it to imitate SDK latency;
    /// tests swap in a manual scheduler to control exactly when callbacks fire.
    /// </summary>
    public interface IScheduler
    {
        /// <summary>Invokes <paramref name="callback"/> after <paramref name="realSeconds"/> of unscaled time.</summary>
        void RunAfter(float realSeconds, Action callback);
    }
}
