import * as THREE from 'three';
import { CLASS_BY_ID } from '../config/classes';
import { VENUES, VENUE_MENUS, VENUE_TUNING, type VenueCharge } from '../config/venues';
import type { CarriageType, ItemKind, StaffRole, Vec2, VenueKind } from '../core/types';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { carriageOriginZ, closedVenueProps, extraCentre, getLayout, ZONE_RADIUS, type CarriageLayout, type VenueLayout, type VenueSeatLayout } from '../world/layout';
import type { Actor } from './Actor';
import type { Guest } from './Guests';
import { sourceStay, type SourceSpec } from './Pickup';
import type { StaffMember } from './Staff';
import type { World } from './World';
import { Zone } from './Zones';

/**
 * The venue carriages at play (session 20; config/venues.ts has the design and every number). A guest resting in
 * their cabin now and then takes an outing to a venue with room: they queue at the café counter or the dome's
 * rope, or sit straight down in the dining car and the bar; they are served, pay in the venue, and go back to
 * bed. The player (or the venue's staff) makes what they order at the venue's station, carries it over and
 * hands it to them; the dining car's tables want clearing after each diner; every drink at the bar fills the
 * party meter (Happy Hour lifts tips and fares on the whole train); every scenic view pays the dome's seated
 * guests; the cinema's films pay every seat that watched (session 21). Never a penalty: a guest kept waiting simply
 * waits.
 */

export type SeatState = 'locked' | 'free' | 'reserved' | 'waiting' | 'consuming' | 'dirty';

/** A guest's outing, as their Guest record carries it. */
export interface Outing {
  venue: Venue;
  seat: VenueSeat;
  /** On the seat (the view sits them down). */
  seated: boolean;
  /** Paid already (the café is paid at the counter, the dome at the rope as a small ticket). */
  paid: boolean;
}

const tmp = new THREE.Vector3();

export class VenueSeat {
  state: SeatState = 'locked';
  guest: Guest | null = null;
  /** What the seated guest is waiting for (null while consuming, or before they order). */
  order: ItemKind | null = null;
  orderAt = 0;
  /** A staff member on their way with it. */
  servedBy: StaffMember | null = null;
  /** Dome: views watched this visit. Cinema: 1 while watching the film that is on (0 waiting for the next). */
  views = 0;
  timer = 0;
  readonly sit: Vec2;
  readonly serve: Vec2 | null;
  readonly node: string;

  constructor(readonly venue: Venue, readonly layout: VenueSeatLayout, originZ: number) {
    this.sit = { x: layout.sit.x, z: layout.sit.z + originZ };
    this.serve = layout.serve ? { x: layout.serve.x, z: layout.serve.z + originZ } : null;
    this.node = `c${venue.carriage}:${layout.node}`;
  }

  get group(): number {
    return this.layout.group;
  }
}

export class Venue {
  readonly seats: VenueSeat[] = [];
  /** Per group (table, stool, row): open yet, and (dining) plates left on it. */
  readonly open: boolean[] = [];
  readonly dirty: boolean[] = [];
  /** Who is clearing each dirty table (staff), so two never go. */
  readonly clearing: (StaffMember | null)[] = [];
  /** The café's counter queue, the dome's rope queue: guests in order, each with their seat reserved. */
  readonly queue: Guest[] = [];
  /** The queue's guests who have reached their place in it. */
  readonly arrived = new Set<Guest>();
  /** A staff member serving the queue's head (barista) or ushering (host). */
  queueServer: StaffMember | null = null;
  /** Dining: plates the chef has left on the pass. */
  pass = 0;
  /** Bar: drinks toward the next Happy Hour. */
  party = 0;
  /** Menu, station and refit state from the tiles bought. */
  readonly keys = new Set<string>();
  tier = 0;
  readonly pileId: string;
  /** Cinema: seconds left of the film on now (0: none on), and when the first guest sat down to wait for one. */
  filmLeft = 0;
  waitingSince = 0;

  /**
   * The floor plan in use: a refit swaps it for its own tier's (session 21: the furnishings change, the tables, seats
   * and pads stay where they were, so everything here carries on).
   */
  constructor(readonly w: World, readonly carriage: number, readonly kind: VenueKind, public layout: VenueLayout, public plan: CarriageLayout) {
    const originZ = carriageOriginZ(carriage);
    for (const s of layout.seats) this.seats.push(new VenueSeat(this, s, originZ));
    for (const g of layout.groups) {
      this.open[g.index] = g.index < layout.openGroups;
      this.dirty[g.index] = false;
      this.clearing[g.index] = null;
    }
    this.pileId = `venue:${carriage}`;
  }

  get originZ(): number {
    return carriageOriginZ(this.carriage);
  }

  world(p: Vec2): Vec2 {
    return { x: p.x, z: p.z + this.originZ };
  }

  /** What is on the menu now (the pastry case once bought). */
  products(): ItemKind[] {
    return VENUES[this.kind].products.filter((p) => !p.menu || this.keys.has(p.menu)).map((p) => p.item);
  }

  /** What one of these costs a guest: the menu, the refit, their purse and the train's boosts. */
  priceFor(item: VenueCharge | 'usher', guest: Guest | null): number {
    const w = this.w;
    const def = VENUES[this.kind];
    const t = VENUE_TUNING;
    let base: number;
    if (item === 'scenic') base = t.scenicTip;
    else if (item === 'usher') base = 2;
    else if (item === 'ticket') base = t.cinema.ticket;
    else if (item === 'blanket') base = t.blanketTip;
    else base = def.products.find((p) => p.item === item)?.price ?? 5;
    let menu = 1;
    for (const key of this.keys) {
      const m = VENUE_MENUS[key];
      if (m && item !== 'usher' && m.items.includes(item)) menu *= m.price;
    }
    const tier = def.tierPrice[Math.min(def.tierPrice.length - 1, this.tier)] ?? 1;
    const purse = guest ? (1 + (CLASS_BY_ID[guest.cls].tip - 1) * t.classSpend) * guest.archetype.tipMultiplier : 1;
    return Math.max(1, Math.round(base * menu * tier * purse * w.tipMultiplier()));
  }

  /** Seconds to make one (a second machine or range makes it quicker). */
  makeSeconds(item: ItemKind): number {
    const p = VENUES[this.kind].products.find((x) => x.item === item);
    const base = p?.makeSeconds ?? 0.6;
    const second = this.keys.has('station_machine') || this.keys.has('station_range') ? VENUE_TUNING.secondMachine : 1;
    return base * second;
  }

  /** A free seat in an open group (dining: a cleared table). */
  freeSeat(): VenueSeat | null {
    for (const seat of this.seats) if (seat.state === 'free' && this.open[seat.group] && !this.dirty[seat.group]) return seat;
    return null;
  }

