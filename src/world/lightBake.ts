/**
 * The light bake: lamplight, soft contact shading and window spill, painted once into a top-down map of the
 * train (or the platform) whenever it changes, instead of being computed for every pixel of every frame.
 * Every lit surface then reads one texel: cheap on a phone, and the same on every quality tier.
 *
 * Pure data in, pure data out (no three.js), so it is unit-tested.
 */

export interface BakeRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type Rgb = readonly [number, number, number];

export interface BakeRoom {
  rect: BakeRect;
  /** Warm fill everywhere in the room (what the ceiling lights would give). */
  ambient: Rgb;
}

export interface BakeLamp {
  x: number;
  z: number;
  /** Peak brightness at the lamp (linear units, added to the room's light). */
  strength: number;
  /** Metres to where the pool fades to nothing. */
  radius: number;
  color: Rgb;
}

/** Something that shades the floor around it: a wall, a bed, the hull seen from outside. */
export interface BakeOccluder {
  rect: BakeRect;
  /** How dark it gets right against it (0 none … 1 black). */
  strength: number;
  /** Metres over which the shading fades out. */
  reach: number;
}

/** Light pouring out of a window onto the ground (or water, or platform) outside the hull. */
export interface BakeSpill {
  /** The window's span along the train. */
  z0: number;
  z1: number;
  /** The hull face it shines out of, and which way is out (+1 toward +x). */
  x: number;
  dir: 1 | -1;
  reach: number;
  strength: number;
  color: Rgb;
}

export interface BakeInput {
  /** World area the map covers (x across, z along the train); everything outside reads as no light, no shade. */
  box: BakeRect;
  /** Metres per texel. */
  texel: number;
  rooms: BakeRoom[];
  lamps: BakeLamp[];
  occluders: BakeOccluder[];
  spills: BakeSpill[];
  /** Where a lamp's light stays: lamps only light their own room fully, others a little through doorways. */
  leak?: number;
}

export interface BakedLight {
  width: number;
  height: number;
  /** RGBA per texel, row-major from (box.x0, box.z0): rgb light, a = ambient occlusion (1 open). */
  data: Float32Array;
}

/** Edge texels are left neutral, so sampling past the map (clamped) reads as no light and no shade. */
const BORDER = 1;

