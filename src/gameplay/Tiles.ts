import * as THREE from 'three';
import { UNLOCKS, type UnlockDef } from '../config/content';
import type { Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { TileView } from '../world/ZoneViews';
import type { World } from './World';
import { Zone } from './Zones';

const DWELL_SECONDS = 0.3;
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

  refresh(): void {
    const w = this.w;
    const available = new Set(w.unlocks.available().map((d) => d.id));
    for (const [id, entry] of this.entries) {
      if (!available.has(id)) this.removeEntry(id, entry);
    }
    for (const def of w.unlocks.available()) {
      if (this.entries.has(def.id)) continue;
      if (def.kind === 'couple' && (w.train.coupling || def.carriage !== w.train.count)) continue;
      if (def.carriage >= w.train.count && def.kind !== 'couple') continue;
      const pos = this.positionFor(def);
      if (!pos) continue;
      this.addEntry(def, pos);
    }
    this.refreshPreview();
  }

  private refreshPreview(): void {
    const w = this.w;
    const next = UNLOCKS.find((u) => u.kind === 'couple' && u.carriage === w.train.count);
    const show = !!next && !w.train.coupling && !w.unlocks.isAvailable(next.id) && !w.unlocks.isUnlocked(next.id);
    if (!show || (this.preview && this.preview.id !== next!.id)) {
      if (this.preview) {
        w.scene.remove(this.preview.view.group);
        this.preview.view.dispose();
        this.preview = null;
      }
    }
    if (show && !this.preview && next) {
      const view = new TileView(1.6);
      const pos = w.map.rearDeck().tile;
      view.setPosition(pos.x, pos.z);
      view.face.draw('carriage', next.price, 0, false, false, true);
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
    for (const entry of this.entries.values()) {
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
        const def = UNLOCKS.find((u) => u.id === this.preview!.id);
        const waiting = def?.requires.map((id) => UNLOCKS.find((u) => u.id === id)).find((u) => u && !this.w.unlocks.isUnlocked(u.id));
        if (def) return { label: def.label, effect: waiting ? `Unlocks after ${waiting.label}` : def.effect, x: pos.x, z: pos.z, locked: true };
      }
    }
    return null;
  }

  /** The cheapest visible tile, for guidance and cash offers. */
  cheapest(): TileEntry | null {
    let best: TileEntry | null = null;
    for (const entry of this.entries.values()) {
      if (!best || this.w.unlocks.remaining(entry.def.id) < this.w.unlocks.remaining(best.def.id)) best = entry;
    }
    return best;
  }

  private addEntry(def: UnlockDef, pos: Vec2): void {
    const w = this.w;
    const view = new TileView(def.kind === 'couple' ? 1.6 : 1.3);
    view.setPosition(pos.x, pos.z);
    w.scene.add(view.group);
    const entry: TileEntry = { def, view, pos, acc: 0, billTimer: 0, stand: 0, paidThisVisit: 0, zone: null as unknown as Zone };
    entry.zone = w.zones.add(new Zone({
      id: `tile:${def.id}`,
      x: pos.x,
      z: pos.z,
      radius: def.kind === 'couple' ? 0.8 : 0.66,
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
    w.addStars(def.stars, 'unlock', entry.pos);
    w.analytics.log(EVENTS.unlockCompleted, { id: def.id, price: def.price, time: Math.round(w.lifetimeSeconds()) });
    w.analytics.log(EVENTS.currencySpent, { currency: 'cash', amount: def.price, sink: `unlock:${def.kind}` });
    w.events.emit('unlock.completed', { id: def.id, price: def.price, x: entry.pos.x, z: entry.pos.z });
    // Say what you just bought (the big moments get their own card instead).
    if (def.kind !== 'couple' && def.kind !== 'refurb') w.ui.toast(`${def.label}: ${def.effect}`, ICON_BY_KIND[def.kind]);

    if (def.kind === 'hire' && def.role) {
      w.staff.hire(def.role, def.carriage);
      w.addStars(w.econ.stars.staffHired, 'hire', entry.pos);
      w.analytics.log(EVENTS.staffHired, { role: def.role, carriage: def.carriage });
    } else if (def.kind === 'staffUpgrade' && def.role) {
      w.staff.upgrade(def.role, def.carriage);
    } else if (def.kind === 'couple') {
      w.train.coupleNext(() => this.refresh());
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
        return map.hasAnchor(def.carriage, 'tile_refurb') ? map.anchor(def.carriage, 'tile_refurb') : null;
      case 'couple':
        return map.rearDeck().tile;
    }
  }
}