  /** Where the i-th guest in the queue stands (beyond the painted places they wait in a line behind). */
  queueSpot(i: number): Vec2 {
    const q = this.layout.counter?.queue ?? [];
    const p = q[Math.min(i, q.length - 1)] ?? { x: 0, z: 4 };
    return this.world(p);
  }

  /** The station pad that makes an item, in world space. */
  stationFor(item: ItemKind): Vec2 | null {
    const s = this.layout.stations.find((x) => x.item === item);
    return s ? this.world(s.pad) : null;
  }

  /** Seats waiting for this item that no staff member has taken on. */
  waitingFor(item: ItemKind): VenueSeat[] {
    return this.seats.filter((s) => s.state !== 'locked' && s.order === item && s.guest && !s.servedBy);
  }

  /** Cinema: guests sitting down waiting for the next film (not watching the one on). */
  filmWaiting(): VenueSeat[] {
    return this.seats.filter((s) => s.guest?.outing?.seated && s.views === 0);
  }

  /** Cinema: whether the projectionist should start a film now (a fair house, or the first guest has waited long). */
  filmReady(): boolean {
    if (this.filmLeft > 0) return false;
    const waiting = this.filmWaiting().length;
    if (waiting === 0) return false;
    const open = this.seats.filter((s) => this.open[s.group]).length;
    const c = VENUE_TUNING.cinema;
    return waiting >= Math.max(1, Math.ceil(open * c.autoShare)) || this.w.time - this.waitingSince >= c.autoWait;
  }

  /** The queue's orders (café): every queued guest has chosen what they want. */
  queueOrders(item: ItemKind): number {
    let n = 0;
    for (const g of this.queue) if (g.outing?.seat.order === item) n++;
    return n;
  }

  staffCount(role: StaffRole): number {
    return this.w.staff.members.filter((m) => m.role === role && m.carriage === this.carriage && !m.temporary).length;
  }
}

export class Venues {
  readonly list: Venue[] = [];
  /** Seconds of Happy Hour left (the bar's party meter filled up). */
  happyLeft = 0;
  /** Seconds toward the next scenic view (the dome). */
  scenicTimer = 0;

  constructor(private readonly w: World) {}

  byCarriage(index: number): Venue | null {
    return this.list.find((v) => v.carriage === index) ?? null;
  }

  ofKind(kind: VenueKind): Venue | null {
    return this.list.find((v) => v.kind === kind) ?? null;
  }

  /** A carriage joined (or the train was rebuilt from the save): a venue gets its seats, pads and takings pile. */
  addCarriage(index: number, type: CarriageType, tier: number): void {
    const plan = getLayout(type, tier);
    const layout = plan.venue;
    if (!layout) return;
    const venue = new Venue(this.w, index, layout.kind, layout, plan);
    venue.tier = tier;
    this.list.push(venue);
    const u = this.w.unlocks;
    for (const d of u.defs) {
      if (d.carriage !== index || !u.isUnlocked(d.id)) continue;
      if (d.kind === 'seat' && d.group !== undefined) venue.open[d.group] = true;
      if (d.kind === 'menu' || d.kind === 'station') venue.keys.add(d.id.split('.')[1]);
    }
    for (const seat of venue.seats) seat.state = venue.open[seat.group] ? 'free' : 'locked';
    this.createZones(venue);
    this.syncView(index);
    this.w.map.refreshWalkable();
  }

  /** What is not there yet in a carriage (tables and extras still to buy): the map lets people walk there. */
  closedProps(index: number): ReadonlySet<number> | undefined {
    const venue = this.byCarriage(index);
    return venue ? closedVenueProps(venue.plan, venue.open, venue.keys) : undefined;
  }

  /** The carriage's view was rebuilt (a refit): show what is open, dirty and bought. */
  syncView(index: number): void {
    const venue = this.byCarriage(index);
    const view = this.w.train.views[index];
    if (!venue || !view) return;
    venue.tier = view.tier;
    if (view.layout !== venue.plan && view.layout.venue) {
      // The refit's own floor plan (its furnishings; TrainState rebuilds the map round it).
      venue.plan = view.layout;
      venue.layout = view.layout.venue;
    }
    venue.layout.groups.forEach((g) => {
      view.setVenueGroupOpen(g.index, venue.open[g.index]);
      view.setVenueDirty(g.index, venue.dirty[g.index]);
    });
    view.setVenueExtras([...venue.keys]);
  }

  /** A table, stool or row bought: it pops in. */
  openGroup(carriage: number, group: number, animate: boolean): void {
    const venue = this.byCarriage(carriage);
    if (!venue || venue.open[group]) return;
    venue.open[group] = true;
    for (const seat of venue.seats) if (seat.group === group && seat.state === 'locked') seat.state = 'free';
    const view = this.w.train.views[carriage];
    view?.setVenueGroupOpen(group, true);
    this.w.map.refreshWalkable();
    if (animate && view) {
      const g = venue.layout.groups[group];
      const p = venue.world(g.tile);
      this.w.particles.emit('sparkle', p.x, FLOOR_Y + 0.6, p.z, 14, 0.5);
      this.w.audio.play('pop');
    }
  }

  /** A menu or station tile bought (the pastry case fills, the piano arrives, a second machine). */
  applyKey(carriage: number, key: string, animate: boolean): void {
    const venue = this.byCarriage(carriage);
    if (!venue) return;
    venue.keys.add(key);
    this.w.train.views[carriage]?.setVenueExtras([...venue.keys]);
    this.w.map.refreshWalkable();
    if (animate) {
      const s = extraCentre(venue.plan, key) ?? venue.layout.sign ?? venue.layout.stations[0]?.pad ?? { x: 0, z: 6 };
      const p = venue.world(s);
      this.w.particles.emit('sparkle', p.x, FLOOR_Y + 1, p.z, 18, 0.6);
      this.w.audio.play('pop');
    }
  }

  /** Happy Hour's lift to tips and fares on the whole train (1 when it is not on). */
  boost(): number {
    return this.happyLeft > 0 ? VENUE_TUNING.party.boost : 1;
  }

  // ── Outings ────────────────────────────────────────────────────────────────────────────

  /** A resting guest might take an outing to a venue with room: true if they set off. */
  /** An outing to a venue that suits the time of night (`when`) and has a seat; false when none does. */
  /**
   * A venue the desk can book a table in for tonight (session 24): open in the evening with a free seat (the dome
   * only on the move), as its icon for the guest's bubble; null when there is none yet.
   */
  bookable(): IconName | null {
    for (const v of this.list) {
      if (!v.freeSeat() || !VENUES[v.kind].when.includes('evening')) continue;
      return this.venueIcon(v.kind);
    }
    return null;
  }

