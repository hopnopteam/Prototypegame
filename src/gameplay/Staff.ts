import * as THREE from 'three';
import type { ItemKind, StaffRole, Vec2 } from '../core/types';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { CharacterView, STAFF_LOOKS } from '../world/CharacterView';
import { Mover, type Actor } from './Actor';
import { CarryStack } from './CarryStack';
import type { Guest } from './Guests';
import type { Bathroom, Cabin } from './TrainState';
import type { World } from './World';

type Step =
  | { kind: 'goto'; target: Vec2; node?: string }
  | { kind: 'stand'; until: () => boolean; timeout: number }
  | { kind: 'do'; fn: () => void };

interface Task {
  label: string;
  icon: IconName;
  steps: Step[];
  /** Releases reservations when the task ends or is abandoned. */
  release: () => void;
}

const ARRIVE_EPSILON = 0.05;

export class StaffMember implements Actor {
  readonly isPlayer = false;
  readonly pos: Vec2;
  readonly view: CharacterView;
  readonly stack: CarryStack;
  readonly mover: Mover;
  level = 1;
  temporary = false;
  task: Task | null = null;
  private stepIndex = 0;
  private stepTime = 0;
  private idleTime = 0;
  /** Items this staff member is fetching; source zones only hand these out. */
  wantItems: Partial<Record<ItemKind, number>> = {};
  /** Where they wait between jobs: their own idle spot if the floor plan has one (out of the walkways), else home. */
  readonly rest: Vec2;

  constructor(readonly w: World, readonly role: StaffRole, readonly carriage: number, readonly home: Vec2) {
    this.pos = { x: home.x, z: home.z };
    this.rest = w.map.hasAnchor(carriage, `idle_${role}`) ? w.map.anchor(carriage, `idle_${role}`) : home;
    this.view = new CharacterView(STAFF_LOOKS[role]);
    this.stack = new CarryStack(this.view.stackAnchor, w.scene, w.tweens, this.baseCapacity());
    this.mover = new Mover(this.pos, this.baseSpeed());
    w.scene.add(this.view.root);
  }

  get workMultiplier(): number {
    return this.w.econ.zones.staffWorkMultiplier * (1 + (this.level - 1) * this.w.econ.staff.upgradeSpeedPerLevel);
  }

  wants(kind: ItemKind): boolean {
    return this.stack.countOf(kind) < (this.wantItems[kind] ?? 0);
  }

  baseSpeed(): number {
    return this.w.econ.staff[this.role].speed * (1 + (this.level - 1) * this.w.econ.staff.upgradeSpeedPerLevel);
  }

  baseCapacity(): number {
    return this.w.econ.staff[this.role].capacity + (this.level - 1) * this.w.econ.staff.upgradeCapacityPerLevel;
  }

  applyLevel(level: number): void {
    this.level = level;
    this.mover.speed = this.baseSpeed();
    this.stack.capacity = this.baseCapacity();
  }

  assign(task: Task): void {
    this.task = task;
    this.stepIndex = 0;
    this.stepTime = 0;
    this.startStep();
  }

  abort(): void {
    if (this.task) this.task.release();
    this.task = null;
    this.wantItems = {};
    this.mover.stop();
  }

  get isIdle(): boolean {
    return this.task === null;
  }

  update(dt: number): void {
    this.mover.update(dt);
    if (this.task) {
      const step = this.task.steps[this.stepIndex];
      this.stepTime += dt;
      if (step?.kind === 'stand' && (step.until() || this.stepTime > step.timeout)) this.nextStep();
      // The step may have finished the task.
      if (this.task) this.view.showBubble(this.task.icon, 'intent', 1.75);
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      this.view.showBubble(null);
      if (!this.mover.isMoving && Math.hypot(this.pos.x - this.rest.x, this.pos.z - this.rest.z) > 0.2 && this.idleTime > this.w.econ.staff[this.role].homeIdleSeconds) {
        this.walkTo(this.rest);
      }
    }
    this.view.setPosition(this.pos.x, FLOOR_Y, this.pos.z);
    this.view.setFacing(this.mover.facing);
    this.view.setCarrying(!this.stack.isEmpty);
    this.view.update(dt, this.mover.speedNow);
    this.stack.update(dt, this.mover.isMoving, this.w.time);
  }

  private startStep(): void {
    const task = this.task;
    if (!task) return;
    const step = task.steps[this.stepIndex];
    if (!step) {
      task.release();
      this.task = null;
      this.wantItems = {};
      return;
    }
    this.stepTime = 0;
    if (step.kind === 'goto') {
      this.walkTo(step.target, step.node, () => this.nextStep());
    } else if (step.kind === 'do') {
      step.fn();
      this.nextStep();
    }
  }

