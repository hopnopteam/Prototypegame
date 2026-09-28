using System;
using System.Collections.Generic;
using UnityEngine;

namespace NightExpress.Core
{
    /// <summary>
    /// Typed publish/subscribe hub so systems can react to each other without direct references.
    /// Publishing is allocation-free; subscribing and unsubscribing allocate a small array, which is
    /// fine because they happen on enable/disable, not every frame.
    /// </summary>
    public sealed class EventBus
    {
        private const string Tag = "EventBus";

        private readonly Dictionary<Type, IChannel> _channels = new Dictionary<Type, IChannel>();

        public void Subscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (handler == null)
            {
                GameLog.Error(Tag, $"Tried to subscribe a null handler to {typeof(T).Name}.");
                return;
            }

            GetOrCreateChannel<T>().Add(handler);
        }

        public void Unsubscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (handler == null)
            {
                return;
            }

            if (_channels.TryGetValue(typeof(T), out IChannel channel))
            {
                ((Channel<T>)channel).Remove(handler);
            }
        }

        public void Publish<T>(T gameEvent) where T : struct, IGameEvent
        {
            if (_channels.TryGetValue(typeof(T), out IChannel channel))
            {
                ((Channel<T>)channel).Publish(gameEvent);
            }
        }

        public int SubscriberCount<T>() where T : struct, IGameEvent
        {
            return _channels.TryGetValue(typeof(T), out IChannel channel) ? channel.Count : 0;
        }

        public void Clear()
        {
            _channels.Clear();
        }

        private Channel<T> GetOrCreateChannel<T>() where T : struct, IGameEvent
        {
            if (_channels.TryGetValue(typeof(T), out IChannel existing))
            {
                return (Channel<T>)existing;
            }

            var created = new Channel<T>();
            _channels.Add(typeof(T), created);
            return created;
        }

        private interface IChannel
        {
            int Count { get; }
        }

        private sealed class Channel<T> : IChannel where T : struct, IGameEvent
        {
            // Copy-on-write: Publish iterates a snapshot, so handlers may subscribe or unsubscribe
            // (including themselves) mid-publish without corrupting the loop.
            private Action<T>[] _handlers = Array.Empty<Action<T>>();

            public int Count => _handlers.Length;

            public void Add(Action<T> handler)
            {
                // Ignoring duplicates keeps an accidental double-subscribe from double-paying the player.
                if (Array.IndexOf(_handlers, handler) >= 0)
                {
                    return;
                }

                var next = new Action<T>[_handlers.Length + 1];
                Array.Copy(_handlers, next, _handlers.Length);
                next[_handlers.Length] = handler;
                _handlers = next;
            }

            public void Remove(Action<T> handler)
            {
                int index = Array.IndexOf(_handlers, handler);
                if (index < 0)
                {
                    return;
                }

                if (_handlers.Length == 1)
                {
                    _handlers = Array.Empty<Action<T>>();
                    return;
                }

                var next = new Action<T>[_handlers.Length - 1];
                Array.Copy(_handlers, 0, next, 0, index);
                Array.Copy(_handlers, index + 1, next, index, _handlers.Length - index - 1);
                _handlers = next;
            }

            public void Publish(T gameEvent)
            {
                Action<T>[] snapshot = _handlers;
                for (int i = 0; i < snapshot.Length; i++)
                {
                    try
                    {
                        snapshot[i](gameEvent);
                    }
                    catch (Exception exception)
                    {
                        // One broken listener must not silence every other system listening to this event.
                        Debug.LogException(exception);
                    }
                }
            }
        }
    }
}