  tryOuting(guest: Guest, when: 'evening' | 'morning'): boolean {
    const w = this.w;
    if (!guest.cabin || guest.story || this.list.length === 0) return false;
    const weights: Record<string, number> = {};
    for (const v of this.list) {
      if (!v.freeSeat() || !VENUES[v.kind].when.includes(when)) continue;
      if ((v.kind === 'cafe' || v.kind === 'dome') && v.queue.length >= VENUE_TUNING.cafeQueueMax) continue;
      // The dome is for the ride: nobody goes up to watch a station platform.
      if (v.kind === 'dome' && w.journey.phase !== 'onTheMove') continue;
      weights[String(v.carriage)] = VENUES[v.kind].visitWeight;
    }
    const keys = Object.keys(weights);
    if (keys.length === 0) return false;
    const venue = this.byCarriage(Number(w.rng.weighted(weights)));
    if (!venue) return false;
    const seat = venue.freeSeat();
    if (!seat) return false;
    seat.state = 'reserved';
    seat.guest = guest;
    seat.order = null;
    seat.views = 0;
    guest.outing = { venue, seat, seated: false, paid: false };
    guest.request = null;
    w.guests.setOutingState(guest, 'toVenue');
    guest.view.showBubble(this.venueIcon(venue.kind), 'intent');
    if (venue.kind === 'cafe' || venue.kind === 'dome') {
      venue.queue.push(guest);
      // Café guests know what they want before they reach the counter (so a coffee can be brewed ahead).
      if (venue.kind === 'cafe') seat.order = w.rng.pick(venue.products());
      this.walkTo(guest, venue.queueSpot(venue.queue.length - 1), () => this.arriveInQueue(guest));
    } else {
      this.walkToSeat(guest);
    }
    return true;
  }

  venueIcon(kind: VenueKind): IconName {
    return kind === 'cafe' ? 'latte' : kind === 'dining' ? 'meal' : kind === 'bar' ? 'cocktail' : kind === 'cinema' ? 'film' : 'binoculars';
  }

  private walkTo(guest: Guest, spot: Vec2, onArrive: () => void, node?: string): void {
    const map = this.w.map;
    const from = map.nearestNode(guest.pos.x, guest.pos.z);
    const to = node ?? map.nearestNode(spot.x, spot.z);
    const path = from && to ? map.nav.findPath(from, to) : null;
    guest.mover.go([...(path ?? []), spot], onArrive);
  }

  private walkToSeat(guest: Guest): void {
    const outing = guest.outing;
    if (!outing) return;
    const nav = this.w.map.nav;
    const node = nav.has(outing.seat.node) ? outing.seat.node : undefined;
    const nodePos = node ? nav.position(node) : null;
    const approach = nodePos ?? outing.seat.sit;
    this.walkTo(guest, approach, () => this.sitDown(guest), node);
  }

  private arriveInQueue(guest: Guest): void {
    const outing = guest.outing;
    if (!outing) return;
    outing.venue.arrived.add(guest);
    this.w.guests.setOutingState(guest, 'venueQueue');
    guest.mover.facing = outing.venue.layout.counter?.facing ?? 0;
    this.showQueueBubble(guest);
  }

  private showQueueBubble(guest: Guest): void {
    const outing = guest.outing;
    if (!outing) return;
    const head = outing.venue.queue[0] === guest;
    if (outing.venue.kind === 'cafe' && outing.seat.order) guest.view.showBubble(head ? (outing.seat.order as IconName) : null, 'request', 1.85);
    else if (outing.venue.kind === 'dome') guest.view.showBubble(head ? 'binoculars' : null, 'request', 1.85);
  }

  /** The queue moved up one: everyone steps forward to their new place. */
  private reflowQueue(venue: Venue): void {
    venue.queue.forEach((g, i) => {
      venue.arrived.delete(g);
      this.walkTo(g, venue.queueSpot(i), () => this.arriveInQueue(g));
    });
  }

  private sitDown(guest: Guest): void {
    const w = this.w;
    const outing = guest.outing;
    if (!outing) return;
    const { venue, seat } = outing;
    guest.pos.x = seat.sit.x;
    guest.pos.z = seat.sit.z;
    outing.seated = true;
    w.guests.setOutingState(guest, venue.kind === 'cafe' || venue.kind === 'dome' ? 'consuming' : 'seated');
    seat.timer = 0;
    if (venue.kind === 'dining' || venue.kind === 'bar') {
      seat.order = w.rng.pick(venue.products());
      seat.orderAt = w.time;
      seat.state = 'waiting';
      guest.view.showBubble(seat.order as IconName, 'request', 1.85);
      guest.view.act('wave', w.econ.guests.waveSeconds);
      w.audio.play('soft', { volume: 0.45 });
    } else if (venue.kind === 'cinema') {
      // Settles in for the next film (the one on, if any, is half over: they wait for the next).
      seat.state = 'consuming';
      seat.views = 0;
      if (venue.filmWaiting().length === 1) venue.waitingSince = w.time;
      guest.view.showBubble('film', 'intent', 1.85);
    } else {
      seat.state = 'consuming';
      guest.view.showBubble(null);
      if (venue.kind === 'cafe') guest.view.act('sip', VENUES.cafe.consumeSeconds);
    }
  }

  /** Every frame for a guest on an outing. */
  thinkGuest(guest: Guest, dt: number): void {
    const outing = guest.outing;
    if (!outing) return;
    const { venue, seat } = outing;
    if (guest.state === 'venueQueue') {
      this.showQueueBubble(guest);
      return;
    }
    if (guest.state === 'seated') {
      // Waiting to be served: the bubble stays up.
      if (seat.order) guest.view.showBubble(seat.order as IconName, 'request', 1.85);
      return;
    }
    if (guest.state === 'consuming') {
      seat.timer += dt;
      if (venue.kind === 'dome') {
        // Watching: views come round on their own (update); a blanket asked for shows its bubble.
        guest.view.showBubble(seat.order ? (seat.order as IconName) : null, 'request', 1.85);
        return;
      }
      if (venue.kind === 'cinema') {
        // Waiting for the film (a little reel), watching it, or wanting popcorn.
        if (seat.order) guest.view.showBubble(seat.order as IconName, 'request', 1.85);
        else guest.view.showBubble(seat.views === 0 ? 'film' : null, 'intent', 1.85);
        return;
      }
      if (seat.timer >= VENUES[venue.kind].consumeSeconds) this.finish(guest);
    }
  }

  /** Done: pay (if not yet), leave the table as it is (dining: plates to clear), go back to the cabin. */
  private finish(guest: Guest): void {
    const w = this.w;
    const outing = guest.outing;
    if (!outing) return;
    const { venue, seat } = outing;
    if (!outing.paid && venue.kind !== 'dome') {
      const item = VENUES[venue.kind].products[0]?.item ?? 'latte';
      const amount = venue.priceFor(item, guest);
      const pile = venue.kind === 'dining' ? this.groupPile(venue, seat.group) : venue.pileId;
      w.cash.add(pile, amount, tmp.set(guest.pos.x, FLOOR_Y + 1.0, guest.pos.z));
      outing.paid = true;
      if (venue.kind === 'bar') this.addParty(venue);
    }
    guest.view.showBubble('heart', 'plain', 1.7);
    w.particles.emit('heart', guest.pos.x, FLOOR_Y + 1.4, guest.pos.z, 4, 0.2);
    this.leave(guest);
  }

