import * as THREE from 'three';
import type { CarriageType, Rect } from '../core/types';
import { GeoBuilder } from './geo';
import {
  CARRIAGE_LENGTH,
  DOOR_Z0,
  DOOR_Z1,
  HALF_WIDTH,
  INNER,
  PARTITION_X0,
  type CarriageLayout,
  type PropDef,
} from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { getDirtTexture } from './sprites';

/** Height of every walkable floor (train and platform); the ground is at y = 0. */
export const FLOOR_Y = 0.55;

const FLOOR_BY_TYPE: Record<CarriageType, string> = {
  lobby: PALETTE.floorLobby,
  sleeper: PALETTE.floorCarpet,
  bathroom: PALETTE.floorTile,
  supply: PALETTE.floorPlank,
  luggage: PALETTE.floorPlank,
};

interface StockSlots {
  meshes: THREE.Mesh[];
}

/**
 * One carriage built from its floor plan. Static parts are merged into three meshes (structure, floor,
 * windows). Things that change (beds that pop in on unlock, dirt, stock on shelves, doors) are small
 * separate meshes the gameplay layer toggles.
 */
export class CarriageView {
  readonly group = new THREE.Group();
  readonly cabinBeds: THREE.Group[] = [];
  readonly bathroomFixtures: THREE.Group[] = [];
  private readonly cabinLocks: THREE.Mesh[] = [];
  private readonly bathroomLocks: THREE.Mesh[] = [];
  private readonly dirt: THREE.Mesh[][] = [];
  private readonly doors: THREE.Mesh[] = [];
  private readonly bathroomTowels: StockSlots[] = [];
  private readonly bathroomRolls: StockSlots[] = [];
  private shelfTowels: StockSlots | null = null;
  private shelfRolls: StockSlots | null = null;
  private readonly luggage: StockSlots = { meshes: [] };
  private doorOpen = 0;

  constructor(readonly layout: CarriageLayout, readonly index: number) {
    this.buildStatic();
    this.buildRooms();
    this.buildDoors();
    this.buildStock();
  }

  setCabinLocked(cabin: number, locked: boolean): void {
    const lock = this.cabinLocks[cabin];
    const bed = this.cabinBeds[cabin];
    if (lock) lock.visible = locked;
    if (bed) bed.visible = !locked;
  }

  setBathroomLocked(bathroom: number, locked: boolean): void {
    const lock = this.bathroomLocks[bathroom];
    const fixtures = this.bathroomFixtures[bathroom];
    if (lock) lock.visible = locked;
    if (fixtures) fixtures.visible = !locked;
  }

  setDirt(cabin: number, spots: boolean[]): void {
    const meshes = this.dirt[cabin];
    if (!meshes) return;
    for (let i = 0; i < meshes.length; i++) meshes[i].visible = !!spots[i];
  }

  setBathroomStock(bathroom: number, towels: number, rolls: number): void {
    showCount(this.bathroomTowels[bathroom], towels);
    showCount(this.bathroomRolls[bathroom], rolls);
  }

  setShelfStock(towels: number, rolls: number): void {
    showCount(this.shelfTowels, towels);
    showCount(this.shelfRolls, rolls);
  }

  setLuggageCount(count: number): void {
    showCount(this.luggage, count);
  }

  /** 0 = closed, 1 = open. Doors slide along the carriage. */
  setDoorOpen(amount: number): void {
    if (amount === this.doorOpen) return;
    this.doorOpen = amount;
    for (const door of this.doors) {
      const closedZ = door.userData.closedZ as number;
      door.position.z = closedZ + amount * (DOOR_Z1 - DOOR_Z0) * 0.92;
    }
  }

