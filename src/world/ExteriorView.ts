import * as THREE from 'three';
import type { CarriageType } from '../core/types';
import { FLOOR_Y, WINDOW_Y0, WINDOW_Y1, windowSpacing } from './CarriageView';
import { GeoBuilder, type PartStyle } from './geo';
import { carriageOriginZ, DOOR_Z0, DOOR_Z1, getLayout, HALF_WIDTH } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { nameboardTexture } from './sprites';

/** Which exterior upgrades the train has (bought at station stops). */
export interface ExteriorState {
  windowboxes: boolean;
  lamps: boolean;
  lining: boolean;
  nameboards: boolean;
  redcarpet: boolean;
}

const FLAT: PartStyle = { shade: 1 };
const FLOWERS = [PALETTE.blossom, PALETTE.mustard, PALETTE.linen, PALETTE.coral];
/** Red carpet: how far it reaches onto the platform, and its colours. */
const CARPET_LENGTH = 2.0;
const CARPET_RED = '#B8434E';
const CARPET_EDGE = '#D9B25A';
const NAMEBOARD_LENGTH = 3.2;
const NAMEBOARD_HEIGHT = 0.4;
/** Nameboards lean back from vertical so they read from the camera above the train. */
const NAMEBOARD_TILT = 0.85;

/**
 * The outside of the train, dressed by the station workshop: window boxes under every window, brass lamps
 * between them, a gold line along the roof edge, the train's name on a board on every carriage, and a red
 * carpet that rolls out of the lobby door at stops. One merged mesh for the whole train, rebuilt only when
 * something is bought or a carriage couples on.
 */
export class ExteriorView {
  readonly group = new THREE.Group();
  private solid: THREE.Mesh | null = null;
  private lamps: THREE.Mesh | null = null;
  private boards: THREE.Mesh | null = null;
  private readonly boardMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private boardName = '';
  private readonly carpet = new THREE.Group();
  private carpetMesh: THREE.Mesh | null = null;
  private carpetAmount = 0;

  constructor() {
    this.carpet.position.set(HALF_WIDTH, 0, 0);
    this.carpet.visible = false;
    this.group.add(this.carpet);
  }