  /** The guest gets up and goes back to bed; their seat frees (a dining table waits to be cleared). */
  private leave(guest: Guest): void {
    const outing = guest.outing;
    if (!outing) return;
    const { venue, seat } = outing;
    this.releaseSeat(venue, seat);
    guest.outing = null;
    // Off the chair and onto the floor beside it.
    const nav = this.w.map.nav;
    const node = nav.has(seat.node) ? nav.position(seat.node) : null;
    if (node) {
      guest.pos.x = node.x;
      guest.pos.z = node.z;
    }
    this.w.guests.returnFromOuting(guest);
  }

  private releaseSeat(venue: Venue, seat: VenueSeat): void {
    seat.guest = null;
    seat.order = null;
    seat.servedBy = null;
    seat.views = 0;
    if (venue.kind === 'dining') {
      venue.dirty[seat.group] = true;
      seat.state = 'dirty';
      this.w.train.views[venue.carriage]?.setVenueDirty(seat.group, true);
    } else {
      seat.state = venue.open[seat.group] ? 'free' : 'locked';
    }
  }

  /** A guest is gone (destroyed): nothing of theirs is left reserved. */
  releaseGuest(guest: Guest): void {
    const outing = guest.outing;
    if (!outing) return;
    const { venue, seat } = outing;
    const qi = venue.queue.indexOf(guest);
    if (qi >= 0) {
      venue.queue.splice(qi, 1);
      venue.arrived.delete(guest);
      this.reflowQueue(venue);
    }
    if (seat.guest === guest) {
      seat.guest = null;
      seat.order = null;
      seat.servedBy = null;
      if (seat.state !== 'dirty') seat.state = venue.open[seat.group] ? 'free' : 'locked';
    }
    guest.outing = null;
  }

  // ── Serving ────────────────────────────────────────────────────────────────────────────

  /** The café: the head of the queue takes their order across the counter and pays; off to a table. */
  private serveCounter(venue: Venue, actor: Actor): boolean {
    const w = this.w;
    const guest = venue.queue[0];
    const outing = guest?.outing;
    if (!guest || !outing || !venue.arrived.has(guest)) return false;
    if (venue.kind === 'cafe') {
      const item = outing.seat.order;
      if (!item || !actor.stack.has(item)) return false;
      actor.stack.remove(item, () => tmp.set(guest.pos.x, FLOOR_Y + 1.1, guest.pos.z));
      const amount = venue.priceFor(item, guest);
      w.cash.add(venue.pileId, amount, tmp.set(guest.pos.x, FLOOR_Y + 1.1, guest.pos.z));
      outing.paid = true;
      this.served(venue, guest, item, amount, actor);
    } else {
      // The dome's rope: shown in (a small ticket).
      const amount = venue.priceFor('usher', guest);
      w.cash.add(venue.pileId, amount, tmp.set(guest.pos.x, FLOOR_Y + 1.1, guest.pos.z));
      this.served(venue, guest, 'usher', amount, actor);
    }
    venue.queue.shift();
    venue.arrived.delete(guest);
    if (venue.queueServer && !venue.queueServer.task) venue.queueServer = null;
    guest.view.showBubble(null);
    this.reflowQueue(venue);
    this.walkToSeat(guest);
    w.guests.setOutingState(guest, 'toVenue');
    return true;
  }

  /** At a table, stool or dome row: hand over what someone there is waiting for, or clear the plates. */
  private serveAt(venue: Venue, pad: Vec2, actor: Actor, zone: Zone, dt: number): boolean {
    const w = this.w;
    const seats = venue.seats.filter((s) => s.serve && Math.abs(s.serve.x - pad.x) < 0.05 && Math.abs(s.serve.z - pad.z) < 0.05);
    for (const seat of seats) {
      if (!seat.guest || !seat.order || !actor.stack.has(seat.order)) continue;
      const guest = seat.guest;
      const item = seat.order;
      actor.stack.remove(item, () => tmp.set(seat.sit.x, FLOOR_Y + 0.9, seat.sit.z));
      seat.order = null;
      seat.servedBy = null;
      if (item === 'popcorn') {
        // The cinema: popcorn for the film (paid now; they stay for the rest of it).
        const amount = venue.priceFor('popcorn', guest);
        w.cash.add(venue.pileId, amount, tmp.set(seat.sit.x, FLOOR_Y + 1.1, seat.sit.z));
        this.served(venue, guest, item, amount, actor);
        guest.view.act('sip', 4);
      } else if (item === 'blanket') {
        // The dome: a blanket for the view (a tip now; they stay for the rest of it).
        const amount = venue.priceFor('blanket', guest);
        w.cash.add(venue.pileId, amount, tmp.set(seat.sit.x, FLOOR_Y + 1.1, seat.sit.z));
        this.served(venue, guest, item, amount, actor);
        guest.view.act('hug', w.econ.guests.enjoySeconds);
      } else {
        seat.state = 'consuming';
        seat.timer = 0;
        w.guests.setOutingState(guest, 'consuming');
        this.served(venue, guest, item, 0, actor);
        guest.view.act(item === 'meal' ? 'sip' : 'sip', VENUES[venue.kind].consumeSeconds);
      }
      return true;
    }
    // Dining: plates left on the table.
    const group = seats[0]?.group;
    if (venue.kind === 'dining' && group !== undefined && venue.dirty[group]) {
      zone.timer += dt * actor.workMultiplier;
      zone.progress = Math.min(1, zone.timer / VENUE_TUNING.clearSeconds);
      if (actor.isPlayer || actor.view) actor.view.act('sweep', 0.3);
      if (zone.timer < VENUE_TUNING.clearSeconds) return true;
      zone.timer = 0;
      zone.progress = 0;
      venue.dirty[group] = false;
      venue.clearing[group] = null;
      for (const s of venue.seats) if (s.group === group && s.state === 'dirty') s.state = 'free';
      w.train.views[venue.carriage]?.setVenueDirty(group, false);
      w.particles.emit('sparkle', pad.x, FLOOR_Y + 0.8, pad.z, 8, 0.3);
      w.audio.play('pop', { volume: 0.6 });
      w.addStars(VENUE_TUNING.stars, 'venue', pad);
      w.events.emit('venue.cleared', { kind: venue.kind, byPlayer: actor.isPlayer });
      return true;
    }
    return false;
  }

