using System;
using System.Collections.Generic;
using UnityEngine;

namespace NightExpress.Core
{
    /// <summary>
    /// The one persistent MonoBehaviour that bridges Unity's player loop into the plain C# systems:
    /// per-frame ticks, delayed calls, and app pause/focus/quit events. One Update for all systems
    /// is also cheaper than one Update per system.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SystemsHost : MonoBehaviour, IScheduler
    {
        private const string Tag = "SystemsHost";
        private const int InitialCapacity = 8;

        private readonly List<ITickable> _tickables = new List<ITickable>(InitialCapacity);
        private readonly List<PendingCall> _pendingCalls = new List<PendingCall>(InitialCapacity);

        private EventBus _events;

        // Unity may report "not paused" / "focused" at startup; tracking state means we only publish real changes.
        private bool _isPaused;
        private bool _hasFocus = true;

        public void Initialize(EventBus events)
        {
            _events = events;
        }

        /// <summary>Add or remove tickables from outside a Tick call.</summary>
        public void AddTickable(ITickable tickable)
        {
            if (tickable == null)
            {
                GameLog.Error(Tag, "Tried to add a null tickable.", this);
                return;
            }

            if (!_tickables.Contains(tickable))
            {
                _tickables.Add(tickable);
            }
        }

        public void RemoveTickable(ITickable tickable)
        {
            _tickables.Remove(tickable);
        }

        public void RunAfter(float realSeconds, Action callback)
        {
            if (callback == null)
            {
                return;
            }

            _pendingCalls.Add(new PendingCall(Time.unscaledTime + Mathf.Max(0f, realSeconds), callback));
        }

        private void Update()
        {
            float deltaTime = Time.unscaledDeltaTime;
            for (int i = 0; i < _tickables.Count; i++)
            {
                try
                {
                    _tickables[i].Tick(deltaTime);
                }
                catch (Exception exception)
                {
                    Debug.LogException(exception, this);
                }
            }

            RunDueCalls();
        }

        private void RunDueCalls()
        {
            if (_pendingCalls.Count == 0)
            {
                return;
            }

            float now = Time.unscaledTime;

            // Only look at calls that existed when this frame started; calls scheduled by a callback wait a frame.
            int count = _pendingCalls.Count;
            int index = 0;
            while (index < count)
            {
                PendingCall call = _pendingCalls[index];
                if (call.DueTime > now)
                {
                    index++;
                    continue;
                }

                _pendingCalls.RemoveAt(index);
                count--;

                try
                {
                    call.Callback();
                }
                catch (Exception exception)
                {
                    Debug.LogException(exception, this);
                }
            }
        }

        private void OnApplicationPause(bool pauseStatus)
        {
            if (pauseStatus == _isPaused)
            {
                return;
            }

            _isPaused = pauseStatus;
            _events?.Publish(new AppPauseChanged(pauseStatus));
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (hasFocus == _hasFocus)
            {
                return;
            }

            _hasFocus = hasFocus;
            _events?.Publish(new AppFocusChanged(hasFocus));
        }

        private void OnApplicationQuit()
        {
            _events?.Publish(new AppQuitting());
        }

        private readonly struct PendingCall
        {
            public readonly float DueTime;
            public readonly Action Callback;

            public PendingCall(float dueTime, Action callback)
            {
                DueTime = dueTime;
                Callback = callback;
            }
        }
    }
}
