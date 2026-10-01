import type { Vec2 } from '../core/types';
import type { IconName } from '../ui/icons';
import { carriageOriginZ } from '../world/layout';
import type { World } from './World';

export interface CarriageNeed {
  icon: IconName;
  /** Where quick travel takes you for it. */
  point: Vec2;
  /** Short words for the map button's label. */
  label: string;
}

/** Where quick travel lands when a carriage needs nothing in particular. */
const HUB_Z = 6.5;
const CORRIDOR_X = -1.3;

/**
 * What each carriage needs from the conductor right now, most urgent first: a guest at the desk, a request,
 * a dirty cabin, an empty washroom, a tile you can afford. Drives the train map's badges and quick travel.
 */
export class TrainNeeds {
  constructor(private readonly w: World) {}

  forCarriage(index: number): CarriageNeed | null {
    const w = this.w;
    if (index === 0 && w.guests.deskReady() && w.staff.count('porter') === 0) {
      return { icon: 'ticket', point: w.map.anchor(0, 'deskService'), label: 'Guest at the desk' };
    }
    for (const guest of w.guests.openRequests()) {
      if (!guest.cabin || guest.cabin.carriage !== index || w.staff.isHandled(guest)) continue;
      if (guest.request && guest.request !== 'bathroom') return { icon: guest.request, point: guest.cabin.center, label: `Wants ${guest.request}` };
    }
    for (const cabin of w.train.cabins) {
      if (cabin.carriage !== index || !cabin.isDirty || cabin.guest || cabin.cleaner) continue;
      return { icon: 'broom', point: cabin.spots[cabin.dirty.findIndex(Boolean)] ?? cabin.center, label: 'Cabin to clean' };
    }
    const threshold = w.econ.facilities.bathroomRestockThreshold;
    for (const bath of w.train.bathrooms) {
      if (bath.carriage !== index || !bath.unlocked || bath.restocker) continue;
      if (bath.towels <= threshold || bath.rolls <= threshold) return { icon: bath.towels <= bath.rolls ? 'towel' : 'roll', point: bath.restock, label: 'Washroom needs stock' };
    }
    const cash = w.wallet.get('cash');
    for (const tile of w.tiles.list) {
      if (tile.def.carriage !== index || tile.def.kind === 'couple') continue;
      if (w.unlocks.remaining(tile.def.id) <= cash) return { icon: 'plus', point: tile.pos, label: tile.def.label };
    }
    return null;
  }

  /** Quick-travel destination for a carriage: its most urgent need, or the middle of it. */
  destination(index: number): Vec2 {
    const need = this.forCarriage(index);
    if (need) return need.point;
    const w = this.w;
    const type = w.train.types[index];
    const x = type === 'supply' || type === 'luggage' ? 0 : type === 'lobby' ? -0.9 : CORRIDOR_X;
    const z = carriageOriginZ(index) + (type === 'lobby' ? 3.6 : HUB_Z);
    return w.map.walk.nearestWalkable(x, z);
  }

  /** Which carriage a world z is in (the gangway counts as the car in front). */
  carriageAt(z: number): number {
    const w = this.w;
    let best = 0;
    for (let i = 0; i < w.train.count; i++) if (z >= carriageOriginZ(i) - 0.6) best = i;
    return best;
  }
}
