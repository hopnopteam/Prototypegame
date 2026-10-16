import * as THREE from 'three';
import { WORK_VERB, type UnlockDef } from '../config/content';
import type { Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { carriageOriginZ, COUPLE_TILE_SIZE, doorTileSpot, STATION_TILE_POS, TILE_SIZE, ZONE_RADIUS } from '../world/layout';
import { PLATFORM } from '../world/platformLayout';
import { markWorldUi, TileView } from '../world/ZoneViews';
import type { World } from './World';
import { Zone } from './Zones';

const DWELL_SECONDS = 0.3;
/** Camera zoom kick when a tile completes (session 16: no slow-motion beat; on a phone it read as a hitch). */
const UNLOCK_PUNCH = 0.05;
/** Seconds after a purchase before the next tile pops up: its own beat, never in the purchase's frame. */
const NEXT_TILE_DELAY = 0.45;
/** The plate's fill is redrawn in steps of this fraction (each redraw is a texture upload). */
const FILL_STEP = 1 / 24;
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
  /** Seconds on show (a new tile keeps its marker a moment, so the player sees what just appeared). */
  age: number;
  /** Still being earned by hand (session 29): it shows its count and takes no money yet. */
  earning: boolean;
  /** The "can't pay" tock has sounded this visit. */
  tocked?: boolean;
}

/** A newly shown tile keeps its marker this long even when it is not the focus. */
const NEW_TILE_MARKER_SECONDS = 4;

/** A tile's name as its marker shows it: the essential word or two ("Comfort", not "Comfort Class"). */

function markerName(label: string): string {
  return label.replace(/ Class$/, '').replace(/^(Hire|Buy|Add) /, '').replace(/^Upgrade /, '');
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
  // Session 20: the venues (a seat tile shows the venue's own icon, see iconOf).
  seat: 'plus',
  menu: 'star',
  station: 'gear',
  open: 'carriage',
  rack: 'luggage',
};

