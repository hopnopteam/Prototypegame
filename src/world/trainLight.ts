import { VISUALS } from '../config/visuals';
import { windowSpacing } from './CarriageView';
import type { LampAnchor } from './Lighting';
import type { BakeInput, BakeOccluder, BakeRect, BakeRoom, BakeSpill, Rgb } from './lightBake';
import { CARRIAGE_LENGTH, GANGWAY_HALF, GANGWAY_LENGTH, HALF_WIDTH, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0, REAR_DECK_LENGTH, type CarriageLayout } from './layout';

/** A carriage as the light bake needs it. */
export interface LitCarriage {
  layout: CarriageLayout;
  originZ: number;
  /** Refit tier (0 run-down …), for how warm and bright its lamps are. */
  tier: number;
  /** Its lamps, in world coordinates. */
  lamps: LampAnchor[];
}

/** sRGB hex → linear rgb times an intensity. */
export function linearColor(hex: string, intensity = 1): Rgb {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [lin(n >> 16) * intensity, lin((n >> 8) & 255) * intensity, lin(n & 255) * intensity];
}

const offset = (r: BakeRect, dz: number): BakeRect => ({ x0: r.x0, z0: r.z0 + dz, x1: r.x1, z1: r.z1 + dz });

/** How far outside the hull the map reaches: window light on the water and across the platform. */
const LAKE_REACH = 3.2;
const PLATFORM_REACH = 3.4;

/**
 * The train's light bake: every room's warm fill, each lamp's pool, the light out of every window, and the
 * contact shading of walls, furniture and the hull (the train sits on the ground, not above it).
 */
export function trainLightInput(cars: readonly LitCarriage[]): BakeInput {
  const L = VISUALS.night.light;
  const frontZ = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH;
  const rearZ = cars.length > 0 ? cars[cars.length - 1].originZ + CARRIAGE_LENGTH + REAR_DECK_LENGTH : 0;
  const rooms: BakeRoom[] = [];
  const lamps: BakeInput['lamps'] = [];
  const occluders: BakeOccluder[] = [];
  const spills: BakeSpill[] = [];
  const ao = L.ao;

  for (const car of cars) {
    const tierK = L.tierLamp[Math.min(L.tierLamp.length - 1, Math.max(0, car.tier))];
    // Bare bulbs run cooler; refitted lamps are warm amber.
    const lampColor = car.tier <= 0 ? '#FFD39A' : L.lamp.color;
    const ambient = linearColor(L.interior.color, L.interior.intensity * tierK);
    for (const r of car.layout.rooms) rooms.push({ rect: offset(r, car.originZ), ambient });
    for (const lamp of car.lamps) {
      lamps.push({ x: lamp.x, z: lamp.z, strength: lamp.strength * L.lamp.intensity * tierK, radius: L.lamp.radius, color: linearColor(lampColor) });
    }
    for (const w of car.layout.walls) occluders.push({ rect: offset(w, car.originZ), strength: ao.wall, reach: ao.wallReach });
    for (const p of car.layout.props) occluders.push({ rect: offset(p.rect, car.originZ), strength: ao.prop, reach: ao.propReach });
    // The hull shades the ground and platform edge outside it.
    occluders.push({ rect: { x0: -HALF_WIDTH, z0: car.originZ, x1: HALF_WIDTH, z1: car.originZ + CARRIAGE_LENGTH }, strength: ao.hull, reach: ao.hullReach });
    // The gangway to the next carriage (or the rear deck).
    occluders.push({ rect: { x0: -GANGWAY_HALF, z0: car.originZ + CARRIAGE_LENGTH, x1: GANGWAY_HALF, z1: car.originZ + CARRIAGE_LENGTH + GANGWAY_LENGTH }, strength: ao.hull * 0.7, reach: ao.hullReach * 0.6 });

    // Window light: every window in the long side walls pours a soft beam onto what is outside.
    const spillColor = linearColor(L.spill.color);
    const spillK = L.spill.intensity * tierK;
    for (const w of car.layout.walls) {
      if (w.kind !== 'exterior') continue;
      const alongZ = w.z1 - w.z0 > w.x1 - w.x0;
      if (!alongZ) continue;
      const left = w.x0 < 0;
      const { count, slot, width } = windowSpacing(w.z1 - w.z0);
      for (let i = 0; i < count; i++) {
        const zc = car.originZ + w.z0 + slot * (i + 0.5);
        spills.push({
          z0: zc - width / 2,
          z1: zc + width / 2,
          x: left ? w.x0 : w.x1,
          dir: left ? -1 : 1,
          reach: L.spill.reach,
          strength: spillK,
          color: spillColor,
        });
      }
    }
  }
  // The locomotive and the rear deck sit on the ground too.
  occluders.push({ rect: { x0: -1.55, z0: frontZ, x1: 1.55, z1: -GANGWAY_LENGTH }, strength: ao.hull, reach: ao.hullReach });
  if (cars.length > 0) {
    const deckZ = cars[cars.length - 1].originZ + CARRIAGE_LENGTH + GANGWAY_LENGTH * 0;
    occluders.push({ rect: { x0: -1.3, z0: deckZ, x1: 1.3, z1: deckZ + REAR_DECK_LENGTH }, strength: ao.hull * 0.8, reach: ao.hullReach * 0.7 });
  }
  return {
    box: { x0: -HALF_WIDTH - LAKE_REACH, z0: frontZ - 1.5, x1: HALF_WIDTH + PLATFORM_REACH, z1: rearZ + 1.5 },
    texel: L.texel,
    rooms,
    lamps,
    occluders,
    spills,
  };
}

/**
 * The platform's light bake (its own coordinates; it slides in with the platform): warm pools under the
 * canopy lamps across the deck and up the side of the train, and a little shading along the coping.
 */
export function platformLightInput(lampAnchors: readonly LampAnchor[], z0: number, z1: number): BakeInput {
  const P = VISUALS.night.light.platformLamp;
  const x0 = HALF_WIDTH - 0.3;
  const x1 = PLATFORM_X0 + PLATFORM_WIDTH;
  return {
    box: { x0: x0 - 0.3, z0: z0 - 1, x1: x1 + 0.6, z1: z1 + 1 },
    texel: 0.12,
    // One "room": the deck, the gap and the train's side facing it, all lit by the same lamps.
    rooms: [{ rect: { x0, z0, x1, z1 }, ambient: [0, 0, 0] }],
    lamps: lampAnchors.map((a) => ({ x: a.x, z: a.z, strength: a.strength * P.intensity, radius: P.radius, color: linearColor(P.color) })),
    occluders: [],
    spills: [],
  };
}