  private served(venue: Venue, guest: Guest, item: ItemKind | 'usher' | 'film', amount: number, actor: Actor): void {
    const w = this.w;
    guest.view.bounce(0.8);
    w.particles.emit('heart', guest.pos.x, FLOOR_Y + 1.5, guest.pos.z, 4, 0.2);
    w.audio.play('heart', { volume: 0.7 });
    // A flat star per service (class stars are for the rooms: a royal latte is still one latte).
    w.addStars(VENUE_TUNING.stars, 'venue', guest.pos);
    w.events.emit('venue.served', { kind: venue.kind, item, amount, x: guest.pos.x, z: guest.pos.z, byPlayer: actor.isPlayer });
  }

  /** A drink paid for at the bar: the party meter fills, and at the top it is Happy Hour. */
  private addParty(venue: Venue): void {
    const w = this.w;
    const t = VENUE_TUNING.party;
    venue.party += venue.keys.has('station_piano') ? t.piano : 1;
    if (venue.party < t.goal) return;
    venue.party = 0;
    this.happyLeft = t.seconds;
    const sign = venue.layout.sign ? venue.world(venue.layout.sign) : { x: 0, z: venue.originZ + 6 };
    w.particles.emit('confetti', sign.x, FLOOR_Y + 1.6, sign.z, 40, 0.8);
    w.audio.play('fanfare');
    w.ui.floatIcon('party', sign.x, FLOOR_Y + 2.2, sign.z, 'star');
    w.events.emit('venue.happyHour', { seconds: t.seconds });
  }

  /** The views from the dome, while the train is moving: every seated guest's "wow" pays. */
  private scenic(venue: Venue): void {
    const w = this.w;
    let total = 0;
    let guests = 0;
    for (const seat of venue.seats) {
      const guest = seat.guest;
      if (!guest || seat.state !== 'consuming' || !guest.outing?.seated) continue;
      const amount = venue.priceFor('scenic', guest);
      w.cash.add(venue.pileId, amount, tmp.set(seat.sit.x, FLOOR_Y + 1.2, seat.sit.z));
      w.ui.floatIcon('binoculars', seat.sit.x, FLOOR_Y + 1.9, seat.sit.z, 'star');
      w.particles.emit('sparkle', seat.sit.x, FLOOR_Y + 1.4, seat.sit.z, 6, 0.3);
      total += amount;
      guests++;
      seat.views++;
      if (seat.views >= VENUE_TUNING.viewsPerVisit && !seat.order) this.finishDome(guest);
      else if (!seat.order && w.rng.chance(VENUE_TUNING.blanketChance)) {
        seat.order = 'blanket';
        seat.orderAt = w.time;
      }
    }
    if (guests > 0) {
      w.audio.play('sparkle', { pitch: 1.15 });
      w.addStars(VENUE_TUNING.stars * guests, 'venue', venue.world(venue.layout.sign ?? { x: 0, z: 9 }));
      w.events.emit('venue.scenic', { guests, amount: total });
    }
  }

  private finishDome(guest: Guest): void {
    guest.view.showBubble('heart', 'plain', 1.7);
    this.leave(guest);
  }

  /**
   * The cinema: the film starts for everyone seated (those who come in during it wait for the next). Some of them
   * would like popcorn. False if nobody is there to watch.
   */
  private startFilm(venue: Venue, actor: Actor): boolean {
    const w = this.w;
    const audience = venue.filmWaiting();
    if (audience.length === 0 || venue.filmLeft > 0) return false;
    const c = VENUE_TUNING.cinema;
    venue.filmLeft = c.filmSeconds;
    for (const seat of audience) {
      seat.views = 1;
      if (!seat.order && w.rng.chance(c.popcornChance)) {
        seat.order = 'popcorn';
        seat.orderAt = w.time;
      }
    }
    const p = venue.layout.projector ? venue.world(venue.layout.projector) : { x: 0, z: venue.originZ + 9 };
    w.particles.emit('sparkle', p.x, FLOOR_Y + 1.2, p.z, 10, 0.4);
    w.audio.play('sparkle', { pitch: 0.85 });
    w.events.emit('venue.served', { kind: 'cinema', item: 'film', amount: 0, x: p.x, z: p.z, byPlayer: actor.isPlayer });
    return true;
  }

  /** The film ends: every seat that watched it pays its ticket and goes back to bed happy. */
  private endFilm(venue: Venue): void {
    const w = this.w;
    venue.filmLeft = 0;
    let total = 0;
    let guests = 0;
    for (const seat of venue.seats) {
      const guest = seat.guest;
      const outing = guest?.outing;
      if (!guest || !outing?.seated || seat.views !== 1) continue;
      const amount = venue.priceFor('ticket', guest);
      w.cash.add(venue.pileId, amount, tmp.set(seat.sit.x, FLOOR_Y + 1.2, seat.sit.z));
      w.ui.floatIcon('film', seat.sit.x, FLOOR_Y + 1.9, seat.sit.z, 'star');
      outing.paid = true;
      total += amount;
      guests++;
      this.finish(guest);
    }
    if (venue.filmWaiting().length > 0) venue.waitingSince = w.time;
    if (guests > 0) {
      w.audio.play('heart', { volume: 0.8 });
      w.addStars(VENUE_TUNING.stars * guests, 'venue', venue.world(venue.layout.projector ?? { x: 0, z: 9 }));
      w.events.emit('venue.film', { guests, amount: total });
    }
  }

  update(dt: number): void {
    const w = this.w;
    if (this.happyLeft > 0) this.happyLeft = Math.max(0, this.happyLeft - dt);
    const dome = this.ofKind('dome');
    if (dome && w.journey.phase === 'onTheMove') {
      this.scenicTimer += dt;
      if (this.scenicTimer >= VENUE_TUNING.scenicEverySeconds) {
        this.scenicTimer = 0;
        this.scenic(dome);
      }
    }
    for (const v of this.list) {
      // The bar's party meter and the dome's next view, on their signs.
      const view = w.train.views[v.carriage];
      if (v.kind === 'cinema') {
        if (v.filmLeft > 0) {
          v.filmLeft = Math.max(0, v.filmLeft - dt);
          if (v.filmLeft === 0) this.endFilm(v);
        }
        view?.setVenueFilm(v.filmLeft > 0 ? 1 - v.filmLeft / VENUE_TUNING.cinema.filmSeconds : -1);
      }
      if (!view) continue;
      if (v.kind === 'bar') view.setVenueSign('party', this.happyLeft > 0 ? 1 : v.party / VENUE_TUNING.party.goal, this.happyLeft > 0);
      if (v.kind === 'dome') view.setVenueSign('binoculars', this.scenicTimer / VENUE_TUNING.scenicEverySeconds, false);
    }
  }

  // ── Demand, guidance, staff ────────────────────────────────────────────────────────────

  /** How many of an item the train's venues are waiting for (not already on their way with staff). */
  need(kind: ItemKind): number {
    let n = 0;
    for (const v of this.list) {
      if (v.kind === 'cafe' && (kind === 'latte' || kind === 'pastry')) {
        n += v.queueOrders(kind);
        if (v.queueServer && v.queue[0]?.outing?.seat.order === kind) n--;
      } else n += v.waitingFor(kind).length;
    }
    return Math.max(0, n);
  }

