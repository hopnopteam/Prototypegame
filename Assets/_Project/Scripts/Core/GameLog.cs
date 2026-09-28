using System.Diagnostics;
using Debug = UnityEngine.Debug;

namespace NightExpress.Core
{
    /// <summary>
    /// Tagged logging. Info logs are compiled out of release builds (including the string building at the
    /// call site), so they cost nothing on players' phones. Warnings and errors always log.
    /// </summary>
    public static class GameLog
    {
        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD")]
        public static void Info(string tag, string message, UnityEngine.Object context = null)
        {
            Debug.Log(Format(tag, message), context);
        }

        public static void Warn(string tag, string message, UnityEngine.Object context = null)
        {
            Debug.LogWarning(Format(tag, message), context);
        }

        public static void Error(string tag, string message, UnityEngine.Object context = null)
        {
            Debug.LogError(Format(tag, message), context);
        }

        private static string Format(string tag, string message)
        {
            return "[" + tag + "] " + message;
        }
    }
}
