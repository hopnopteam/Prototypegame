import * as THREE from 'three';
import type { ItemKind } from '../core/types';
import type { Actor } from './Actor';
import type { World } from './World';
import type { Zone } from './Zones';

export interface SourceSpec {
  kind: ItemKind;
  /** World point items fly out of (and back into). */
  point: () => THREE.Vector3;
  stock: () => number;
  take: () => void;
  /** Puts a returned item back. Sources without it never take items back. */
  giveBack?: (kind: ItemKind) => void;
  /**
   * Phase 4: every kind the source takes back (the barrow: suitcases and surfboards, whichever is on top). Defaults to
   * `kind` alone.
   */
  returns?: readonly ItemKind[];
  /** Seconds between items once the actor has settled in. */
  interval: number;
}

const tmp = new THREE.Vector3();

/** What the actor holds that this source would take back (none for a source that takes nothing back). */
function returnable(w: World, actor: Actor, spec: SourceSpec): ItemKind | null {
  if (!spec.giveBack) return null;
  for (const kind of spec.returns ?? [spec.kind]) if (w.demand.surplus(actor, kind) > 0) return kind;
  return null;
}

/** Whether a source has anything to do for anyone right now (drives the zone's active state). */
export function sourceActive(w: World, spec: SourceSpec): boolean {
  const d = w.demand;
  const player = w.player;
  if (returnable(w, player, spec)) return true;
  if (spec.stock() <= 0) return false;
  if (d.playerWants(spec.kind) > 0) return true;
  for (const m of w.staff.members) if (d.wants(m, spec.kind) || returnable(w, m, spec)) return true;
  return false;
}

/**
 * Standing at a supply source. The ring fills over a short dwell first, so walking past never grabs
 * anything; then surplus goes back on the shelf and exactly the needed items come off it, one by one.
 */
export function sourceStay(w: World, zone: Zone, actor: Actor, dt: number, spec: SourceSpec): boolean {
  const d = w.demand;
  const back = returnable(w, actor, spec);
  const canReturn = back !== null;
  const canTake = !actor.stack.isFull && spec.stock() > 0 && d.wants(actor, spec.kind);
  if (!canReturn && !canTake) {
    if (actor.isPlayer) zone.progress = 0;
    return false;
  }
  const dwell = actor.isPlayer ? w.econ.zones.pickupDwellSeconds : w.econ.zones.staffPickupDwellSeconds;
  if (zone.timer < dwell) {
    zone.timer += dt * actor.workMultiplier;
    if (actor.isPlayer) zone.progress = Math.min(1, zone.timer / dwell);
    return true;
  }
  zone.repeat -= dt * actor.workMultiplier;
  if (zone.repeat > 0) return true;
  zone.repeat = spec.interval;

  if (canReturn) {
    actor.stack.remove(back, () => spec.point());
    spec.giveBack!(back);
    w.audio.play('drop', { pitch: 1.2 });
    w.events.emit('item.returned', { item: back, byPlayer: actor.isPlayer });
    return true;
  }
  actor.stack.add(spec.kind, tmp.copy(spec.point()));
  spec.take();
  actor.view.bounce(0.3);
  w.audio.play('pickup', { pitch: 1 + actor.stack.count * 0.08 });
  if (actor.isPlayer) w.haptics.light();
  w.events.emit('item.picked', { item: spec.kind, byPlayer: actor.isPlayer });
  return true;
}
