using System;
using NightExpress.Core;

namespace NightExpress.Tests
{
    public sealed class FakeClock : IClock
    {
        public FakeClock(DateTime start)
        {
            UtcNow = start;
        }

        public DateTime UtcNow { get; set; }

        public void Advance(TimeSpan by)
        {
            UtcNow += by;
        }
    }
}