  build(types: readonly CarriageType[], state: ExteriorState, trainName: string): void {
    for (const mesh of [this.solid, this.lamps, this.boards]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.solid = this.lamps = this.boards = null;
    const s = new GeoBuilder();
    const lamps = new GeoBuilder();
    const boardGeos: THREE.BufferGeometry[] = [];

    types.forEach((type, index) => {
      const oz = carriageOriginZ(index);
      const layout = getLayout(type);
      let longest: { z0: number; z1: number; face: number; top: number } | null = null;
      for (const wall of layout.walls) {
        if (wall.kind !== 'exterior' || wall.z1 - wall.z0 < wall.x1 - wall.x0) continue;
        const right = wall.x0 > 0;
        const face = right ? wall.x1 : wall.x0;
        const out = right ? 1 : -1;
        const len = wall.z1 - wall.z0;
        const top = FLOOR_Y + wall.height;
        if (right && (!longest || len > longest.z1 - longest.z0)) longest = { z0: wall.z0, z1: wall.z1, face, top };
        const { count, slot, width } = windowSpacing(len);
        for (let i = 0; i < count; i++) {
          const zc = oz + wall.z0 + slot * (i + 0.5);
          if (state.windowboxes) {
            // A painted box under the sill, a hedge of leaves and a row of flowers you read from above.
            s.box(face + out * 0.13, FLOOR_Y + WINDOW_Y0 - 0.07, zc, 0.24, 0.13, width + 0.08, PALETTE.stationTrim, 0, { shade: 0.85 });
            s.box(face + out * 0.13, FLOOR_Y + WINDOW_Y0 + 0.01, zc, 0.2, 0.05, width, PALETTE.hedge, 0, FLAT);
            const flowers = Math.max(3, Math.round(width / 0.17));
            for (let k = 0; k < flowers; k++) {
              const fz = zc - width / 2 + (width / flowers) * (k + 0.5);
              s.sphere(face + out * (0.09 + (k % 2) * 0.08), FLOOR_Y + WINDOW_Y0 + 0.07, fz, 0.075, FLOWERS[(k + i) % FLOWERS.length], 0);
            }
          }
          if (state.lamps && i < count - 1 && i % 2 === 0) {
            const pz = zc + slot / 2;
            s.box(face + out * 0.06, FLOOR_Y + WINDOW_Y1 + 0.02, pz, 0.12, 0.025, 0.025, PALETTE.brass, 0, FLAT);
            s.cylinder(face + out * 0.12, FLOOR_Y + WINDOW_Y1 + 0.13, pz, 0.05, 0.035, 0.04, PALETTE.brass, 8, 'y', FLAT);
            lamps.cylinder(face + out * 0.12, FLOOR_Y + WINDOW_Y1 + 0.06, pz, 0.045, 0.06, 0.1, PALETTE.lampShade, 8, 'y', { shade: 0.95 });
          }
        }
        if (state.lining) {
          // Gold along the cornice (the outline you see from above) and a fine line under the windows.
          s.box(face + out * 0.02, top + 0.095, oz + (wall.z0 + wall.z1) / 2, 0.075, 0.016, len, PALETTE.gold, 0, FLAT);
          s.box(face + out * 0.004, FLOOR_Y + WINDOW_Y0 - 0.16, oz + (wall.z0 + wall.z1) / 2, 0.012, 0.035, len, PALETTE.gold, 0, FLAT);
        }
      }
      if (state.nameboards && longest) {
        const zc = oz + (longest.z0 + longest.z1) / 2;
        const length = Math.min(NAMEBOARD_LENGTH, longest.z1 - longest.z0 - 0.4);
        const board = new THREE.PlaneGeometry(length, NAMEBOARD_HEIGHT);
        board.rotateY(Math.PI / 2);
        board.rotateZ(NAMEBOARD_TILT);
        board.translate(longest.face + 0.14, longest.top + 0.2, zc);
        boardGeos.push(board);
        // Two brass brackets hold it to the roof edge.
        for (const dz of [-length / 2 + 0.3, length / 2 - 0.3]) s.box(longest.face + 0.06, longest.top + 0.08, zc + dz, 0.12, 0.16, 0.04, PALETTE.brass, 0, FLAT);
      }
    });

    if (!s.isEmpty) {
      this.solid = new THREE.Mesh(s.build(), MATERIALS.solid);
      this.solid.castShadow = true;
      this.group.add(this.solid);
    }
    if (!lamps.isEmpty) {
      this.lamps = new THREE.Mesh(lamps.build(), MATERIALS.lamps);
      this.group.add(this.lamps);
    }
    if (boardGeos.length > 0) {
      if (this.boardName !== trainName) {
        this.boardMaterial.map?.dispose();
        this.boardMaterial.map = nameboardTexture(trainName);
        this.boardMaterial.needsUpdate = true;
        this.boardName = trainName;
      }
      this.boards = new THREE.Mesh(mergePlanes(boardGeos), this.boardMaterial);
      this.group.add(this.boards);
    }
    for (const g of boardGeos) g.dispose();

    if (state.redcarpet && !this.carpetMesh) this.carpetMesh = buildCarpet(this.carpet);
    if (!state.redcarpet && this.carpetMesh) {
      this.carpet.remove(this.carpetMesh);
      this.carpetMesh.geometry.dispose();
      this.carpetMesh = null;
    }
    this.setCarpet(this.carpetAmount);
  }

  /** The carpet rolls out with the lobby doors (0 closed … 1 open). */
  setCarpet(amount: number): void {
    this.carpetAmount = amount;
    this.carpet.visible = !!this.carpetMesh && amount > 0.02;
    this.carpet.scale.x = Math.max(0.02, amount);
  }
}

function buildCarpet(parent: THREE.Group): THREE.Mesh {
  const b = new GeoBuilder();
  const z0 = DOOR_Z0 + 0.04;
  const z1 = DOOR_Z1 - 0.04;
  const zc = (z0 + z1) / 2;
  b.box(CARPET_LENGTH / 2, FLOOR_Y + 0.006, zc, CARPET_LENGTH, 0.012, z1 - z0, CARPET_EDGE, 0, FLAT);
  b.box(CARPET_LENGTH / 2 - 0.04, FLOOR_Y + 0.014, zc, CARPET_LENGTH - 0.08, 0.008, z1 - z0 - 0.12, CARPET_RED, 0, FLAT);
  // Brass posts at the far end, clear of the guests' path through the middle.
  for (const z of [z0 - 0.08, z1 + 0.08]) {
    b.cylinder(CARPET_LENGTH - 0.1, FLOOR_Y + 0.3, z, 0.03, 0.05, 0.6, PALETTE.brass, 8, 'y', FLAT);
    b.sphere(CARPET_LENGTH - 0.1, FLOOR_Y + 0.63, z, 0.055, PALETTE.brass, 0);
  }
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Joins textured planes (same material) into one geometry: one draw call for every nameboard. */
export function mergePlanes(planes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const p of planes) {
    vertices += p.getAttribute('position').count;
    indices += p.getIndex()?.count ?? 0;
  }
  const position = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index: number[] = [];
  let v = 0;
  for (const p of planes) {
    const pos = p.getAttribute('position');
    const tex = p.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], (v + i) * 3);
      uv.set([tex.getX(i), tex.getY(i)], (v + i) * 2);
    }
    const idx = p.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + v);
    v += pos.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}