  private buildStatic(): void {
    const L = CARRIAGE_LENGTH;
    const structure = new GeoBuilder();
    const floor = new GeoBuilder();
    const windows = new GeoBuilder();
    const type = this.layout.type;

    // Undercarriage and bogies.
    structure.box(0, 0.28, L / 2, HALF_WIDTH * 2 - 0.5, 0.22, L - 0.6, PALETTE.undercarriage);
    for (const z of [2.3, L - 2.3]) {
      structure.box(0, 0.2, z, 2.4, 0.2, 2.2, PALETTE.wheel);
      for (const x of [-1.28, 1.28]) {
        for (const dz of [-0.6, 0.6]) structure.cylinder(x, 0.22, z + dz, 0.26, 0.26, 0.14, PALETTE.wheel, 10, 'x');
      }
    }
    // Buffers and coupling hooks at both ends.
    for (const z of [0.02, L - 0.02]) {
      for (const x of [-1.3, 1.3]) structure.cylinder(x, 0.42, z, 0.12, 0.12, 0.25, PALETTE.chrome, 8, 'z');
    }

    // Floor: base plank colour, then a coloured carpet per room just above it.
    floor.box(0, (0.4 + FLOOR_Y) / 2, L / 2, HALF_WIDTH * 2, FLOOR_Y - 0.4, L, PALETTE.floorCorridor);
    const lift = 0.004;
    for (const room of this.layout.rooms) {
      const isCabinRow = this.layout.cabins.some((c) => sameRect(c.room, room)) || this.layout.bathrooms.some((b) => sameRect(b.room, room));
      const color = isCabinRow ? (type === 'bathroom' ? PALETTE.floorTile : PALETTE.floorCarpet) : FLOOR_BY_TYPE[type];
      floor.slab(room, FLOOR_Y, FLOOR_Y + lift, color, 0, 0.02);
    }
    // Corridor runner rug where there is a corridor.
    if (this.layout.cabins.length > 0 || this.layout.bathrooms.length > 0) {
      const z0 = type === 'lobby' ? 6.0 : 1.2;
      floor.box((-INNER + PARTITION_X0) / 2, FLOOR_Y + lift * 1.5, (z0 + L - 1.4) / 2, 0.8, lift, L - 1.4 - z0, PALETTE.blanket);
    }

    // Walls with trim caps.
    for (const wall of this.layout.walls) {
      const exterior = wall.kind === 'exterior';
      const color = exterior ? PALETTE.trainBody : PALETTE.wallInterior;
      structure.slab(wall, FLOOR_Y, FLOOR_Y + wall.height, color);
      structure.slab(wall, FLOOR_Y + wall.height, FLOOR_Y + wall.height + 0.05, exterior ? PALETTE.brass : PALETTE.woodLight);
      if (exterior && Math.abs(wall.x0) >= INNER - 0.01 && wall.z1 - wall.z0 > 0.9) {
        this.addWindows(windows, wall);
        // Brass stripe along the lower body, under the windows.
        const outer = wall.x0 < 0 ? wall.x0 - 0.005 : wall.x1 + 0.005;
        structure.box(outer, FLOOR_Y + 0.22, (wall.z0 + wall.z1) / 2, 0.012, 0.06, wall.z1 - wall.z0, PALETTE.brass);
      }
    }

    for (const prop of this.layout.props) {
      if (prop.kind === 'bed' || prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') continue;
      buildProp(structure, prop);
    }

    this.group.add(new THREE.Mesh(structure.build(), MATERIALS.solid));
    this.group.add(new THREE.Mesh(floor.build(), MATERIALS.floor));
    if (!windows.isEmpty) this.group.add(new THREE.Mesh(windows.build(), MATERIALS.windows));
  }

  private addWindows(builder: GeoBuilder, wall: Rect): void {
    const outerX = wall.x0 < 0 ? wall.x0 - 0.006 : wall.x1 + 0.006;
    const length = wall.z1 - wall.z0;
    const count = Math.floor(length / 1.7);
    if (count <= 0) return;
    const spacing = length / count;
    for (let i = 0; i < count; i++) {
      const z = wall.z0 + spacing * (i + 0.5);
      builder.box(outerX, FLOOR_Y + 0.62, z, 0.012, 0.42, Math.min(1.0, spacing - 0.4), PALETTE.windowDay);
    }
  }

  private buildRooms(): void {
    for (const cabin of this.layout.cabins) {
      const bed = new GeoBuilder();
      buildProp(bed, { kind: 'bed', rect: cabin.bed });
      const bedGroup = new THREE.Group();
      const centerX = (cabin.bed.x0 + cabin.bed.x1) / 2;
      const centerZ = (cabin.bed.z0 + cabin.bed.z1) / 2;
      const geometry = bed.build();
      geometry.translate(-centerX, -FLOOR_Y, -centerZ);
      bedGroup.add(new THREE.Mesh(geometry, MATERIALS.solid));
      bedGroup.position.set(centerX, FLOOR_Y, centerZ);
      this.group.add(bedGroup);
      this.cabinBeds[cabin.index] = bedGroup;

      const lock = new THREE.Mesh(new THREE.PlaneGeometry(cabin.room.x1 - cabin.room.x0, cabin.room.z1 - cabin.room.z0).rotateX(-Math.PI / 2), MATERIALS.lockedOverlay);
      lock.position.set((cabin.room.x0 + cabin.room.x1) / 2, FLOOR_Y + 0.01, (cabin.room.z0 + cabin.room.z1) / 2);
      lock.visible = false;
      this.group.add(lock);
      this.cabinLocks[cabin.index] = lock;

      const dirtMaterial = new THREE.MeshBasicMaterial({ map: getDirtTexture(), transparent: true, depthWrite: false });
      this.dirt[cabin.index] = cabin.spots.map((spot) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), dirtMaterial);
        mesh.position.set(spot.x, FLOOR_Y + 0.012, spot.z);
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.visible = false;
        this.group.add(mesh);
        return mesh;
      });
    }

    for (const bath of this.layout.bathrooms) {
      const builder = new GeoBuilder();
      for (const prop of this.layout.props) {
        if ((prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') && rectInside(prop.rect, bath.room)) buildProp(builder, prop);
      }
      const group = new THREE.Group();
      group.add(new THREE.Mesh(builder.build(), MATERIALS.solid));
      this.group.add(group);
      this.bathroomFixtures[bath.index] = group;

      const lock = new THREE.Mesh(new THREE.PlaneGeometry(bath.room.x1 - bath.room.x0, bath.room.z1 - bath.room.z0).rotateX(-Math.PI / 2), MATERIALS.lockedOverlay);
      lock.position.set((bath.room.x0 + bath.room.x1) / 2, FLOOR_Y + 0.01, (bath.room.z0 + bath.room.z1) / 2);
      lock.visible = false;
      this.group.add(lock);
      this.bathroomLocks[bath.index] = lock;
    }
  }

  private buildDoors(): void {
    const geometry = new THREE.BoxGeometry(0.08, 1.05, DOOR_Z1 - DOOR_Z0);
    const builder = new GeoBuilder().add(geometry, PALETTE.trainBodyDark, 0, 0, 0);
    builder.box(0.045, 0.2, 0, 0.01, 0.35, (DOOR_Z1 - DOOR_Z0) * 0.6, PALETTE.windowDay);
    const doorGeometry = builder.build();
    const steps = new GeoBuilder();
    for (const door of this.layout.doors) {
      const mesh = new THREE.Mesh(doorGeometry, MATERIALS.solid);
      const closedZ = (door.z0 + door.z1) / 2;
      mesh.position.set(HALF_WIDTH + 0.05, FLOOR_Y + 0.52, closedZ);
      mesh.userData.closedZ = closedZ;
      this.group.add(mesh);
      this.doors.push(mesh);
      // Brass step plate outside the door.
      steps.box(HALF_WIDTH + 0.18, FLOOR_Y - 0.03, closedZ, 0.35, 0.05, DOOR_Z1 - DOOR_Z0, PALETTE.brass);
    }
    if (!steps.isEmpty) this.group.add(new THREE.Mesh(steps.build(), MATERIALS.solid));
  }

  private buildStock(): void {
    const towelGeo = new GeoBuilder().box(0, 0, 0, 0.26, 0.09, 0.2, PALETTE.towel).box(0, 0.02, 0.06, 0.27, 0.02, 0.04, '#FFFFFF').build();
    const rollGeo = new GeoBuilder().cylinder(0, 0, 0, 0.07, 0.07, 0.14, '#FFFFFF', 8, 'x').build();
    const suitcaseGeo = new GeoBuilder().box(0, 0, 0, 0.42, 0.26, 0.3, PALETTE.suitcase).box(0, 0.14, 0, 0.14, 0.04, 0.05, PALETTE.ink).box(0, 0, 0, 0.44, 0.04, 0.32, PALETTE.brass).build();

    for (const bath of this.layout.bathrooms) {
      const sink = this.layout.props.find((p) => p.kind === 'sink' && rectInside(p.rect, bath.room));
      if (!sink) continue;
      const baseZ = sink.rect.z1 + 0.25;
      const towels: THREE.Mesh[] = [];
      const rolls: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(towelGeo, MATERIALS.solid);
        t.position.set(INNER - 0.18, FLOOR_Y + 0.7 + (i % 2) * 0.1, baseZ + Math.floor(i / 2) * 0.24);
        this.group.add(t);
        towels.push(t);
        const r = new THREE.Mesh(rollGeo, MATERIALS.solid);
        r.position.set(INNER - 0.14, FLOOR_Y + 0.45 + (i % 2) * 0.15, bath.room.z0 + 1.25 + Math.floor(i / 2) * 0.17);
        this.group.add(r);
        rolls.push(r);
      }
      this.bathroomTowels[bath.index] = { meshes: towels };
      this.bathroomRolls[bath.index] = { meshes: rolls };
    }

    const towelShelf = this.layout.props.find((p) => p.kind === 'shelfTowel');
    const rollShelf = this.layout.props.find((p) => p.kind === 'shelfRoll');
    if (towelShelf) this.shelfTowels = { meshes: this.fillShelf(towelShelf.rect, towelGeo, 16) };
    if (rollShelf) this.shelfRolls = { meshes: this.fillShelf(rollShelf.rect, rollGeo, 16) };

    const racks = this.layout.props.filter((p) => p.kind === 'rack' || p.kind === 'luggageRack');
    for (const rack of racks) {
      const capacity = rack.kind === 'rack' ? 4 : 8;
      const cols = rack.kind === 'rack' ? 1 : 2;
      const rows = Math.ceil(capacity / cols);
      const depth = rack.rect.z1 - rack.rect.z0;
      for (let i = 0; i < capacity; i++) {
        const mesh = new THREE.Mesh(suitcaseGeo, MATERIALS.solid);
        const col = i % cols;
        const row = Math.floor(i / cols) % rows;
        const layer = Math.floor(i / (cols * rows));
        const x = rack.rect.x0 + (rack.rect.x1 - rack.rect.x0) * ((col + 0.5) / cols);
        const z = rack.rect.z0 + depth * ((row + 0.5) / rows);
        // Sit on the top shelf so suitcases read from the top-down camera.
        mesh.position.set(x, FLOOR_Y + 0.86 + layer * 0.28, z);
        mesh.rotation.y = Math.PI / 2;
        mesh.visible = false;
        this.group.add(mesh);
        this.luggage.meshes.push(mesh);
      }
    }
  }

  private fillShelf(r: Rect, geometry: THREE.BufferGeometry, count: number): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const rows = 4;
    const cols = count / rows;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, MATERIALS.solid);
      const col = i % cols;
      const row = Math.floor(i / cols);
      mesh.position.set((r.x0 + r.x1) / 2, FLOOR_Y + 0.35 + (row % 2) * 0.33, r.z0 + 0.4 + (col + (row >= 2 ? 0 : 0.5)) * ((r.z1 - r.z0 - 0.8) / cols));
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