/** A whole bake at once (start-up, tests, tools). */
export function bakeLight(input: BakeInput): BakedLight {
  const steps = bakeSteps(input);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Rows of texels per slice in the long passes, between yields. */
const ROWS_PER_SLICE = 48;

/**
 * The bake in slices (it yields between them), so a new carriage or a refit re-bakes over a few frames
 * while the old map stays on screen, instead of stalling one frame.
 */
export function* bakeSteps(input: BakeInput): Generator<void, BakedLight> {
  const { box, texel } = input;
  const width = Math.max(2 * BORDER + 1, Math.ceil((box.x1 - box.x0) / texel) + 1);
  const height = Math.max(2 * BORDER + 1, Math.ceil((box.z1 - box.z0) / texel) + 1);
  const n = width * height;
  const light = new Float32Array(n * 3);
  const ao = new Float32Array(n).fill(1);
  const room = new Int16Array(n).fill(-1);
  const leak = input.leak ?? 0.16;

  const col = (x: number): number => Math.round((x - box.x0) / texel);
  const row = (z: number): number => Math.round((z - box.z0) / texel);
  const xAt = (i: number): number => box.x0 + i * texel;
  const zAt = (j: number): number => box.z0 + j * texel;
  const span = (a: number, b: number, size: number): [number, number] => [Math.max(BORDER, a), Math.min(size - 1 - BORDER, b)];

  // Rooms: which room each texel belongs to, and its warm fill.
  input.rooms.forEach((r, k) => {
    const [i0, i1] = span(Math.ceil((r.rect.x0 - box.x0) / texel), Math.floor((r.rect.x1 - box.x0) / texel), width);
    const [j0, j1] = span(Math.ceil((r.rect.z0 - box.z0) / texel), Math.floor((r.rect.z1 - box.z0) / texel), height);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = j * width + i;
        if (room[t] >= 0) continue;
        room[t] = k;
        light[t * 3] += r.ambient[0];
        light[t * 3 + 1] += r.ambient[1];
        light[t * 3 + 2] += r.ambient[2];
      }
    }
  });
  yield;

  // Lamps: a soft pool, full in the lamp's own room, a little through the doors into the next.
  for (const lamp of input.lamps) {
    const li = col(lamp.x);
    const lj = row(lamp.z);
    const home = li >= 0 && li < width && lj >= 0 && lj < height ? room[lj * width + li] : -1;
    const reach = Math.ceil(lamp.radius / texel);
    const [i0, i1] = span(li - reach, li + reach, width);
    const [j0, j1] = span(lj - reach, lj + reach, height);
    const r2 = lamp.radius * lamp.radius;
    for (let j = j0; j <= j1; j++) {
      const dz = zAt(j) - lamp.z;
      for (let i = i0; i <= i1; i++) {
        const dx = xAt(i) - lamp.x;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r2) continue;
        const t = j * width + i;
        const here = room[t];
        // Lamps light rooms (and the walls between them, handled below), never the world outside.
        if (here < 0) continue;
        const fall = 1 - d2 / r2;
        const k = lamp.strength * fall * fall * (here === home || home < 0 ? 1 : leak);
        light[t * 3] += lamp.color[0] * k;
        light[t * 3 + 1] += lamp.color[1] * k;
        light[t * 3 + 2] += lamp.color[2] * k;
      }
    }
    yield;
  }

  // Walls and other solid texels take the light of the rooms beside them, so wall faces are lit from inside.
  // Only texels within two of a room can take any (most of the map is outside the hull): find those first.
  const near = new Uint8Array(n);
  for (let j = 0; j < height; j++) {
    let last = -1000;
    for (let i = 0; i < width; i++) {
      if (room[j * width + i] >= 0) last = i;
      if (i - last <= 2) near[j * width + i] = 1;
    }
    last = 1000000;
    for (let i = width - 1; i >= 0; i--) {
      if (room[j * width + i] >= 0) last = i;
      if (last - i <= 2) near[j * width + i] = 1;
    }
  }
  const nearBoth = new Uint8Array(n);
  for (let i = 0; i < width; i++) {
    let last = -1000;
    for (let j = 0; j < height; j++) {
      if (near[j * width + i]) last = j;
      if (j - last <= 2) nearBoth[j * width + i] = 1;
    }
    last = 1000000;
    for (let j = height - 1; j >= 0; j--) {
      if (near[j * width + i]) last = j;
      if (last - j <= 2) nearBoth[j * width + i] = 1;
    }
  }
  yield;
  const lit = light.slice();
  for (let j = BORDER; j < height - BORDER; j++) {
    if (j % ROWS_PER_SLICE === 0) yield;
    for (let i = BORDER; i < width - BORDER; i++) {
      const t = j * width + i;
      if (room[t] >= 0 || !nearBoth[t]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj < BORDER || jj >= height - BORDER || ii < BORDER || ii >= width - BORDER) continue;
          const u = jj * width + ii;
          if (room[u] < 0) continue;
          r += light[u * 3];
          g += light[u * 3 + 1];
          b += light[u * 3 + 2];
          count++;
        }
      }
      if (count > 0) {
        lit[t * 3] = (r / count) * 0.85;
        lit[t * 3 + 1] = (g / count) * 0.85;
        lit[t * 3 + 2] = (b / count) * 0.85;
      }
    }
  }
  light.set(lit);
  yield;

  // Window spill: warm light laid on whatever is outside the window, fading with distance and spreading.
  for (const s of input.spills) {
    const reach = Math.ceil(s.reach / texel);
    const xi = col(s.x);
    const [i0, i1] = s.dir > 0 ? span(xi, xi + reach, width) : span(xi - reach, xi, width);
    const zc = (s.z0 + s.z1) / 2;
    const half = (s.z1 - s.z0) / 2;
    const [j0, j1] = span(row(s.z0 - s.reach), row(s.z1 + s.reach), height);
    for (let j = j0; j <= j1; j++) {
      const dz = Math.abs(zAt(j) - zc);
      for (let i = i0; i <= i1; i++) {
        const t = j * width + i;
        if (room[t] >= 0) continue;
        const out = (xAt(i) - s.x) * s.dir;
        if (out < 0) continue;
        // The beam widens as it leaves the glass and softens at its edges.
        const spread = half + out * 0.55;
        const edge = smoothstep(spread + 0.35, spread - 0.1, dz);
        const k = s.strength * Math.exp(-out / (s.reach * 0.38)) * edge;
        light[t * 3] += s.color[0] * k;
        light[t * 3 + 1] += s.color[1] * k;
        light[t * 3 + 2] += s.color[2] * k;
      }
    }
    yield;
  }

  // Contact shading: darker where the floor meets a wall or tucks under furniture.
  for (const o of input.occluders) {
    const reach = Math.ceil(o.reach / texel);
    const [i0, i1] = span(col(o.rect.x0) - reach, col(o.rect.x1) + reach, width);
    const [j0, j1] = span(row(o.rect.z0) - reach, row(o.rect.z1) + reach, height);
    const k = o.reach / 2.5;
    for (let j = j0; j <= j1; j++) {
      const z = zAt(j);
      const dz = Math.max(o.rect.z0 - z, 0, z - o.rect.z1);
      for (let i = i0; i <= i1; i++) {
        const x = xAt(i);
        const dx = Math.max(o.rect.x0 - x, 0, x - o.rect.x1);
        const d = Math.hypot(dx, dz);
        if (d > o.reach) continue;
        const shade = o.strength * (d <= 0 ? 1 : Math.exp(-d / k)) * (1 - d / o.reach);
        const t = j * width + i;
        ao[t] *= 1 - shade;
      }
    }
    yield;
  }

  const data = new Float32Array(n * 4);
  for (let t = 0; t < n; t++) {
    if (t % (width * ROWS_PER_SLICE * 2) === 0) yield;
    const j = Math.floor(t / width);
    const i = t - j * width;
    const edge = i < BORDER || j < BORDER || i >= width - BORDER || j >= height - BORDER;
    data[t * 4] = edge ? 0 : light[t * 3];
    data[t * 4 + 1] = edge ? 0 : light[t * 3 + 1];
    data[t * 4 + 2] = edge ? 0 : light[t * 3 + 2];
    data[t * 4 + 3] = edge ? 1 : Math.max(0.25, ao[t]);
  }
  return { width, height, data };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Reads the baked light at a world point (nearest texel), for tests and tools. */
export function sampleBake(baked: BakedLight, box: BakeRect, texel: number, x: number, z: number): { light: Rgb; ao: number } {
  const i = Math.min(baked.width - 1, Math.max(0, Math.round((x - box.x0) / texel)));
  const j = Math.min(baked.height - 1, Math.max(0, Math.round((z - box.z0) / texel)));
  const t = (j * baked.width + i) * 4;
  return { light: [baked.data[t], baked.data[t + 1], baked.data[t + 2]], ao: baked.data[t + 3] };
}
