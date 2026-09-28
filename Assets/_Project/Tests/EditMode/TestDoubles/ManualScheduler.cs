using System;
using System.Collections.Generic;
using NightExpress.Core;

namespace NightExpress.Tests
{
    /// <summary>Collects delayed callbacks and runs them only when the test says so.</summary>
    public sealed class ManualScheduler : IScheduler
    {
        private readonly List<Action> _pending = new List<Action>();

        public int PendingCount => _pending.Count;

        public void RunAfter(float realSeconds, Action callback)
        {
            _pending.Add(callback);
        }

        public void RunAll()
        {
            var toRun = new List<Action>(_pending);
            _pending.Clear();
            foreach (Action callback in toRun)
            {
                callback();
            }
        }
    }
}
