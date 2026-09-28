using System;
using System.Text.RegularExpressions;
using NightExpress.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NightExpress.Tests
{
    public sealed class EventBusTests
    {
        private readonly struct TestEvent : IGameEvent
        {
            public readonly int Value;

            public TestEvent(int value)
            {
                Value = value;
            }
        }

        private readonly struct OtherEvent : IGameEvent
        {
        }

        private EventBus _bus;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
        }

        [Test]
        public void Publish_ReachesSubscriberWithPayload()
        {
            int received = 0;
            _bus.Subscribe<TestEvent>(e => received = e.Value);

            _bus.Publish(new TestEvent(42));

            Assert.AreEqual(42, received);
        }

        [Test]
        public void Publish_WithNoSubscribers_DoesNothing()
        {
            Assert.DoesNotThrow(() => _bus.Publish(new TestEvent(1)));
        }

        [Test]
        public void Publish_OnlyReachesSubscribersOfThatType()
        {
            int otherCalls = 0;
            _bus.Subscribe<OtherEvent>(_ => otherCalls++);

            _bus.Publish(new TestEvent(1));

            Assert.AreEqual(0, otherCalls);
        }

        [Test]
        public void Unsubscribe_StopsDelivery()
        {
            int calls = 0;
            Action<TestEvent> handler = _ => calls++;
            _bus.Subscribe(handler);
            _bus.Unsubscribe(handler);

            _bus.Publish(new TestEvent(1));

            Assert.AreEqual(0, calls);
            Assert.AreEqual(0, _bus.SubscriberCount<TestEvent>());
        }

        [Test]
        public void Subscribe_SameHandlerTwice_IsDeliveredOnce()
        {
            int calls = 0;
            Action<TestEvent> handler = _ => calls++;
            _bus.Subscribe(handler);
            _bus.Subscribe(handler);

            _bus.Publish(new TestEvent(1));

            Assert.AreEqual(1, calls);
        }

        [Test]
        public void HandlerUnsubscribingItselfDuringPublish_DoesNotSkipOthers()
        {
            int secondCalls = 0;
            Action<TestEvent> first = null;
            first = _ => _bus.Unsubscribe(first);
            _bus.Subscribe(first);
            _bus.Subscribe<TestEvent>(_ => secondCalls++);

            _bus.Publish(new TestEvent(1));
            _bus.Publish(new TestEvent(2));

            Assert.AreEqual(2, secondCalls);
            Assert.AreEqual(1, _bus.SubscriberCount<TestEvent>());
        }

        [Test]
        public void HandlerSubscribedDuringPublish_WaitsForNextPublish()
        {
            int lateCalls = 0;
            bool added = false;
            _bus.Subscribe<TestEvent>(_ =>
            {
                if (added)
                {
                    return;
                }

                added = true;
                _bus.Subscribe<TestEvent>(__ => lateCalls++);
            });

            _bus.Publish(new TestEvent(1));
            Assert.AreEqual(0, lateCalls);

            _bus.Publish(new TestEvent(2));
            Assert.AreEqual(1, lateCalls);
        }

        [Test]
        public void ThrowingHandler_DoesNotStopOtherHandlers()
        {
            int calls = 0;
            _bus.Subscribe<TestEvent>(_ => throw new InvalidOperationException("boom"));
            _bus.Subscribe<TestEvent>(_ => calls++);

            LogAssert.Expect(LogType.Exception, new Regex("boom"));
            _bus.Publish(new TestEvent(1));

            Assert.AreEqual(1, calls);
        }
    }
}
