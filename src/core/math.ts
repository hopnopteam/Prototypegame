export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
/** Eases 0..1 in and out (slow start, slow finish). */
export const smoothstep01 = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));

/** Frame-rate independent exponential smoothing toward a target. `sharpness` ~ 1/time-constant. */
export const damp = (current: number, target: number, sharpness: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-sharpness * dt));

export const approach = (current: number, target: number, maxDelta: number): number =>
  current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target);

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax: number, az: number, bx: number, bz: number): number => Math.sqrt(dist2(ax, az, bx, bz));

/** Shortest signed difference between two angles, in radians. */
export const angleDelta = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const dampAngle = (current: number, target: number, sharpness: number, dt: number): number =>
  current + angleDelta(current, target) * (1 - Math.exp(-sharpness * dt));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t: number): number => t * t;
export const linear = (t: number): number => t;

/** Overshoots then settles: the "pop into existence" curve. */
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutElastic = (t: number): number => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export type Ease = (t: number) => number;

export const formatNumber = (value: number): string => {
  const v = Math.floor(value);
  // Truncate rather than round, so 99,999 reads 99.9K (never a misleading 100.0K) and stays short.
  if (v < 10_000) return v.toLocaleString('en-US');
  if (v < 100_000) return `${(Math.floor(v / 100) / 10).toFixed(1)}K`;
  if (v < 1_000_000) return `${Math.floor(v / 1000)}K`;
  return `${(Math.floor(v / 100_000) / 10).toFixed(1)}M`;
};

export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
};
