using System;
using System.Collections.Generic;
using UnityEngine;

namespace NightExpress.Core
{
    /// <summary>
    /// Minimal registry for game-wide services (save, ads, analytics...). Filled once by <see cref="GameBootstrap"/>.
    /// Resolve services in Awake/Start and cache them; never call <see cref="Get{T}"/> inside Update loops.
    /// Registering by interface is what lets the publisher's real SDKs replace the mocks without touching gameplay code.
    /// </summary>
    public static class ServiceLocator
    {
        private const string Tag = "ServiceLocator";

        private static readonly Dictionary<Type, object> Services = new Dictionary<Type, object>();

        public static void Register<T>(T service) where T : class
        {
            if (service == null)
            {
                GameLog.Error(Tag, $"Tried to register a null {typeof(T).Name}.");
                return;
            }

            if (Services.ContainsKey(typeof(T)))
            {
                GameLog.Warn(Tag, $"{typeof(T).Name} was already registered; replacing it.");
            }

            Services[typeof(T)] = service;
        }

        public static T Get<T>() where T : class
        {
            if (Services.TryGetValue(typeof(T), out object service))
            {
                return (T)service;
            }

            GameLog.Error(Tag, $"{typeof(T).Name} is not registered. Did GameBootstrap run? (It needs Resources/GameConfig.)");
            return null;
        }

        public static bool TryGet<T>(out T service) where T : class
        {
            if (Services.TryGetValue(typeof(T), out object found))
            {
                service = (T)found;
                return true;
            }

            service = null;
            return false;
        }

        public static bool IsRegistered<T>() where T : class
        {
            return Services.ContainsKey(typeof(T));
        }

        public static void Unregister<T>() where T : class
        {
            Services.Remove(typeof(T));
        }

        public static void Reset()
        {
            Services.Clear();
        }

        // Runs before any scene loads, so play mode starts clean even with domain reload disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlayModeEnter()
        {
            Reset();
        }
    }
}
