using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using NightExpress.Core;

namespace NightExpress.Services.Analytics
{
    /// <summary>
    /// Stand-in analytics: logs events to the console (Editor/Development builds) and keeps the most recent
    /// ones for the developer panel. Also warns about names that real SDKs would reject.
    /// </summary>
    public sealed class MockAnalyticsService : IAnalyticsService
    {
        private const string Tag = "Analytics";
        private const int MaxNameLength = 40;
        private const int BuilderCapacity = 128;

        private readonly bool _logToConsole;
        private readonly int _historySize;
        private readonly Queue<string> _history;
        private readonly StringBuilder _builder = new StringBuilder(BuilderCapacity);

        public MockAnalyticsService(bool logToConsole, int historySize)
        {
            _logToConsole = logToConsole;
            _historySize = Math.Max(1, historySize);
            _history = new Queue<string>(_historySize);
        }

        public string UserId { get; private set; }

        public int TotalEventsLogged { get; private set; }

        /// <summary>Most recent events, oldest first.</summary>
        public IReadOnlyCollection<string> RecentEvents => _history;

        public void Initialize(string userId)
        {
            UserId = userId;
            if (_logToConsole)
            {
                GameLog.Info(Tag, $"Mock analytics initialised for user {userId}.");
            }
        }

        public void LogEvent(string eventName)
        {
            LogEvent(eventName, null);
        }

        public void LogEvent(string eventName, IReadOnlyDictionary<string, object> parameters)
        {
            if (!IsValidName(eventName))
            {
                GameLog.Error(Tag, $"Invalid event name '{eventName}'. Use snake_case, max {MaxNameLength} characters (see AnalyticsEvents).");
                return;
            }

            string line = Format(eventName, parameters);

            if (_history.Count >= _historySize)
            {
                _history.Dequeue();
            }

            _history.Enqueue(line);
            TotalEventsLogged++;

            if (_logToConsole)
            {
                GameLog.Info(Tag, line);
            }
        }

        private string Format(string eventName, IReadOnlyDictionary<string, object> parameters)
        {
            _builder.Clear();
            _builder.Append(eventName);

            if (parameters == null || parameters.Count == 0)
            {
                return _builder.ToString();
            }

            _builder.Append(" {");
            bool first = true;
            foreach (KeyValuePair<string, object> pair in parameters)
            {
                if (!first)
                {
                    _builder.Append(", ");
                }

                first = false;
                _builder.Append(pair.Key).Append('=').Append(Convert.ToString(pair.Value, CultureInfo.InvariantCulture));
            }

            _builder.Append('}');
            return _builder.ToString();
        }

        private static bool IsValidName(string eventName)
        {
            if (string.IsNullOrEmpty(eventName) || eventName.Length > MaxNameLength)
            {
                return false;
            }

            for (int i = 0; i < eventName.Length; i++)
            {
                char c = eventName[i];
                bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
                if (!allowed)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