/** A tile's icon: its kind's, or for a venue's seats and menus the venue's own (a cup, a cloche, a glass). */
function iconOf(def: UnlockDef, type: string | undefined): IconName {
  if (def.kind === 'seat' || def.kind === 'menu') {
    if (def.id.endsWith('menu_pastry')) return 'pastry';
    if (type === 'cafe') return 'latte';
    if (type === 'dining') return 'meal';
    if (type === 'bar') return 'cocktail';
    if (type === 'dome') return 'binoculars';
    if (type === 'cinema') return def.id.endsWith('menu_snacks') ? 'popcorn' : 'film';
  }
  return ICON_BY_KIND[def.kind];
}

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
   * Shows the next goals, never a floor full of price tags. The opening shows one purchase at a time, in
   * order (session 16); after it, the coupling tile (the big goal) plus at most a couple of others, each the
   * next step in its own carriage, cheapest first, and up to `maxRefits` refits.
   */
  refresh(): void {
    const w = this.w;
    w.train.retireBerthTiles();
    // Session 29: a tile still being earned by hand is on show too (counting), so "listed", not only "available".
    const available = w.unlocks.listed();
    const availableIds = new Set(available.map((d) => d.id));
    for (const [id, entry] of this.entries) {
      if (!availableIds.has(id)) this.removeEntry(id, entry);
    }
    // Nothing new appears while a reveal plays (the opening's carriage coming open): it has the stage.
    if (w.reveal?.busy) {
      this.refreshPreview();
      return;
    }
    // Station upgrades: the next of each kind waits on the platform (shown only while the train is in), once
    // the flow has reached the station workshop.
    const workshop = w.flow.allows('workshop');
    for (const kind of ['exterior', 'marketing'] as const) {
      if (!workshop || [...this.entries.values()].some((e) => e.def.kind === kind)) continue;
      const next = available.find((d) => d.kind === kind);
      if (next) this.addEntry(next, { ...STATION_TILE_POS[kind] });
    }
    const eligible = available.filter((def) => {
      if (isStation(def)) return false;
      if (def.kind === 'couple') return !w.train.coupling && def.carriage === w.train.count;
      return def.carriage < w.train.count;
    });
    // The opening sells one thing at a time, in order (config: flow.openingTiles): only its next purchase is
    // on show, plus anything already part-paid (money put into a tile never disappears).
    const opening = w.flow.openingTile();
    if (opening !== null) {
      // One guest first: the first upgrade appears once their fare is in the player's pocket.
      // Session 32: once the carriage is open, no upgrade shows until the first-passengers tutorial is over.
      const held = (w.coach?.tutorial ?? false) && w.unlocks.isUnlocked('c0.open');
      const earned = !held && (w.data.profile.ftue.first_cash !== undefined || w.unlocks.paid(opening) > 0);
      for (const def of eligible) {
        if (this.entries.has(def.id) || ((def.id !== opening || !earned) && w.unlocks.paid(def.id) <= 0)) continue;
        const pos = this.positionFor(def);
        if (pos) this.addEntry(def, pos);
      }
      this.refreshPreview();
      return;
    }
    // While a carriage is joining, nothing new appears elsewhere: the newcomer's own tiles come first.
    if (w.train.growing) {
      this.refreshPreview();
      return;
    }
    const couple = eligible.find((d) => d.kind === 'couple');
    if (couple && !this.entries.has(couple.id)) {
      const pos = this.positionFor(couple);
      if (pos) this.addEntry(couple, pos);
    }
    // A carriage's next refit is a big, visible goal: it takes the improvement spot as soon as it is
    // available (cheapest first, at most `maxRefits` on show, each on its own carriage), outside the cap and
    // ahead of that carriage's comforts, so its price is always in view. Two at once means a dear class
    // upgrade on one carriage never hides the next class on another (session 12).
    const refits = eligible.filter((d) => d.kind === 'refurb').sort((a, b) => w.unlocks.remaining(a.id) - w.unlocks.remaining(b.id));
    for (const refit of refits) {
      const showing = [...this.entries.values()].filter((e) => e.def.kind === 'refurb');
      if (showing.length >= w.econ.tiles.maxRefits) break;
      if (showing.some((e) => e.def.carriage === refit.carriage)) continue;
      const occupant = [...this.entries.values()].find((e) => e.def.carriage === refit.carriage && e.def.kind === 'comfort');
      if (occupant && w.unlocks.paid(occupant.def.id) > 0) continue;
      const pos = this.positionFor(refit);
      if (!pos) continue;
      if (occupant) this.removeEntry(occupant.def.id, occupant);
      this.addEntry(refit, pos);
    }
    // Help still being earned (session 29) has a lane of its own outside the cap: one at a time, the next helper, its
    // count always in view as the goal the hand work is building toward.
    const earning = (d: UnlockDef): boolean => !w.unlocks.isAvailable(d.id);
    if (![...this.entries.values()].some((e) => earning(e.def))) {
      const goal = eligible.find((d) => earning(d) && !this.entries.has(d.id));
      const pos = goal ? this.positionFor(goal) : null;
      if (goal && pos) this.addEntry(goal, pos);
    }
    const regular = (d: UnlockDef): boolean => d.kind !== 'couple' && d.kind !== 'refurb' && !isStation(d) && !earning(d);
    const cap = w.flow.allows('moreTiles') ? w.econ.tiles.maxVisible : 1;
    let shown = [...this.entries.values()].filter((e) => regular(e.def)).length;
    // A carriage that has just joined comes first: its first tile is the obvious next step, so it takes the place
    // of an unpaid tile elsewhere (session 16: the new sleeper's first cabin had waited behind the lobby's lamps).
    const fresh = (carriage: number): boolean => !w.unlocks.defs.some((d) => d.carriage === carriage && d.kind !== 'couple' && !isStation(d) && w.unlocks.isUnlocked(d.id));
    const freshFirst = eligible.find((d) => regular(d) && fresh(d.carriage) && !this.entries.has(d.id));
    if (freshFirst && shown >= cap) {
      const spare = [...this.entries.values()]
        .filter((e) => regular(e.def) && !fresh(e.def.carriage) && w.unlocks.paid(e.def.id) <= 0)
        .sort((a, b) => w.unlocks.remaining(b.def.id) - w.unlocks.remaining(a.def.id))[0];
      if (spare) {
        this.removeEntry(spare.def.id, spare);
        shown--;
      }
    }
    if (shown >= cap) {
      this.refreshPreview();
      return;
    }
    const refitSpot = new Set([...this.entries.values()].filter((e) => e.def.kind === 'refurb').map((e) => e.def.carriage));
    // One candidate per carriage (the first in its designed order), then the cheapest of those (a new carriage's first).
    const firstPerCarriage = new Map<number, UnlockDef>();
    for (const def of eligible) {
      if (!regular(def) || this.entries.has(def.id)) continue;
      if (def.kind === 'comfort' && refitSpot.has(def.carriage)) continue;
      if ([...this.entries.values()].some((e) => e.def.carriage === def.carriage && regular(e.def))) continue;
      if (!firstPerCarriage.has(def.carriage)) firstPerCarriage.set(def.carriage, def);
    }
    const rank = (d: UnlockDef): number => (fresh(d.carriage) ? 0 : 1e9) + w.unlocks.remaining(d.id);
    const candidates = [...firstPerCarriage.values()].sort((a, b) => rank(a) - rank(b));
    // Anything already part-paid comes first: a tile you have put money into never disappears.
    for (const def of eligible) if (regular(def) && !this.entries.has(def.id) && w.unlocks.paid(def.id) > 0 && !candidates.includes(def) && !(def.kind === 'comfort' && refitSpot.has(def.carriage))) candidates.unshift(def);
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
    // The locked next-carriage plate joins once a carriage has coupled (in the opening the coupling arrives in
    // its turn, config: flow).
    const show = !!next && w.flow.allows('couplePreview') && !w.train.coupling && !w.unlocks.isAvailable(next.id) && !w.unlocks.isUnlocked(next.id);
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
      view.marker.draw('carriage', markerName(next.label), next.price, false, true);
      markWorldUi(view.group);
      w.scene.add(view.group);
      this.preview = { id: next.id, view };
    }
  }

  get list(): TileEntry[] {
    return [...this.entries.values()];
  }

  /**
   * A tile stands at this spot (checked every frame by the UI: no allocation). Decided from positions only, never
   * from what is showing: the coach's line, the close-up label and the marker used to hide one another in turn
   * and flickered every frame (session 16).
   */
  tileAt(x: number, z: number): boolean {
    for (const entry of this.entries.values()) {
      if (entry.view.group.visible && Math.abs(entry.pos.x - x) < 0.05 && Math.abs(entry.pos.z - z) < 0.05) return true;
    }
    return false;
  }

  update(dt: number): void {
    const w = this.w;
    const cash = w.wallet.get('cash');
    let anyShort = false;
    const atStation = w.journey.phase === 'stationStop';
    // Every upgrade always in view (session 23, owner: "upgrades aren't visible"): every tile on show wears its
    // floating marker. The one that matters now is the loudest (session 16, one focus at a time): the guide's
    // target, a tile that has just appeared and any you can afford are full size; the rest are smaller and softer.
    const focus = w.guidance.focus;
    for (const entry of this.entries.values()) {
      if (isStation(entry.def)) {
        entry.view.group.visible = atStation;
        entry.zone.enabled = atStation;
        if (!atStation) continue;
      }
      entry.age += dt;
      const icon = iconOf(entry.def, w.train.types[entry.def.carriage]);
      const short = w.unlocks.workShort(entry.def);
      if (short) {
        // Still being earned: a greyed plate and the count on its marker; it takes no money yet.
        entry.earning = true;
        entry.view.face.draw(icon, w.unlocks.remaining(entry.def.id), 0, false, false, true);
        const marker = entry.def.id !== this.taggedId;
        if (marker) entry.view.marker.drawEarning(icon, markerName(entry.def.label), WORK_VERB[short.metric], short.done, short.need);
        entry.view.update(dt, false, false, marker, false);
        continue;
      }
      if (entry.earning) this.earned(entry);
      const remaining = w.unlocks.remaining(entry.def.id);
      const progress = Math.floor((1 - remaining / entry.def.price) / FILL_STEP) * FILL_STEP;
      const affordable = cash >= remaining;
      const active = entry.zone.playerInside;
      if (active && remaining > 0 && cash <= 0 && entry.stand > DWELL_SECONDS) {
        anyShort = true;
        this.shortTileRemaining = remaining;
        // Session 29: can't pay any more: one very soft low "tock" per visit (never a buzzer).
        if (!entry.tocked) {
          entry.tocked = true;
          w.audio.play('tock');
        }
      }
      if (!active) entry.tocked = false;
      const focused = !!focus && Math.abs(focus.x - entry.pos.x) < 0.05 && Math.abs(focus.z - entry.pos.z) < 0.05;
      const marker = entry.def.id !== this.taggedId;
      const quiet = !focused && entry.age >= NEW_TILE_MARKER_SECONDS && !affordable;
      entry.view.face.draw(icon, remaining, progress, affordable, active);
      // (Not while standing on it: the marker is hidden then, and each redraw is a texture upload.)
      if (marker && !active) entry.view.marker.draw(icon, markerName(entry.def.label), remaining, affordable);
      entry.view.update(dt, affordable, active, marker, quiet);
      if (!active) {
        entry.stand = 0;
        entry.paidThisVisit = 0;
      }
      this.maybeReveal(entry);
    }
    this.preview?.view.update(dt, false, false);
    this.shortOfCash = anyShort ? this.shortOfCash + dt : 0;
  }

  /** The hand work behind a tile is done (session 29): it can be bought now. A sparkle and a chime say so. */
  private earned(entry: TileEntry): void {
    const w = this.w;
    entry.earning = false;
    entry.age = 0;
    w.particles.emit('sparkle', entry.pos.x, FLOOR_Y + 0.5, entry.pos.z, 20, 0.6);
    w.audio.play('ready');
    w.ui.floatIcon('check', entry.pos.x, FLOOR_Y + 1.6, entry.pos.z, 'info');
    w.events.emit('work.earned', { id: entry.def.id });
    w.analytics.log('work_earned', { role: entry.def.role ?? entry.def.id, time: Math.round(w.lifetimeSeconds()) });
    this.refresh();
  }

  /**
   * The first time a tile of a new kind appears away from the conductor (the first hire, refit, coupling,
   * station workshop), the camera glides over to show it and back: "look, something new" (config: flow.reveal).
   */
  private maybeReveal(entry: TileEntry): void {
    const w = this.w;
    const reveal = w.econ.flow.reveal;
    const flag = `reveal_${entry.def.kind}`;
    // (The game is paused under sheets and through the intro, so this never runs behind one.)
    if (w.stage.rig.focusing) return;
    // Session 32 (owner: "never move the camera away from the player in the middle of a task"): not during the
    // tutorial, not while a job is filling and not while the conductor carries something; it waits for a free moment.
    if (w.coach?.tutorial || w.zones.playerWorking || !w.player.stack.isEmpty) return;
    if (this.firstUpgradePan(entry)) return;
    if (!reveal.kinds.includes(entry.def.kind) || w.flag(flag)) return;
    const p = w.player.pos;
    w.data.profile.flags[flag] = true;
    w.save.markDirty();
    if (Math.hypot(entry.pos.x - p.x, entry.pos.z - p.z) < reveal.minDistance) return;
    w.stage.rig.focusOn(this.to.set(entry.pos.x, 0, entry.pos.z), reveal.seconds, reveal.zoom);
    w.audio.play('sparkle', { volume: 0.5, pitch: 1.1 });
    entry.age = 0;
  }

  /**
   * Session 32: after the first-passengers tutorial, the first upgrade the player can afford is shown once: one
   * short, gentle pan to it with the guide arrow over it, then back to the conductor (config: flow.firstUpgrade).
   */
  private firstUpgradePan(entry: TileEntry): boolean {
    const w = this.w;
    if (!w.flag('tut_v32') || w.flag('first_upgrade_pan') || isStation(entry.def) || entry.earning) return false;
    if (w.wallet.get('cash') < w.unlocks.remaining(entry.def.id)) return false;
    const pan = w.econ.flow.firstUpgrade;
    w.setFlag('first_upgrade_pan');
    w.guidance.pointAt(entry.pos, pan.arrowSeconds);
    entry.age = 0;
    if (Math.hypot(entry.pos.x - w.player.pos.x, entry.pos.z - w.player.pos.z) < w.econ.flow.reveal.minDistance) return true;
    w.stage.rig.focusOn(this.to.set(entry.pos.x, 0, entry.pos.z), pan.seconds, pan.zoom, pan.sharpness);
    w.audio.play('sparkle', { volume: 0.4, pitch: 1.1 });
    return true;
  }

  /**
   * The tile nearest to a point (within `range`) with its name and what it does, for the label over it. The
   * locked next-carriage preview says what it is waiting for.
   */
  /** The tile the close-up label is showing (its marker steps aside), or null. */
  private taggedId: string | null = null;

  /** The close-up label is not showing (hidden UI, or the guide has the floor): every marker shows. */
  clearTag(): void {
    this.taggedId = null;
  }

  nearTag(p: Vec2, range: number): { label: string; effect: string; x: number; z: number; locked: boolean } | null {
    this.taggedId = null;
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
    this.taggedId = best?.def.id ?? null;
    // The marker steps aside in this very frame: the step that hides it runs before the UI picks the label,
    // so the frame the label first showed used to draw both (a double label on a slow phone frame).
    if (best) best.view.marker.sprite.visible = false;
    if (best) {
      // Help still being earned says what is left to do by hand: "Tidy 7/12 · Serve 3/8".
      const work = best.def.work && this.w.unlocks.workShort(best.def) ? Object.entries(best.def.work).map(([m, need]) => `${WORK_VERB[m as keyof typeof WORK_VERB]} ${Math.min(need ?? 0, this.w.data.profile.handWork[m] ?? 0)}/${need}`).join(' · ') : null;
      return { label: best.def.label, effect: work ?? best.def.effect, x: best.pos.x, z: best.pos.z, locked: work !== null };
    }
    if (this.preview) {
      const pos = this.w.map.rearDeck().tile;
      if ((pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 < range * range) {
        const defs = this.w.unlocks.defs;
        const def = defs.find((u) => u.id === this.preview!.id);
        const waiting = def?.requires.map((id) => defs.find((u) => u.id === id)).find((u) => u && !this.w.unlocks.isUnlocked(u.id));
        if (def) return { label: def.label, effect: waiting ? `After ${waiting.label}` : def.effect, x: pos.x, z: pos.z, locked: true };
      }
    }
    return null;
  }

  /** The cheapest visible tile, for guidance and cash offers. */
  /**
   * The cheapest station upgrade on show and affordable right now (they only stand on the platform while the
   * train is in, so a player buys one during the stop or waits for the next).
   */
  stationBuy(cash: number): TileEntry | null {
    if (this.w.journey.phase !== 'stationStop') return null;
    let best: TileEntry | null = null;
    for (const entry of this.entries.values()) {
      if (!isStation(entry.def)) continue;
      const price = this.w.unlocks.remaining(entry.def.id);
      if (price > cash) continue;
      if (!best || price < this.w.unlocks.remaining(best.def.id)) best = entry;
    }
    return best;
  }

  cheapest(): TileEntry | null {
    let best: TileEntry | null = null;
    const atStation = this.w.journey.phase === 'stationStop';
    for (const entry of this.entries.values()) {
      if (isStation(entry.def) && !atStation) continue;
      if (!this.w.unlocks.isAvailable(entry.def.id)) continue;
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
    const entry: TileEntry = { def, view, pos, acc: 0, billTimer: 0, stand: 0, paidThisVisit: 0, age: 0, earning: !w.unlocks.isAvailable(def.id), zone: null as unknown as Zone };
    entry.zone = w.zones.add(new Zone({
      id: `tile:${def.id}`,
      x: pos.x,
      z: pos.z,
      radius: def.kind === 'couple' ? ZONE_RADIUS.coupleTile : ZONE_RADIUS.tile,
      staff: false,
      marker: false,
      priority: 1,
      active: () => w.unlocks.isAvailable(def.id),
      stay: (_zone, _actor, dt) => this.drain(entry, dt),
    }));
    this.entries.set(def.id, entry);
    if (w.time > 1) w.audio.play('pop', { pitch: 0.8, volume: 0.6 });
    // A brand-new tile from the start of a session is already known: only tiles that appear in play are "new".
    if (w.time <= 1) entry.age = NEW_TILE_MARKER_SECONDS;
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
      w.audio.play('drip', { pitch: 0.9 + (1 - remaining / entry.def.price) * 0.6 });
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
    // One cue per purchase (session 29): a hire has its own friendly chime instead of the unlock's.
    w.audio.play(def.kind === 'hire' ? 'staff' : 'unlock');
    w.haptics.success();
    w.particles.emit('sparkle', entry.pos.x, FLOOR_Y + 0.4, entry.pos.z, 24, 0.6);
    w.particles.emit('star', entry.pos.x, FLOOR_Y + 0.6, entry.pos.z, 10, 0.4);
    w.stage.rig.shake(0.12, 0.2);
    // Weight: a zoom kick as the new thing pops into existence.
    w.stage.rig.punch(def.kind === 'couple' ? 0.02 : UNLOCK_PUNCH);
    w.addStars(def.stars, 'unlock', entry.pos);
    w.analytics.log(EVENTS.unlockCompleted, { id: def.id, kind: def.kind, price: def.price, time: Math.round(w.lifetimeSeconds()) });
    w.analytics.log(EVENTS.currencySpent, { currency: 'cash', amount: def.price, sink: `unlock:${def.kind}` });
    w.events.emit('unlock.completed', { id: def.id, price: def.price, x: entry.pos.x, z: entry.pos.z });
    // What was bought pops into existence right there: the moment speaks for itself (no caption).

    if (def.kind === 'hire' && def.role) {
      const member = w.staff.hire(def.role, def.carriage);
      // Session 29 (partner: "the moment the attendant arrives, make it feel earned"): a card, confetti over the new
      // helper and the camera on them as they walk off to take over the work.
      w.ui.celebrate(def.label, def.effect, 'person');
      w.particles.emit('confetti', member.pos.x, FLOOR_Y + 2.2, member.pos.z, 40, 1.1);
      w.stage.rig.focusOn(this.to.set(member.pos.x, 0, member.pos.z), 2.2, 1.0);
      w.addStars(w.econ.stars.staffHired, 'hire', entry.pos);
      w.analytics.log(EVENTS.staffHired, { role: def.role ?? 'staff', carriage: def.carriage, time: Math.round(w.lifetimeSeconds()) });
    } else if (def.kind === 'staffUpgrade' && def.role) {
      w.staff.upgrade(def.role, def.carriage);
    } else if (def.kind === 'couple') {
      w.train.requestCoupling(() => this.refresh());
    } else {
      w.train.applyUnlock(def, true);
    }
    w.tweens.delay(NEXT_TILE_DELAY, () => this.refresh());
  }

  private positionFor(def: UnlockDef): Vec2 | null {
    const w = this.w;
    const map = w.map;
    switch (def.kind) {
      // The opening's covered carriage (session 22): its tile waits on the platform beside its door.
      case 'open':
        return { ...PLATFORM.openTile };
      // A locked room is shut and covered (session 22): its tile waits in the corridor at its door.
      case 'cabin': {
        const cabin = w.train.cabins.find((c) => c.carriage === def.carriage && c.index === def.cabin);
        if (!cabin) return null;
        const p = doorTileSpot(cabin.layout.door);
        return { x: p.x, z: p.z + carriageOriginZ(def.carriage) };
      }
      case 'bathroom': {
        const bath = w.train.bathrooms.find((b) => b.carriage === def.carriage && b.layout.index === def.bathroom);
        if (!bath) return null;
        const p = doorTileSpot(bath.layout.door);
        return { x: p.x, z: p.z + carriageOriginZ(def.carriage) };
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
      case 'seat': {
        const venue = w.venues.byCarriage(def.carriage);
        const group = venue?.layout.groups.find((g) => g.index === def.group);
        return venue && group ? venue.world(group.tile) : null;
      }
      case 'menu':
        return map.hasAnchor(def.carriage, 'tile_menu') ? map.anchor(def.carriage, 'tile_menu') : null;
      // The lobby rack's upgrades wait beside the rack (session 26).
      case 'rack':
        return map.hasAnchor(def.carriage, 'tile_rack') ? map.anchor(def.carriage, 'tile_rack') : null;
      case 'station': {
        // A venue with more than one station tile gives each its own spot (`tile_station_jukebox`, fix list 4.8).
        const own = `tile_${def.id.split('.')[1] ?? ''}`;
        if (map.hasAnchor(def.carriage, own)) return map.anchor(def.carriage, own);
        return map.hasAnchor(def.carriage, 'tile_station') ? map.anchor(def.carriage, 'tile_station') : null;
      }
    }
  }
}
