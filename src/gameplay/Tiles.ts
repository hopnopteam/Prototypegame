import * as THREE from 'three';
import type { UnlockDef } from '../config/content';
import type { Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { COUPLE_TILE_SIZE, STATION_TILE_POS, TILE_SIZE, ZONE_RADIUS } from '../world/layout';
import { markWorldUi, TileView } from '../world/ZoneViews';
import type { World } from './World';
import { Zone } from './Zones';

const DWELL_SECONDS = 0.3;
/** Camera zoom kick and slow-motion beat (real seconds) when a tile completes. */
const UNLOCK_PUNCH = 0.05;
const UNLOCK_HIT_STOP = 0.14;
/** Station upgrades live on the platform and only while the train is in. */
const isStation = (def: UnlockDef): boolean => def.kind === 'exterior' || def.kind === 'marketing';
const BILL_INTERVAL = 0.07;

interface TileEntry {
  def: UnlockDef;
  view: TileView;
  zone: Zone;
  pos: Vec2;
  acc: number;
  billTimer: number;
  stand: number;
  paidThisVisit: number;
}

const ICON_BY_KIND: Record<UnlockDef['kind'], IconName> = {
  cabin: 'bed',
  hire: 'person',
  couple: 'carriage',
  bathroom: 'bath',
  refurb: 'paint',
  staffUpgrade: 'plus',
  comfort: 'heart',
  exterior: 'paint',
  marketing: 'megaphone',
};

/**
 * Unlock tiles on the floor (§4 "Unlock"): stand on one and cash streams from the conductor into it; when it
 * fills, the thing it unlocks pops into existence. The chain reveals the next tiles as each completes.
 */
export class Tiles {
  private readonly entries = new Map<string, TileEntry>();
  /** The next carriage, shown locked on the rear deck from the start: the big goal is always in view. */
  private preview: { id: string; view: TileView } | null = null;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  /** Seconds the player has stood on a tile without enough cash (drives the cash-stash offer). */
  shortOfCash = 0;
  shortTileRemaining = 0;

  constructor(private readonly w: World) {
    // Tile faces are painted on canvas; repaint once the display fonts arrive.
    document.fonts?.ready.then(() => {
      for (const entry of this.entries.values()) entry.view.face.invalidate();
    }).catch(() => undefined);
  }

  /**
   * Shows the next goals, never a floor full of price tags: the coupling tile (the big goal) plus at most
   * a couple of others, each the next step in its own carriage, cheapest first. During the first minute
   * only one tile is shown, so the first lesson is unmistakable.
   */
  refresh(): void {
    const w = this.w;
    const available = w.unlocks.available();
    const availableIds = new Set(available.map((d) => d.id));
    for (const [id, entry] of this.entries) {
      if (!availableIds.has(id)) this.removeEntry(id, entry);
    }
    // Station upgrades: the next of each kind waits on the platform (shown only while the train is in).
    for (const kind of ['exterior', 'marketing'] as const) {
      if ([...this.entries.values()].some((e) => e.def.kind === kind)) continue;
      const next = available.find((d) => d.kind === kind);
      if (next) this.addEntry(next, { ...STATION_TILE_POS[kind] });
    }
    const eligible = available.filter((def) => {
      if (isStation(def)) return false;
      if (def.kind === 'couple') return !w.train.coupling && def.carriage === w.train.count;
      return def.carriage < w.train.count;
    });
    const couple = eligible.find((d) => d.kind === 'couple');
    if (couple && !this.entries.has(couple.id)) {
      const pos = this.positionFor(couple);
      if (pos) this.addEntry(couple, pos);
    }
    const cap = w.data.profile.ftue.first_unlock === undefined ? 1 : w.econ.tiles.maxVisible;
    let shown = [...this.entries.values()].filter((e) => e.def.kind !== 'couple' && !isStation(e.def)).length;
    if (shown >= cap) {
      this.refreshPreview();
      return;
    }
    // One candidate per carriage (the first in its designed order), then the cheapest of those.
    const firstPerCarriage = new Map<number, UnlockDef>();
    for (const def of eligible) {
      if (def.kind === 'couple' || this.entries.has(def.id)) continue;
      if ([...this.entries.values()].some((e) => e.def.carriage === def.carriage && e.def.kind !== 'couple' && !isStation(e.def))) continue;
      if (!firstPerCarriage.has(def.carriage)) firstPerCarriage.set(def.carriage, def);
    }
    const candidates = [...firstPerCarriage.values()].sort((a, b) => w.unlocks.remaining(a.id) - w.unlocks.remaining(b.id));
    // Anything already part-paid comes first: a tile you have put money into never disappears.
    for (const def of eligible) if (def.kind !== 'couple' && !this.entries.has(def.id) && w.unlocks.paid(def.id) > 0 && !candidates.includes(def)) candidates.unshift(def);
    for (const def of candidates) {
      if (shown >= cap) break;
      const pos = this.positionFor(def);
      if (!pos) continue;
      this.addEntry(def, pos);
      shown++;
    }
    this.refreshPreview();
  }

  private refreshPreview(): void {
    const w = this.w;
    const next = w.unlocks.defs.find((u) => u.kind === 'couple' && u.carriage === w.train.count);
    const show = !!next && !w.train.coupling && !w.unlocks.isAvailable(next.id) && !w.unlocks.isUnlocked(next.id);
    if (!show || (this.preview && this.preview.id !== next!.id)) {
      if (this.preview) {
        w.scene.remove(this.preview.view.group);
        this.preview.view.dispose();
        this.preview = null;
      }
    }
    if (show && !this.preview && next) {
      const view = new TileView(COUPLE_TILE_SIZE, true);
      const pos = w.map.rearDeck().tile;
      view.setPosition(pos.x, pos.z);
      view.face.draw('carriage', next.price, 0, false, false, true);
      markWorldUi(view.group);
      w.scene.add(view.group);
      this.preview = { id: next.id, view };
    }
  }

  get list(): TileEntry[] {
    return [...this.entries.values()];
  }

  update(dt: number): void {
    const cash = this.w.wallet.get('cash');
    let anyShort = false;
    const atStation = this.w.journey.phase === 'stationStop';
    for (const entry of this.entries.values()) {
      if (isStation(entry.def)) {
        entry.view.group.visible = atStation;
        entry.zone.enabled = atStation;
        if (!atStation) continue;
      }
      const remaining = this.w.unlocks.remaining(entry.def.id);
      const progress = 1 - remaining / entry.def.price;
      const affordable = cash >= remaining;
      const active = entry.zone.playerInside;
      if (active && remaining > 0 && cash <= 0 && entry.stand > DWELL_SECONDS) {
        anyShort = true;
        this.shortTileRemaining = remaining;
      }
      entry.view.face.draw(ICON_BY_KIND[entry.def.kind], remaining, progress, affordable, active);
      entry.view.update(dt, affordable, active);
      if (!active) {
        entry.stand = 0;
        entry.paidThisVisit = 0;
      }
    }
    this.preview?.view.update(dt, false, false);
    this.shortOfCash = anyShort ? this.shortOfCash + dt : 0;
  }

  /**
   * The tile nearest to a point (within `range`) with its name and what it does, for the label over it. The
   * locked next-carriage preview says what it is waiting for.
   */
  nearTag(p: Vec2, range: number): { label: string; effect: string; x: number; z: number; locked: boolean } | null {
    let best: TileEntry | null = null;
    let bestD = range * range;
    for (const entry of this.entries.values()) {
      if (isStation(entry.def) && !entry.view.group.visible) continue;
      // Standing on it: the tile face shows the fill, and a label would sit on the conductor's head.
      if (entry.zone.playerInside) return null;
      const d = (entry.pos.x - p.x) ** 2 + (entry.pos.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = entry;
      }
    }
    if (best) return { label: best.def.label, effect: best.def.effect, x: best.pos.x, z: best.pos.z, locked: false };
    if (this.preview) {
      const pos = this.w.map.rearDeck().tile;
      if ((pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 < range * range) {
        const defs = this.w.unlocks.defs;
        const def = defs.find((u) => u.id === this.preview!.id);
        const waiting = def?.requires.map((id) => defs.find((u) => u.id === id)).find((u) => u && !this.w.unlocks.isUnlocked(u.id));
        if (def) return { label: def.label, effect: waiting ? `Unlocks after ${waiting.label}` : def.effect, x: pos.x, z: pos.z, locked: true };
      }
    }
    return null;
  }

  /** The cheapest visible tile, for guidance and cash offers. */
  cheapest(): TileEntry | null {
    let best: TileEntry | null = null;
    const atStation = this.w.journey.phase === 'stationStop';
    for (const entry of this.entries.values()) {
      if (isStation(entry.def) && !atStation) continue;
      if (!best || this.w.unlocks.remaining(entry.def.id) < this.w.unlocks.remaining(best.def.id)) best = entry;
    }
    return best;
  }

  private addEntry(def: UnlockDef, pos: Vec2): void {
    const w = this.w;
    const view = new TileView(def.kind === 'couple' ? COUPLE_TILE_SIZE : TILE_SIZE);
    view.setPosition(pos.x, pos.z);
    markWorldUi(view.group);
    w.scene.add(view.group);
    const entry: TileEntry = { def, view, pos, acc: 0, billTimer: 0, stand: 0, paidThisVisit: 0, zone: null as unknown as Zone };
    entry.zone = w.zones.add(new Zone({
      id: `tile:${def.id}`,
      x: pos.x,
      z: pos.z,
      radius: def.kind === 'couple' ? ZONE_RADIUS.coupleTile : ZONE_RADIUS.tile,
      staff: false,
      ring: false,
      priority: 1,
      active: () => w.unlocks.isAvailable(def.id),
      stay: (_zone, _actor, dt) => this.drain(entry, dt),
    }));
    this.entries.set(def.id, entry);
    if (w.time > 1) w.audio.play('pop', { pitch: 0.8, volume: 0.6 });
  }

  private removeEntry(id: string, entry: TileEntry): void {
    this.w.zones.remove(entry.zone);
    this.w.scene.remove(entry.view.group);
    entry.view.dispose();
    this.entries.delete(id);
  }

  private drain(entry: TileEntry, dt: number): boolean {
    const w = this.w;
    const id = entry.def.id;
    entry.stand += dt;
    // A short dwell, so walking across a tile never spends money by accident.
    if (entry.stand < DWELL_SECONDS) return false;
    const remaining = w.unlocks.remaining(id);
    if (remaining <= 0) {
      this.complete(entry);
      return true;
    }
    const cash = w.wallet.get('cash');
    if (cash <= 0) return false;
    const rate = Math.max(w.econ.zones.tileMinDrainPerSecond, entry.def.price / w.econ.zones.tileFillSeconds);
    entry.acc += rate * dt;
    const amount = Math.min(Math.floor(entry.acc), remaining, Math.floor(cash));
    if (amount > 0) {
      entry.acc -= amount;
      w.wallet.take('cash', amount, `unlock:${id}`);
      w.unlocks.pay(id, amount);
      entry.paidThisVisit += amount;
      w.save.markDirty();
    }
    entry.billTimer -= dt;
    if (entry.billTimer <= 0) {
      entry.billTimer = BILL_INTERVAL;
      const player = w.player;
      w.cashView.stream(
        () => this.from.set(player.pos.x, FLOOR_Y + 0.9, player.pos.z),
        () => this.to.set(entry.pos.x, FLOOR_Y + 0.1, entry.pos.z),
        1,
        0,
      );
      w.audio.play('coin', { pitch: 0.9 + (1 - remaining / entry.def.price) * 0.6 });
      w.events.emit('tile.draining', { x: entry.pos.x, z: entry.pos.z });
    }
    if (w.unlocks.remaining(id) <= 0) this.complete(entry);
    return true;
  }

  private complete(entry: TileEntry): void {
    const w = this.w;
    const def = entry.def;
    if (!w.unlocks.complete(def.id)) return;
    w.save.markDirty();
    this.removeEntry(def.id, entry);
    w.audio.play('unlock');
    w.haptics.success();
    w.particles.emit('sparkle', entry.pos.x, FLOOR_Y + 0.4, entry.pos.z, 24, 0.6);
    w.particles.emit('star', entry.pos.x, FLOOR_Y + 0.6, entry.pos.z, 10, 0.4);
    w.stage.rig.shake(0.12, 0.2);
    // Weight: a zoom kick and a beat of slow motion as the new thing pops into existence.
    w.stage.rig.punch(def.kind === 'couple' ? 0.02 : UNLOCK_PUNCH);
    if (def.kind !== 'couple' && def.kind !== 'refurb') w.hitStop(UNLOCK_HIT_STOP);
    w.addStars(def.stars, 'unlock', entry.pos);
    w.analytics.log(EVENTS.unlockCompleted, { id: def.id, price: def.price, time: Math.round(w.lifetimeSeconds()) });
    w.analytics.log(EVENTS.currencySpent, { currency: 'cash', amount: def.price, sink: `unlock:${def.kind}` });
    w.events.emit('unlock.completed', { id: def.id, price: def.price, x: entry.pos.x, z: entry.pos.z });
    // Say what you just bought, right where it happened (the big moments get their own card instead).
    if (def.kind !== 'couple' && def.kind !== 'refurb') w.ui.floatText(`${def.label}!`, entry.pos.x, FLOOR_Y + 2.1, entry.pos.z, 'info');

    if (def.kind === 'hire' && def.role) {
      w.staff.hire(def.role, def.carriage);
      w.addStars(w.econ.stars.staffHired, 'hire', entry.pos);
      w.analytics.log(EVENTS.staffHired, { role: def.role, carriage: def.carriage });
    } else if (def.kind === 'staffUpgrade' && def.role) {
      w.staff.upgrade(def.role, def.carriage);
    } else if (def.kind === 'couple') {
      w.train.requestCoupling(() => this.refresh());
    } else {
      w.train.applyUnlock(def, true);
    }
    this.refresh();
  }

  private positionFor(def: UnlockDef): Vec2 | null {
    const w = this.w;
    const map = w.map;
    switch (def.kind) {
      case 'cabin': {
        const cabin = w.train.cabins.find((c) => c.carriage === def.carriage && c.index === def.cabin);
        return cabin ? { ...cabin.center } : null;
      }
      case 'bathroom': {
        const bath = w.train.bathrooms.find((b) => b.carriage === def.carriage && b.layout.index === def.bathroom);
        return bath ? { ...bath.restock } : null;
      }
      case 'hire':
        return map.hasAnchor(def.carriage, `home_${def.role}`) ? map.anchor(def.carriage, `home_${def.role}`) : null;
      case 'staffUpgrade':
        return map.hasAnchor(def.carriage, `tile_up_${def.role}`) ? map.anchor(def.carriage, `tile_up_${def.role}`) : null;
      case 'refurb':
      case 'comfort':
        // Refits and comforts share the carriage's one improvement spot (only one is on show at a time).
        return map.hasAnchor(def.carriage, 'tile_refurb') ? map.anchor(def.carriage, 'tile_refurb') : null;
      case 'couple':
        return map.rearDeck().tile;
      case 'exterior':
      case 'marketing':
        return { ...STATION_TILE_POS[def.kind] };
    }
  }
}
