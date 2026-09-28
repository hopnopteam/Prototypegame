import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { Tweens } from '../src/core/Tween';
import { formatClock, formatNumber } from '../src/core/math';

interface TestEvents {
  ping: { value: number };
  other: undefined;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const other = vi.fn();
    bus.on('ping', ping);
    bus.on('other', other);
    bus.emit('ping', { value: 3 });
    expect(ping).toHaveBeenCalledWith({ value: 3 });
    expect(other).not.toHaveBeenCalled();
  });

  it('unsubscribes via the returned function and ignores duplicates', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);
    bus.on('ping', handler);
    bus.emit('ping', { value: 1 });
    off();
    bus.emit('ping', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.count('ping')).toBe(0);
  });

  it('lets a handler unsubscribe itself mid-emit without skipping others', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const first = (): void => bus.off('ping', first);
    bus.on('ping', first);
    bus.on('ping', second);
    bus.emit('ping', { value: 1 });
    bus.emit('ping', { value: 2 });
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering when one handler throws', () => {
    const bus = new EventBus<TestEvents>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', after);
    bus.emit('ping', { value: 1 });
    expect(after).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Rng', () => {
  it('is reproducible for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('never picks zero-weight keys', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) expect(rng.weighted({ a: 1, b: 0 })).toBe('a');
  });
});

describe('Tweens', () => {
  it('runs to completion and calls complete once', () => {
    const tweens = new Tweens();
    const values: number[] = [];
    const complete = vi.fn();
    tweens.run(1, (t) => values.push(t), { complete, ease: (t) => t });
    tweens.update(0.5);
    tweens.update(0.6);
    tweens.update(0.5);
    expect(values).toEqual([0.5, 1]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(tweens.count).toBe(0);
  });

  it('keeps tweens started from a completion callback', () => {
    const tweens = new Tweens();
    const second = vi.fn();
    tweens.run(0.1, () => undefined, { complete: () => tweens.run(0.1, second) });
    tweens.update(0.2);
    expect(tweens.count).toBe(1);
    tweens.update(0.2);
    expect(second).toHaveBeenCalled();
  });

  it('kills tweens by owner', () => {
    const tweens = new Tweens();
    const owner = {};
    const update = vi.fn();
    tweens.run(1, update, { owner });
    tweens.kill(owner);
    tweens.update(0.5);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('formatting', () => {
  it('formats numbers compactly', () => {
    expect(formatNumber(950)).toBe('950');
    expect(formatNumber(12_345)).toBe('12.3K');
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('formats a departure clock', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0.2)).toBe('0:01');
  });
});