  private nextStep(): void {
    this.stepIndex++;
    this.startStep();
  }

  walkTo(target: Vec2, node?: string, onArrive?: () => void): void {
    const map = this.w.map;
    if (Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < ARRIVE_EPSILON) {
      this.mover.stop();
      onArrive?.();
      return;
    }
    const from = map.nearestNode(this.pos.x, this.pos.z);
    const to = node ?? map.nearestNode(target.x, target.z);
    const path = from && to ? map.nav.findPath(from, to) : null;
    this.mover.go([...(path ?? []), target], onArrive);
  }
}

/**
 * Staff automation (§7): Attendants clean cabins and answer requests, Porters board guests, load luggage and
 * run the desk, Supply Runners restock bathrooms and fetch vendor crates. Each picks the most useful job
 * in its own carriage and shows what it is doing with an intent bubble.
 */
export class StaffManager {
  readonly members: StaffMember[] = [];
  private thinkTimer = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly w: World) {}

  /** Restores hired staff from the save. */
  init(): void {
    for (const [key, value] of Object.entries(this.w.data.staff)) {
      const [role, carriage] = key.split('_');
      if (Number(carriage) < this.w.train.count) this.spawn(role as StaffRole, Number(carriage), value.level, false);
    }
  }

  hire(role: StaffRole, carriage: number): StaffMember {
    const key = `${role}_${carriage}`;
    this.w.data.staff[key] = { level: 1 };
    this.w.save.markDirty();
    const member = this.spawn(role, carriage, 1, true);
    this.w.events.emit('staff.hired', { role, carriage });
    return member;
  }

  upgrade(role: StaffRole, carriage: number): void {
    const key = `${role}_${carriage}`;
    const entry = this.w.data.staff[key];
    if (!entry) return;
    entry.level++;
    this.w.save.markDirty();
    for (const m of this.members) {
      if (m.role === role && m.carriage === carriage && !m.temporary) {
        m.applyLevel(entry.level);
        this.w.particles.emit('star', m.pos.x, FLOOR_Y + 1.2, m.pos.z, 10, 0.3);
      }
    }
  }

  /** Rewarded "temporary porter": works one station stop, then waves goodbye. */
  hireTemporaryPorter(): void {
    const member = this.spawn('porter', 0, 1, true);
    member.temporary = true;
  }

  dismissTemporary(): void {
    for (const m of [...this.members]) {
      if (!m.temporary) continue;
      m.abort();
      this.w.particles.emit('dust', m.pos.x, FLOOR_Y + 0.5, m.pos.z, 12, 0.3);
      this.w.scene.remove(m.view.root);
      this.members.splice(this.members.indexOf(m), 1);
    }
  }

  count(role?: StaffRole): number {
    return this.members.filter((m) => !m.temporary && (!role || m.role === role)).length;
  }

  countsByRole(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const m of this.members) if (!m.temporary) counts[m.role] = (counts[m.role] ?? 0) + 1;
    return counts;
  }

  anyCarrying(kind: ItemKind): boolean {
    return this.members.some((m) => m.stack.has(kind));
  }

  /** Doors closing: nobody is left on the platform, and platform jobs end. */
  onDoorsClosing(): void {
    const door = this.w.map.doors()[0];
    for (const m of this.members) {
      if (m.pos.x > 2.2) {
        m.abort();
        m.pos.x = door.inside.x;
        m.pos.z = door.inside.z;
      }
    }
  }

  update(dt: number): void {
    this.thinkTimer -= dt;
    const think = this.thinkTimer <= 0;
    if (think) this.thinkTimer = 0.25;
    for (const m of this.members) {
      if (think && m.isIdle) {
        const task = this.findTask(m);
        if (task) m.assign(task);
      }
      m.update(dt);
    }
  }

  private spawn(role: StaffRole, carriage: number, level: number, animate: boolean): StaffMember {
    const home = this.w.map.anchor(carriage, `home_${role}`);
    const member = new StaffMember(this.w, role, carriage, home);
    member.applyLevel(level);
    this.members.push(member);
    if (animate) {
      this.w.train.popIn(member.view.root);
      this.w.particles.emit('confetti', home.x, FLOOR_Y + 1.5, home.z, 30, 0.5);
    }
    return member;
  }

  private findTask(m: StaffMember): Task | null {
    switch (m.role) {
      case 'attendant':
        return this.attendantTask(m);
      case 'porter':
        return this.porterTask(m);
      case 'runner':
        return this.runnerTask(m);
    }
  }

  private inScope(m: StaffMember, carriage: number): boolean {
    return carriage === m.carriage;
  }

  private attendantTask(m: StaffMember): Task | null {
    const w = this.w;
    // 1. Answer a request in this carriage.
    const guest = w.guests.openRequests().find((g) => g.cabin && this.inScope(m, g.cabin.carriage) && !(g as Guest & { reservedBy?: StaffMember }).reservedBy);
    if (guest && guest.cabin && guest.request === 'turndown') {
      // Turning a First or Royal bed down: straight to the cabin, a moment at the bedside.
      const cabin = guest.cabin;
      const reserved = guest as Guest & { reservedBy?: StaffMember };
      reserved.reservedBy = m;
      return {
        label: 'turndown', icon: 'turndown',
        steps: [
          { kind: 'goto', target: cabin.center, node: cabin.node },
          { kind: 'stand', until: () => guest.request !== 'turndown', timeout: 4 },
        ],
        release: () => { reserved.reservedBy = undefined; },
      };
    }
    if (guest && guest.cabin && guest.request && guest.request !== 'bathroom' && guest.request !== 'turndown') {
      const item = guest.request;
      const cabin = guest.cabin;
      const reserved = guest as Guest & { reservedBy?: StaffMember };
      reserved.reservedBy = m;
      const steps: Step[] = [];
      if (!m.stack.has(item)) {
        const source = this.nearestSource(item, m.carriage);
        if (!source) {
          reserved.reservedBy = undefined;
          return null;
        }
        steps.push({ kind: 'do', fn: () => (m.wantItems = { [item]: 1 }) });
        steps.push({ kind: 'goto', target: source });
        steps.push({ kind: 'stand', until: () => m.stack.has(item), timeout: 3 });
      }
      steps.push({ kind: 'goto', target: cabin.center, node: cabin.node });
      steps.push({ kind: 'stand', until: () => guest.request !== item || !m.stack.has(item), timeout: 3 });
      steps.push({ kind: 'do', fn: () => this.binLeftovers(m) });
      return { label: 'request', icon: item, steps, release: () => { reserved.reservedBy = undefined; m.wantItems = {}; } };
    }
    // 2. Clean a dirty cabin in this carriage.
    const cabin = w.train.cabins.find((c) => this.inScope(m, c.carriage) && c.isDirty && !c.guest && !c.cleaner);
    if (cabin) {
      cabin.cleaner = m;
      const steps: Step[] = [];
      cabin.spots.forEach((spot, i) => {
        steps.push({ kind: 'goto', target: spot, node: cabin.node });
        steps.push({ kind: 'stand', until: () => !cabin.dirty[i], timeout: 6 });
      });
      return { label: 'clean', icon: 'broom', steps, release: () => { if (cabin.cleaner === m) cabin.cleaner = null; } };
    }
    return this.returnTask(m);
  }

  private porterTask(m: StaffMember): Task | null {
    const w = this.w;
    const station = w.station;
    const luggageCarPorter = w.train.types[m.carriage] === 'luggage';
    if (w.journey.doorsOpen) {
      // Board first: guests waiting is the most visible thing on a platform.
      if (!luggageCarPorter && w.guests.canBoard() && !this.someoneAt('board', m)) {
        const zone = station.boardingPoint();
        return {
          label: 'board', icon: 'ticket',
          steps: [
            { kind: 'goto', target: zone, node: w.map.doors()[0].outsideNode },
            { kind: 'stand', until: () => w.guests.platformGuests().length === 0 || !w.journey.doorsOpen, timeout: 30 },
          ],
          release: () => this.releaseRole('board', m),
          ...this.claimRole('board', m),
        };
      }
      if (station.luggagePile > 0 && w.train.luggageStored < w.train.luggageCapacity) {
        const pile = station.luggagePoint();
        const rack = this.nearestRack(pile);
        m.wantItems = { luggage: m.stack.capacity };
        return {
          label: 'luggage', icon: 'luggage',
          steps: [
            { kind: 'goto', target: pile },
            { kind: 'stand', until: () => m.stack.isFull || station.luggagePile === 0 || !w.journey.doorsOpen, timeout: 8 },
            { kind: 'goto', target: rack.pos, node: rack.node },
            { kind: 'stand', until: () => !m.stack.has('luggage') || w.train.luggageStored >= w.train.luggageCapacity, timeout: 6 },
            { kind: 'do', fn: () => this.binLeftovers(m) },
          ],
          release: () => (m.wantItems = {}),
        };
      }
    } else if (!luggageCarPorter && w.guests.deskReady() && !this.someoneAt('desk', m)) {
      const desk = w.map.anchor(0, 'deskService');
      return {
        label: 'desk', icon: 'ticket',
        steps: [
          { kind: 'goto', target: desk, node: 'c0:desk' },
          { kind: 'stand', until: () => !w.guests.deskReady() || w.journey.doorsOpen, timeout: 20 },
        ],
        release: () => this.releaseRole('desk', m),
        ...this.claimRole('desk', m),
      };
    }
    // Luggage still in hand after the doors closed: finish the job indoors.
    if (m.stack.has('luggage')) {
      const rack = this.nearestRack(m.pos);
      return {
        label: 'luggage', icon: 'luggage',
        steps: [
          { kind: 'goto', target: rack.pos, node: rack.node },
          { kind: 'stand', until: () => !m.stack.has('luggage'), timeout: 5 },
          { kind: 'do', fn: () => this.binLeftovers(m) },
        ],
        release: () => undefined,
      };
    }
    return this.returnTask(m);
  }

  private runnerTask(m: StaffMember): Task | null {
    const w = this.w;
    const station = w.station;
    const facilities = w.data.facilities;
    const max = w.econ.facilities;
    // Vendor crates only exist during a stop, so they come first.
    if (w.journey.doorsOpen && station.vendorCrates > 0 && (facilities.supplyTowel < max.supplyShelfMax || facilities.supplyRoll < max.supplyShelfMax)) {
      const vendor = station.vendorPoint();
      const drop = w.map.anchor(m.carriage, 'crateDrop');
      return {
        label: 'crate', icon: 'crate',
        steps: [
          { kind: 'do', fn: () => (m.wantItems = { crate: 1 }) },
          { kind: 'goto', target: vendor },
          { kind: 'stand', until: () => m.stack.has('crate') || station.vendorCrates === 0 || !w.journey.doorsOpen, timeout: 5 },
          { kind: 'goto', target: drop },
          { kind: 'stand', until: () => !m.stack.has('crate'), timeout: 5 },
        ],
        release: () => (m.wantItems = {}),
      };
    }
    const threshold = max.bathroomRestockThreshold;
    const bath = w.train.bathrooms.find((b) => b.unlocked && !b.restocker && (b.towels <= threshold || b.rolls <= threshold));
    // The stores' shelves first; the washroom car's closet (never empty) when they run dry.
    const closet = w.train.indexOfType('bathroom') !== null;
    if (bath && (closet || facilities.supplyTowel > 0 || facilities.supplyRoll > 0)) {
      bath.restocker = m;
      const needTowels = Math.min(max.bathroomTowelMax - bath.towels, closet ? Infinity : facilities.supplyTowel);
      const needRolls = Math.min(max.bathroomRollMax - bath.rolls, closet ? Infinity : facilities.supplyRoll);
      const cap = m.stack.capacity;
      const towels = Math.min(needTowels, Math.ceil(cap / 2));
      const rolls = Math.min(needRolls, cap - towels);
      const steps: Step[] = [{ kind: 'do', fn: () => (m.wantItems = { towel: towels, roll: rolls }) }];
      if (towels > 0) {
        const at = w.train.supplySource('towel', m.pos) ?? w.map.anchor(m.carriage, 'shelf_towel');
        steps.push({ kind: 'goto', target: at });
        steps.push({ kind: 'stand', until: () => m.stack.countOf('towel') >= towels || !w.train.hasSupply('towel'), timeout: 4 });
      }
      if (rolls > 0) {
        const at = w.train.supplySource('roll', m.pos) ?? w.map.anchor(m.carriage, 'shelf_roll');
        steps.push({ kind: 'goto', target: at });
        steps.push({ kind: 'stand', until: () => m.stack.countOf('roll') >= rolls || !w.train.hasSupply('roll'), timeout: 4 });
      }
      steps.push({ kind: 'goto', target: bath.restock, node: bath.node });
      steps.push({ kind: 'stand', until: () => !this.canRestock(m, bath), timeout: 5 });
      steps.push({ kind: 'do', fn: () => this.binLeftovers(m) });
      return { label: 'restock', icon: 'towel', steps, release: () => { if (bath.restocker === m) bath.restocker = null; m.wantItems = {}; } };
    }
    return this.returnTask(m);
  }

  private canRestock(m: StaffMember, bath: Bathroom): boolean {
    const max = this.w.econ.facilities;
    return (m.stack.has('towel') && bath.towels < max.bathroomTowelMax) || (m.stack.has('roll') && bath.rolls < max.bathroomRollMax);
  }

  /** Anything left in hand that nobody needs goes back where it came from (the bin is the last resort). */
  private returnTask(m: StaffMember): Task | null {
    const kind = this.w.demand.firstSurplus(m);
    if (!kind) return null;
    const target = this.returnPoint(kind, m) ?? this.nearestBin(m.pos);
    if (!target) return null;
    return {
      label: 'return', icon: kind,
      steps: [
        { kind: 'goto', target },
        { kind: 'stand', until: () => this.w.demand.surplus(m, kind) === 0, timeout: 3 },
      ],
      release: () => undefined,
    };
  }

  private returnPoint(kind: ItemKind, m: StaffMember): Vec2 | null {
    const map = this.w.map;
    const supply = this.w.train.indexOfType('supply');
    switch (kind) {
      case 'tea':
      case 'coffee':
      case 'champagne':
      case 'blanket':
      case 'pillow':
        return this.nearestSource(kind, m.carriage);
      case 'towel':
      case 'roll':
        return this.w.train.supplySource(kind, m.pos);
      case 'crate':
        return supply !== null ? map.anchor(supply, 'crateDrop') : null;
      case 'luggage':
        return this.nearestRack(m.pos).pos;
    }
  }

  private binLeftovers(m: StaffMember): void {
    m.wantItems = {};
  }

  private nearestSource(item: ItemKind, carriage: number): Vec2 | null {
    const map = this.w.map;
    // The urn serves tea, coffee and champagne; the linen cupboard blankets, pillows and fresh towels.
    const name = item === 'tea' || item === 'coffee' || item === 'champagne' ? 'urn' : item === 'towel' ? 'linen' : item;
    const candidates: Vec2[] = [];
    for (let i = 0; i < map.count; i++) if (map.hasAnchor(i, name) && (map.layoutOf(i).type === 'lobby' || map.layoutOf(i).type === 'sleeper')) candidates.push(map.anchor(i, name));
    if (candidates.length === 0) return null;
    const ref = map.anchor(carriage, `home_attendant`);
    candidates.sort((a, b) => Math.abs(a.z - ref.z) - Math.abs(b.z - ref.z));
    return candidates[0];
  }

  private nearestRack(from: Vec2): { pos: Vec2; node: string } {
    const map = this.w.map;
    const options: { pos: Vec2; node: string }[] = [{ pos: map.anchor(0, 'rack'), node: 'c0:rack' }];
    const luggage = this.w.train.indexOfType('luggage');
    const lobbyFull = this.w.train.luggageStored >= this.w.econ.facilities.lobbyRackCapacity;
    if (luggage !== null) options.push({ pos: map.anchor(luggage, 'rack'), node: `c${luggage}:rack` });
    if (luggage !== null && lobbyFull) return options[1];
    options.sort((a, b) => Math.abs(a.pos.z - from.z) - Math.abs(b.pos.z - from.z));
    return options[0];
  }

  private nearestBin(from: Vec2): Vec2 | null {
    const map = this.w.map;
    const bins: Vec2[] = [];
    for (let i = 0; i < map.count; i++) if (map.hasAnchor(i, 'bin')) bins.push(map.anchor(i, 'bin'));
    bins.sort((a, b) => Math.abs(a.z - from.z) - Math.abs(b.z - from.z));
    return bins[0] ?? null;
  }

  private readonly roles = new Map<string, StaffMember>();

  private someoneAt(role: string, except: StaffMember): boolean {
    const holder = this.roles.get(role);
    return !!holder && holder !== except && this.members.includes(holder) && !holder.isIdle;
  }

  private claimRole(role: string, m: StaffMember): Record<string, never> {
    this.roles.set(role, m);
    return {};
  }

  private releaseRole(role: string, m: StaffMember): void {
    if (this.roles.get(role) === m) this.roles.delete(role);
  }

  /** Cabin being cleaned or guest being served by staff (for the guidance arrow to skip). */
  isHandled(target: Cabin | Guest): boolean {
    if ('dirty' in target) return !!target.cleaner;
    return !!(target as Guest & { reservedBy?: StaffMember }).reservedBy;
  }

  temp(): THREE.Vector3 {
    return this.tmp;
  }
}