  /** Where to take what the player holds: the café counter or the seat waiting for it. */
  deliverPoint(items: readonly ItemKind[], from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const v of this.list) {
      if (v.kind === 'cafe') {
        const head = v.queue[0];
        const order = head?.outing?.seat.order;
        if (order && items.includes(order) && v.layout.counter) return v.world(v.layout.counter.pad);
        continue;
      }
      for (const seat of v.seats) {
        if (!seat.order || !seat.serve || !items.includes(seat.order) || !seat.guest) continue;
        const d = Math.abs(seat.serve.z - from.z);
        if (d < bestD) {
          bestD = d;
          best = seat.serve;
        }
      }
    }
    return best;
  }

  /** The next venue job for the player (none where a staff member has it in hand). */
  playerJob(from: Vec2): { reason: 'fetch' | 'clean' | 'desk'; target: Vec2 } | null {
    const w = this.w;
    let best: { reason: 'fetch' | 'clean' | 'desk'; target: Vec2 } | null = null;
    let bestD = Infinity;
    const offer = (reason: 'fetch' | 'clean' | 'desk', target: Vec2 | null): void => {
      if (!target) return;
      const d = Math.abs(target.z - from.z) + Math.abs(target.x - from.x) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = { reason, target };
      }
    };
    for (const v of this.list) {
      if (v.kind === 'cafe' && v.staffCount('barista') === 0) {
        const order = v.queue[0]?.outing?.seat.order;
        if (order && w.demand.playerWants(order) > 0) offer('fetch', v.stationFor(order));
      }
      if (v.kind === 'dining') {
        if (v.waitingFor('meal').length > 0 && v.staffCount('waiter') === 0 && w.demand.playerWants('meal') > 0) offer('fetch', v.pass > 0 && v.layout.pass ? v.world(v.layout.pass) : v.stationFor('meal'));
        if (v.staffCount('waiter') === 0) {
          const dirty = v.seats.find((s) => s.state === 'dirty' && s.serve && !v.clearing[s.group]);
          if (dirty?.serve) offer('clean', dirty.serve);
        }
      }
      if (v.kind === 'bar' && v.staffCount('bartender') === 0 && v.waitingFor('cocktail').length > 0 && w.demand.playerWants('cocktail') > 0) offer('fetch', v.stationFor('cocktail'));
      if (v.kind === 'dome' && v.staffCount('host') === 0) {
        if (v.queue[0] && v.arrived.has(v.queue[0]) && v.layout.counter) offer('desk', v.world(v.layout.counter.pad));
        if (v.waitingFor('blanket').length > 0 && w.demand.playerWants('blanket') > 0) offer('fetch', v.stationFor('blanket'));
      }
      if (v.kind === 'cinema' && v.staffCount('projectionist') === 0) {
        if (v.filmReady() && v.layout.projector) offer('desk', v.world(v.layout.projector));
        if (v.waitingFor('popcorn').length > 0 && w.demand.playerWants('popcorn') > 0) offer('fetch', v.stationFor('popcorn'));
      }
    }
    return best;
  }

  /** A staff member of a venue looks for their next job (null: nothing to do). */
  taskFor(m: StaffMember): VenueTask | null {
    const venue = this.byCarriage(m.carriage);
    if (!venue) return null;
    switch (m.role) {
      case 'barista': return this.baristaTask(venue, m);
      case 'chef': return this.chefTask(venue);
      case 'waiter': return this.waiterTask(venue, m);
      case 'bartender': return this.serveTask(venue, m, 'cocktail');
      case 'host': return this.hostTask(venue, m);
      case 'projectionist': return this.projectionistTask(venue, m);
      default: return null;
    }
  }

  private baristaTask(venue: Venue, m: StaffMember): VenueTask | null {
    const head = venue.queue[0];
    const order = head?.outing?.seat.order;
    if (!head || !order || venue.queueServer) return null;
    const station = venue.stationFor(order);
    const counter = venue.layout.counter ? venue.world(venue.layout.counter.pad) : null;
    if (!station || !counter) return null;
    venue.queueServer = m;
    const steps: VenueStep[] = [];
    if (!m.stack.has(order)) {
      steps.push({ kind: 'do', fn: () => (m.wantItems = { [order]: 1 }) });
      steps.push({ kind: 'goto', target: station });
      steps.push({ kind: 'stand', until: () => m.stack.has(order) || venue.queue[0] !== head, timeout: venue.makeSeconds(order) / Math.max(0.3, m.workMultiplier) + 3 });
    }
    steps.push({ kind: 'goto', target: counter });
    steps.push({ kind: 'stand', until: () => venue.queue[0] !== head || !m.stack.has(order), timeout: 8 });
    return { label: 'brew', icon: order as IconName, steps, release: () => { if (venue.queueServer === m) venue.queueServer = null; m.wantItems = {}; } };
  }

  private chefTask(venue: Venue): VenueTask | null {
    const stove = venue.stationFor('meal');
    if (!stove || this.chefPending(venue) <= 0 || venue.pass >= VENUE_TUNING.passMax) return null;
    return {
      label: 'cook', icon: 'meal',
      steps: [
        { kind: 'goto', target: stove },
        { kind: 'stand', until: () => this.chefPending(venue) <= 0 || venue.pass >= VENUE_TUNING.passMax, timeout: 20 },
      ],
      release: () => undefined,
    };
  }

  /** Plates still to cook: diners waiting, less what is on the pass and in someone's hands. */
  chefPending(venue: Venue): number {
    let held = this.w.player.stack.countOf('meal');
    for (const s of this.w.staff.members) held += s.stack.countOf('meal');
    const waiting = venue.seats.filter((s) => s.order === 'meal' && s.guest).length;
    return waiting - venue.pass - held;
  }

  private waiterTask(venue: Venue, m: StaffMember): VenueTask | null {
    const seat = venue.waitingFor('meal')[0];
    const chef = venue.staffCount('chef') > 0;
    if (seat && seat.serve && (venue.pass > 0 || m.stack.has('meal') || !chef)) {
      seat.servedBy = m;
      const steps: VenueStep[] = [];
      if (!m.stack.has('meal')) {
        steps.push({ kind: 'do', fn: () => (m.wantItems = { meal: 1 }) });
        // Plates from the pass (the chef's), or cooked at the range when there is no chef.
        const from = venue.pass > 0 || chef ? (venue.layout.pass ? venue.world(venue.layout.pass) : null) : venue.stationFor('meal');
        if (!from) return null;
        steps.push({ kind: 'goto', target: from });
        steps.push({ kind: 'stand', until: () => m.stack.has('meal') || !seat.guest, timeout: chef ? 6 : venue.makeSeconds('meal') / Math.max(0.3, m.workMultiplier) + 3 });
      }
      steps.push({ kind: 'goto', target: seat.serve });
      steps.push({ kind: 'stand', until: () => seat.order !== 'meal' || !m.stack.has('meal'), timeout: 4 });
      return { label: 'serve', icon: 'meal', steps, release: () => { if (seat.servedBy === m) seat.servedBy = null; m.wantItems = {}; } };
    }
    const dirty = venue.seats.find((s) => s.state === 'dirty' && s.serve && !venue.clearing[s.group]);
    if (dirty?.serve) {
      const group = dirty.group;
      venue.clearing[group] = m;
      return {
        label: 'clear', icon: 'broom',
        steps: [
          { kind: 'goto', target: dirty.serve },
          { kind: 'stand', until: () => !venue.dirty[group], timeout: 4 },
        ],
        release: () => { if (venue.clearing[group] === m) venue.clearing[group] = null; },
      };
    }
    return null;
  }

  /** Make it at the venue's station and take it to the seat waiting for it (the bartender, the host's blankets). */
  private serveTask(venue: Venue, m: StaffMember, item: ItemKind): VenueTask | null {
    const seat = venue.waitingFor(item)[0];
    const station = venue.stationFor(item);
    if (!seat || !seat.serve || !station) return null;
    seat.servedBy = m;
    const steps: VenueStep[] = [];
    if (!m.stack.has(item)) {
      steps.push({ kind: 'do', fn: () => (m.wantItems = { [item]: 1 }) });
      steps.push({ kind: 'goto', target: station });
      steps.push({ kind: 'stand', until: () => m.stack.has(item) || !seat.guest, timeout: venue.makeSeconds(item) / Math.max(0.3, m.workMultiplier) + 3 });
    }
    steps.push({ kind: 'goto', target: seat.serve });
    steps.push({ kind: 'stand', until: () => seat.order !== item || !m.stack.has(item), timeout: 4 });
    return { label: 'serve', icon: item as IconName, steps, release: () => { if (seat.servedBy === m) seat.servedBy = null; m.wantItems = {}; } };
  }

  private hostTask(venue: Venue, m: StaffMember): VenueTask | null {
    const head = venue.queue[0];
    const rope = venue.layout.counter ? venue.world(venue.layout.counter.pad) : null;
    if (head && rope && !venue.queueServer) {
      venue.queueServer = m;
      return {
        label: 'usher', icon: 'binoculars',
        steps: [
          { kind: 'goto', target: rope },
          { kind: 'stand', until: () => venue.queue.length === 0, timeout: 12 },
        ],
        release: () => { if (venue.queueServer === m) venue.queueServer = null; },
      };
    }
    return this.serveTask(venue, m, 'blanket');
  }

  /** The cinema's projectionist: starts a film when the house is fair (or someone has waited a while), else popcorn. */
  private projectionistTask(venue: Venue, m: StaffMember): VenueTask | null {
    const booth = venue.layout.projector ? venue.world(venue.layout.projector) : null;
    if (booth && venue.filmReady() && !venue.queueServer) {
      venue.queueServer = m;
      return {
        label: 'film', icon: 'film',
        steps: [
          { kind: 'goto', target: booth },
          { kind: 'stand', until: () => venue.filmLeft > 0 || venue.filmWaiting().length === 0, timeout: 6 },
        ],
        release: () => { if (venue.queueServer === m) venue.queueServer = null; },
      };
    }
    return this.serveTask(venue, m, 'popcorn');
  }

  /** Where a lesson about this venue points (the coach): the station, the counter, the table, the rope. */
  lessonTarget(id: string): Vec2 | null {
    switch (id) {
      case 'venue_cafe': {
        const v = this.ofKind('cafe');
        const order = v?.queue[0]?.outing?.seat.order;
        if (!v || !order) return null;
        return this.w.player.stack.has(order) && v.layout.counter ? v.world(v.layout.counter.pad) : v.stationFor(order);
      }
      case 'venue_dining': {
        const v = this.ofKind('dining');
        const seat = v?.waitingFor('meal')[0];
        if (!v || !seat) return null;
        return this.w.player.stack.has('meal') ? seat.serve : v.pass > 0 && v.layout.pass ? v.world(v.layout.pass) : v.stationFor('meal');
      }
      case 'venue_clear': {
        const v = this.ofKind('dining');
        return v?.seats.find((s) => s.state === 'dirty')?.serve ?? null;
      }
      case 'venue_bar': {
        const v = this.ofKind('bar');
        const seat = v?.waitingFor('cocktail')[0];
        if (!v || !seat) return null;
        return this.w.player.stack.has('cocktail') ? seat.serve : v.stationFor('cocktail');
      }
      case 'venue_dome': {
        const v = this.ofKind('dome');
        return v && v.queue[0] && v.arrived.has(v.queue[0]) && v.layout.counter ? v.world(v.layout.counter.pad) : null;
      }
      case 'venue_cinema': {
        const v = this.ofKind('cinema');
        return v && v.filmLeft === 0 && v.filmWaiting().length > 0 && v.layout.projector ? v.world(v.layout.projector) : null;
      }
      default:
        return null;
    }
  }

  // ── Zones ──────────────────────────────────────────────────────────────────────────────

  private groupPile(venue: Venue, group: number): string {
    return `${venue.pileId}:t${group}`;
  }

  private createZones(venue: Venue): void {
    const w = this.w;
    const layout = venue.layout;
    if (layout.cash) {
      const c = venue.world(layout.cash);
      w.cash.create(venue.pileId, c.x, c.z);
    }
    for (const g of layout.groups) {
      if (!g.cash) continue;
      const c = venue.world(g.cash);
      w.cash.create(this.groupPile(venue, g.index), c.x, c.z);
    }
    // Stations: stand there and it makes one of whatever someone is waiting for (the chef cooks for the pass).
    for (const station of layout.stations) {
      const p = venue.world(station.pad);
      const item = station.item;
      if (item === 'blanket') {
        // The dome's basket: blankets for anyone who wants one (a plain source, no making).
        const spec: SourceSpec = { kind: 'blanket', point: () => tmp.set(p.x + 0.6, FLOOR_Y + 0.7, p.z + 0.4), stock: () => Infinity, take: () => undefined, giveBack: () => undefined, interval: w.econ.zones.pickupIntervalSeconds };
        w.zones.add(new Zone({
          id: `venue:${venue.carriage}:basket`, x: p.x, z: p.z, radius: ZONE_RADIUS.source, icon: 'blanket', kind: 'pickup',
          active: () => w.demand.playerWants('blanket') > 0 || w.staff.members.some((m) => w.demand.wants(m, 'blanket')) || w.demand.surplus(w.player, 'blanket') > 0,
          highlight: () => venue.waitingFor('blanket').length > 0 && w.demand.playerWants('blanket') > 0,
          stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, spec),
        }));
        continue;
      }
      w.zones.add(new Zone({
        id: `venue:${venue.carriage}:${item}`, x: p.x, z: p.z, radius: ZONE_RADIUS.source, icon: item as IconName, kind: 'pickup',
        active: () => (item !== 'pastry' || venue.keys.has('menu_pastry')) && (w.demand.playerWants(item) > 0 || w.staff.members.some((m) => m.carriage === venue.carriage && (w.demand.wants(m, item) || (m.role === 'chef' && item === 'meal')))),
        highlight: () => w.demand.playerWants(item) > 0,
        stay: (zone, actor, dt) => this.makeStay(venue, item, zone, actor, dt, p),
      }));
    }
    if (layout.pass) {
      const p = venue.world(layout.pass);
      const spec: SourceSpec = {
        kind: 'meal',
        point: () => tmp.set(p.x, FLOOR_Y + 1.0, p.z - 0.6),
        stock: () => venue.pass,
        take: () => { venue.pass = Math.max(0, venue.pass - 1); this.w.train.views[venue.carriage]?.setVenuePass(venue.pass); },
        interval: w.econ.zones.pickupIntervalSeconds,
      };
      w.zones.add(new Zone({
        id: `venue:${venue.carriage}:pass`, x: p.x, z: p.z, radius: ZONE_RADIUS.source, icon: 'meal', kind: 'pickup',
        active: () => venue.pass > 0,
        highlight: () => venue.pass > 0 && w.demand.playerWants('meal') > 0,
        stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, spec),
      }));
    }
    if (layout.counter) {
      const p = venue.world(layout.counter.pad);
      const cafe = venue.kind === 'cafe';
      w.zones.add(new Zone({
        id: `venue:${venue.carriage}:counter`, x: p.x, z: p.z, radius: ZONE_RADIUS.serve, icon: cafe ? 'cash' : 'binoculars',
        kind: cafe ? 'drop' : 'work',
        active: () => !!venue.queue[0] && venue.arrived.has(venue.queue[0]),
        stay: (zone, actor, dt) => {
          const head = venue.queue[0];
          if (!head || !venue.arrived.has(head)) return false;
          if (cafe) {
            const order = head.outing?.seat.order;
            if (!order || !actor.stack.has(order)) return false;
            zone.timer += dt;
            if (zone.timer < 0.2) return true;
            zone.timer = 0;
            return this.serveCounter(venue, actor);
          }
          zone.timer += dt * actor.workMultiplier;
          zone.progress = Math.min(1, zone.timer / VENUE_TUNING.usherSeconds);
          if (zone.timer < VENUE_TUNING.usherSeconds) return true;
          zone.timer = 0;
          zone.progress = 0;
          return this.serveCounter(venue, actor);
        },
      }));
    }
    // The cinema's projector: stand there and the film starts for everyone seated.
    if (layout.projector) {
      const p = venue.world(layout.projector);
      w.zones.add(new Zone({
        id: `venue:${venue.carriage}:projector`, x: p.x, z: p.z, radius: ZONE_RADIUS.source, icon: 'film', kind: 'work',
        active: () => venue.filmLeft === 0 && venue.filmWaiting().length > 0,
        highlight: () => venue.filmReady(),
        stay: (zone, actor, dt) => {
          if (venue.filmLeft > 0 || venue.filmWaiting().length === 0) {
            zone.timer = 0;
            zone.progress = 0;
            return false;
          }
          zone.timer += dt * actor.workMultiplier;
          zone.progress = Math.min(1, zone.timer / VENUE_TUNING.cinema.startSeconds);
          if (zone.timer < VENUE_TUNING.cinema.startSeconds) return true;
          zone.timer = 0;
          zone.progress = 0;
          return this.startFilm(venue, actor);
        },
      }));
    }
    // Serve pads: one per table side, stool or dome row.
    const pads = new Map<string, { p: Vec2; group: number }>();
    for (const seat of venue.seats) if (seat.serve) pads.set(`${seat.serve.x.toFixed(2)},${seat.serve.z.toFixed(2)}`, { p: seat.serve, group: seat.group });
    for (const [key, { p, group }] of pads) {
      const at = venue.seats.filter((s) => s.serve && Math.abs(s.serve.x - p.x) < 0.05 && Math.abs(s.serve.z - p.z) < 0.05);
      w.zones.add(new Zone({
        id: `venue:${venue.carriage}:serve:${key}`, x: p.x, z: p.z, radius: ZONE_RADIUS.serve,
        icon: venue.kind === 'dining' ? 'meal' : venue.kind === 'bar' ? 'cocktail' : venue.kind === 'cinema' ? 'popcorn' : 'blanket',
        kind: 'drop',
        hideWhenInactive: true,
        active: () => venue.open[group] && (at.some((s) => !!s.order && !!s.guest) || (venue.kind === 'dining' && venue.dirty[group])),
        highlight: () => at.some((s) => !!s.order && w.player.stack.has(s.order)),
        stay: (zone, actor, dt) => this.serveAt(venue, p, actor, zone, dt),
      }));
    }
  }

  /** Standing at a station: the ring fills while it is made, then it is yours (the chef's goes on the pass). */
  private makeStay(venue: Venue, item: ItemKind, zone: Zone, actor: Actor, dt: number, p: Vec2): boolean {
    const w = this.w;
    if (item === 'pastry' && !venue.keys.has('menu_pastry')) return false;
    const chef = (actor as StaffMember).role === 'chef';
    const wants = chef ? this.chefPending(venue) > 0 && venue.pass < VENUE_TUNING.passMax : !actor.stack.isFull && w.demand.wants(actor, item);
    if (!wants) {
      zone.progress = 0;
      zone.timer = 0;
      return false;
    }
    const seconds = venue.makeSeconds(item);
    zone.timer += dt * actor.workMultiplier;
    zone.progress = Math.min(1, zone.timer / seconds);
    actor.view.act(item === 'meal' ? 'stamp' : 'stamp', 0.3);
    if (zone.timer < seconds) return true;
    zone.timer = 0;
    zone.progress = 0;
    if (chef) {
      venue.pass++;
      w.train.views[venue.carriage]?.setVenuePass(venue.pass);
      w.audio.play('pop', { volume: 0.5 });
    } else {
      actor.stack.add(item, tmp.set(p.x + 0.6, FLOOR_Y + 1.0, p.z));
      actor.view.bounce(0.3);
      w.audio.play('pickup', { pitch: 1.1 });
      if (actor.isPlayer) w.haptics.light();
      w.events.emit('item.picked', { item, byPlayer: actor.isPlayer });
    }
    w.particles.emit('steam', p.x + 0.7, FLOOR_Y + 1.1, p.z, 3, 0.1);
    return true;
  }
}

type VenueStep =
  | { kind: 'goto'; target: Vec2; node?: string }
  | { kind: 'stand'; until: () => boolean; timeout: number }
  | { kind: 'do'; fn: () => void };

export interface VenueTask {
  label: string;
  icon: IconName;
  steps: VenueStep[];
  release: () => void;
}