function showCount(slots: StockSlots | null | undefined, count: number): void {
  if (!slots) return;
  for (let i = 0; i < slots.meshes.length; i++) slots.meshes[i].visible = i < count;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x0 - b.x0) < 1e-6 && Math.abs(a.z0 - b.z0) < 1e-6 && Math.abs(a.x1 - b.x1) < 1e-6 && Math.abs(a.z1 - b.z1) < 1e-6;

const rectInside = (inner: Rect, outer: Rect): boolean => inner.x0 >= outer.x0 - 0.01 && inner.x1 <= outer.x1 + 0.01 && inner.z0 >= outer.z0 - 0.01 && inner.z1 <= outer.z1 + 0.01;

/** Furniture, from a footprint. All props face a sensible way given their footprint. */
export function buildProp(b: GeoBuilder, prop: PropDef): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  switch (prop.kind) {
    case 'bed': {
      b.slab(r, y, y + 0.26, PALETTE.wood);
      b.slab(r, y + 0.26, y + 0.4, PALETTE.mattress, 0, 0.04);
      b.box(cx, y + 0.45, r.z0 + 0.25, w - 0.2, 0.1, 0.32, PALETTE.pillow);
      b.box(cx, y + 0.43, r.z0 + d * 0.62, w - 0.02, 0.07, d * 0.62, PALETTE.blanket);
      b.box(r.x1 - 0.05, y + 0.45, cz, 0.1, 0.5, d, PALETTE.wood);
      b.box(cx, y + 0.55, r.z0 + 0.04, w, 0.6, 0.08, PALETTE.wood);
      break;
    }
    case 'desk': {
      b.slab(r, y, y + 0.88, PALETTE.wood);
      b.slab(r, y + 0.88, y + 0.94, PALETTE.brass, 0, -0.04);
      b.box(r.x1 + 0.005, y + 0.45, cz, 0.02, 0.5, d - 0.3, PALETTE.woodLight);
      b.sphere(cx + 0.1, y + 1.0, r.z0 + 0.3, 0.08, PALETTE.brass, 1);
      b.box(cx - 0.05, y + 0.97, cz + 0.2, 0.3, 0.04, 0.4, '#F4EAD5');
      b.box(cx - 0.05, y + 0.99, cz + 0.2, 0.28, 0.02, 0.02, PALETTE.blanket);
      break;
    }
    case 'urn': {
      b.slab(r, y, y + 0.8, PALETTE.wood);
      b.cylinder(cx, y + 1.05, cz, 0.16, 0.2, 0.46, PALETTE.brass, 10);
      b.cylinder(cx, y + 1.32, cz, 0.06, 0.12, 0.1, PALETTE.brass, 10);
      b.cylinder(cx + 0.18, y + 0.86, cz + 0.12, 0.05, 0.04, 0.08, '#FFFFFF', 8);
      break;
    }
    case 'linen': {
      b.slab(r, y, y + 0.95, PALETTE.wood);
      const half = w / 2;
      for (let i = 0; i < 4; i++) {
        b.box(r.x0 + half * 0.5, y + 0.98 + i * 0.1, cz, half - 0.12, 0.09, d - 0.14, i % 2 ? PALETTE.blanket : '#B2404F');
        b.box(r.x0 + half * 1.5, y + 0.98 + i * 0.09, cz, half - 0.16, 0.08, d - 0.18, PALETTE.pillow);
      }
      break;
    }
    case 'rack':
    case 'luggageRack': {
      for (const level of [0.3, 0.7]) b.slab(r, y + level - 0.03, y + level, PALETTE.chrome, 0, 0.02);
      for (const px of [r.x0 + 0.05, r.x1 - 0.05]) {
        for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(px, y + 0.4, pz, 0.05, 0.8, 0.05, PALETTE.chrome);
      }
      break;
    }
    case 'bin':
      b.cylinder(cx, y + 0.3, cz, Math.min(w, d) * 0.45, Math.min(w, d) * 0.4, 0.6, '#3F6B4E', 10);
      b.cylinder(cx, y + 0.62, cz, Math.min(w, d) * 0.47, Math.min(w, d) * 0.47, 0.05, PALETTE.chrome, 10);
      break;
    case 'plant':
      b.cylinder(cx, y + 0.2, cz, 0.18, 0.14, 0.4, PALETTE.brick, 8);
      b.sphere(cx, y + 0.6, cz, 0.3, '#5E8C3E', 0);
      b.sphere(cx + 0.1, y + 0.8, cz - 0.05, 0.2, '#6FA24A', 0);
      break;
    case 'toilet':
      b.box(cx + 0.12, y + 0.3, cz, w * 0.5, 0.6, d * 0.8, PALETTE.porcelain);
      b.cylinder(cx - 0.1, y + 0.25, cz, 0.22, 0.18, 0.5, PALETTE.porcelain, 10);
      b.cylinder(cx - 0.1, y + 0.51, cz, 0.23, 0.23, 0.04, PALETTE.chrome, 10);
      break;
    case 'sink':
      b.cylinder(cx, y + 0.35, cz, 0.08, 0.12, 0.7, PALETTE.porcelain, 8);
      b.box(cx - 0.02, y + 0.72, cz, w, 0.1, d * 0.85, PALETTE.porcelain);
      b.box(cx - 0.02, y + 0.77, cz, w * 0.7, 0.02, d * 0.55, '#9FD3F0');
      b.box(r.x1 - 0.04, y + 1.05, cz, 0.03, 0.45, d * 0.7, '#CFE3EE');
      break;
    case 'bathtub':
      b.slab(r, y, y + 0.5, PALETTE.porcelain);
      b.slab(r, y + 0.5, y + 0.52, '#8ECDEB', 0, 0.12);
      break;
    case 'shelfTowel':
    case 'shelfRoll':
      b.slab(r, y, y + 0.08, PALETTE.wood);
      for (const level of [0.28, 0.61, 0.94]) b.slab(r, y + level, y + level + 0.04, PALETTE.woodLight, 0, 0.02);
      b.box(prop.kind === 'shelfTowel' ? r.x0 + 0.04 : r.x1 - 0.04, y + 0.5, cz, 0.06, 1.0, d, PALETTE.wood);
      break;
    case 'crateBay':
      b.slab(r, y, y + 0.02, '#9C7A52');
      b.box(cx, y + 0.25, r.z0 + 0.5, w * 0.7, 0.5, 0.7, '#C99A5B');
      b.box(cx, y + 0.72, r.z0 + 0.5, w * 0.6, 0.44, 0.6, '#B8864E');
      b.box(cx, y + 0.25, r.z1 - 0.6, w * 0.7, 0.5, 0.7, '#C99A5B');
      break;
    case 'bench':
      b.slab(r, y + 0.35, y + 0.45, PALETTE.woodLight, 0, 0.05);
      b.box(r.x0 + 0.1, y + 0.7, cz, 0.08, 0.5, d - 0.1, PALETTE.woodLight);
      for (const pz of [r.z0 + 0.2, r.z1 - 0.2]) b.box(cx, y + 0.18, pz, w - 0.1, 0.36, 0.08, PALETTE.wood);
      break;
    case 'lamp':
      b.cylinder(cx, y + 1.0, cz, 0.04, 0.05, 2.0, PALETTE.ink, 6);
      break;
  }
}
