import type { ItemKind } from '../core/types';
import type { Actor } from './Actor';
import type { World } from './World';

type StaffLike = Actor & { wantItems?: Partial<Record<ItemKind, number>> };

/**
 * Which counter in a passenger carriage hands an item out (a layout anchor): the service counter (the urn) for
 * drinks, the paper and breakfast; the linen cupboard for blankets, pillows, towels and bedding sets, and its
 * hamper takes the used bedding.
 */
export function sourceAnchorFor(item: ItemKind): string {
  switch (item) {
    case 'tea':
    case 'coffee':
    case 'champagne':
    case 'newspaper':
    case 'breakfast':
      return 'urn';
    case 'blanket':
    case 'pillow':
    case 'towel':
    case 'bedding':
    case 'laundry':
      return 'linen';
    default:
      return item;
  }
}

/**
 * What the train needs carried right now. Supply shelves only hand out items somebody is waiting for, so the
 * conductor never ends up with an armful of things to throw away: one tea request means one tea, and a
 * shelf with nothing to give simply rests. Anything carried beyond the need is surplus and goes back on
 * the nearest shelf of its kind.
 */
export class Demand {
  constructor(private readonly w: World) {}

  /** Items of this kind the player could usefully carry (including what they already hold). */
  playerNeed(kind: ItemKind): number {
    const w = this.w;
    switch (kind) {
      case 'tea':
      case 'coffee':
      case 'champagne':
      case 'pillow':
      case 'newspaper':
      case 'breakfast':
        return this.requestNeed(kind);
      case 'bedding':
        // Fresh sets for the beds waiting to be turned around (stripped or still used) nobody on the staff has taken.
        return this.w.train.beddingNeed();
      case 'laundry':
        // Used bedding is never wanted: it all goes to a linen cupboard's hamper.
        return 0;
      case 'blanket':
        // Cabin requests, and the dome's guests who would like one for the view.
        return this.requestNeed(kind) + w.venues.need(kind);
      case 'latte':
      case 'pastry':
      case 'meal':
      case 'cocktail':
      case 'popcorn':
        // What the venue carriages are waiting for (session 20).
        return w.venues.need(kind);
      case 'towel':
        // Towels go to washrooms running low and to Comfort-class guests who ask for a fresh one.
        return this.bathroomNeed(kind) + this.requestNeed(kind);
      case 'roll':
        return this.bathroomNeed(kind);
      case 'luggage': {
        const room = w.train.luggageCapacity - w.train.luggageStored - this.staffCarrying('luggage');
        const reachable = w.player.stack.countOf('luggage') + (w.journey.doorsOpen ? w.station.luggagePile : 0);
        return Math.max(0, Math.min(room, reachable));
      }
      case 'crate': {
        const f = w.data.facilities;
        const max = w.econ.facilities.supplyShelfMax;
        const missing = Math.max(max - f.supplyTowel, max - f.supplyRoll);
        if (missing <= 0) return 0;
        const crates = Math.ceil(missing / w.econ.facilities.crateRefill) - this.staffCarrying('crate');
        const reachable = w.player.stack.countOf('crate') + (w.journey.doorsOpen ? w.station.vendorCrates : 0);
        return Math.max(0, Math.min(crates, reachable));
      }
    }
  }

  /** How many more of this kind the player should pick up right now. */
  playerWants(kind: ItemKind): number {
    return Math.max(0, this.playerNeed(kind) - this.w.player.stack.countOf(kind));
  }

  /** Whether this actor would take one more of this kind from a shelf. */
  wants(actor: Actor, kind: ItemKind): boolean {
    if (actor.isPlayer) return this.playerWants(kind) > 0;
    const staff = actor as StaffLike;
    return actor.stack.countOf(kind) < (staff.wantItems?.[kind] ?? 0);
  }

  /** Items of this kind the actor holds that nobody needs any more. */
  surplus(actor: Actor, kind: ItemKind): number {
    const held = actor.stack.countOf(kind);
    if (held === 0) return 0;
    if (actor.isPlayer) return Math.max(0, held - this.playerNeed(kind));
    return Math.max(0, held - ((actor as StaffLike).wantItems?.[kind] ?? 0));
  }

  /** The first kind of surplus an actor is carrying, if any. */
  firstSurplus(actor: Actor): ItemKind | null {
    for (const kind of actor.stack.items) if (this.surplus(actor, kind) > 0) return kind;
    return null;
  }

  /** Guests waiting for this item in their cabin, not already being served by staff. */
  private requestNeed(kind: ItemKind): number {
    let n = 0;
    for (const guest of this.w.guests.openRequests()) {
      if (guest.request === kind && !this.w.staff.isHandled(guest)) n++;
    }
    return n;
  }

  private bathroomNeed(kind: 'towel' | 'roll'): number {
    const w = this.w;
    const max = kind === 'towel' ? w.econ.facilities.bathroomTowelMax : w.econ.facilities.bathroomRollMax;
    const threshold = w.econ.facilities.bathroomRestockThreshold;
    let n = 0;
    for (const bath of w.train.bathrooms) {
      if (!bath.unlocked || bath.restocker) continue;
      const stock = kind === 'towel' ? bath.towels : bath.rolls;
      // Top up only once a bathroom runs low, so the shelves are not calling for attention all the time.
      if (stock <= threshold) n += max - stock;
    }
    return n;
  }

  private staffCarrying(kind: ItemKind): number {
    let n = 0;
    for (const m of this.w.staff.members) n += m.stack.countOf(kind);
    return n;
  }
}
