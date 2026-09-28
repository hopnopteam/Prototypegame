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
  giveBack?: () => void;
  /** Seconds between items once the actor has settled in. */
  interval: number;
}

const tmp = new THREE.Vector3();

/** Whether a source has anything to do for anyone right now (drives the zone's active state). */
export function sourceActive(w: World, spec: SourceSpec): boolean {
  const d = w.demand;
  const player = w.player;
  if (spec.giveBack && d.surplus(player, spec.kind) > 0) return true;
  if (spec.stock() <= 0) return false;
  if (d.playerWants(spec.kind) > 0) return true;
  for (const m of w.staff.members) if (d.wants(m, spec.kind) || (spec.giveBack && d.surplus(m, spec.kind) > 0)) return true;
  return false;
}

/**
 * Standing at a supply source. The ring fills over a short dwell first, so walking past never grabs
 * anything; then surplus goes back on the shelf and exactly the needed items come off it, one by one.
 */
export function sourceStay(w: World, zone: Zone, actor: Actor, dt: number, spec: SourceSpec): boolean {
  const d = w.demand;
  const canReturn = !!spec.giveBack && d.surplus(actor, spec.kind) > 0;
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
    actor.stack.remove(spec.kind, () => spec.point());
    spec.giveBack!();
    w.audio.play('drop', { pitch: 1.2 });
    w.events.emit('item.returned', { item: spec.kind, byPlayer: actor.isPlayer });
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
