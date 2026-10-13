import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import type { CarriageType } from '../core/types';
import { CarriageView, FLOOR_Y, windowSpacing } from './CarriageView';
import { GeoBuilder, mergePlanes, type PartStyle } from './geo';
import { carriageOriginZ, DEFAULT_WINDOW_BAND, DOOR_Z0, DOOR_Z1, getLayout, HALF_WIDTH } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { letteringTexture } from './sprites';

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
/**
 * Fix list 5.7: the name is sign-written on a letterboard in the carriage's own paint that hangs from the roof edge
 * outward, sloping toward the camera like a fascia (the side itself is seen almost edge-on from above, so a name
 * painted on it could not be read; a board leaning inward hid the rooms). Its height, longest run and slope.
 */
const NAME_HEIGHT = 0.28;
const NAME_MAX_LENGTH = 4.2;
const NAME_TILT = 0.85;
/** Where the board's top edge meets the cornice: out from the wall face and up from the wall top. */
const NAME_TOP_OUT = 0.06;
const NAME_TOP_UP = 0.09;
/** Board paint when none is given (previews, the geometry audit). */
const DEFAULT_BOARD_PAINT = '#2F4C82';

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
  /** One letterboard material per paint (a carriage's class livery or the train's): lit like the paint round it. */
  private readonly boardMaterials = new Map<string, { material: THREE.MeshLambertMaterial; aspect: number }>();
  private boardName = '';
  private boardMeshes: THREE.Mesh[] = [];
  private readonly carpet = new THREE.Group();
  private carpetMesh: THREE.Mesh | null = null;
  private carpetAmount = 0;

  constructor() {
    this.carpet.position.set(HALF_WIDTH, 0, 0);
    this.carpet.visible = false;
    this.group.add(this.carpet);
  }

  /** Rebuilds the dressing for the whole train at once. `paints`: each carriage's body colour, for its letterboard. */
  build(types: readonly CarriageType[], state: ExteriorState, trainName: string, paints: readonly string[] = []): void {
    const steps = this.buildSteps(types, state, trainName, paints);
    while (!steps.next().done) {
      // keep going
    }
  }

  /** The same rebuild a carriage at a time (it yields between them); the old dressing stays until the swap. */
  *buildSteps(types: readonly CarriageType[], state: ExteriorState, trainName: string, paints: readonly string[] = []): Generator<void, void> {
    const s = new GeoBuilder();
    const lamps = new GeoBuilder();
    const boardGeos = new Map<string, THREE.BufferGeometry[]>();
    if (this.boardName !== trainName) {
      for (const { material } of this.boardMaterials.values()) {
        material.map?.dispose();
        material.dispose();
      }
      this.boardMaterials.clear();
      this.boardName = trainName;
    }
    const boardFor = (paint: string): { material: THREE.MeshLambertMaterial; aspect: number } => {
      let entry = this.boardMaterials.get(paint);
      if (!entry) {
        const { texture, aspect } = letteringTexture(trainName, paint);
        entry = { material: new THREE.MeshLambertMaterial({ map: texture }), aspect };
        this.boardMaterials.set(paint, entry);
      }
      return entry;
    };

    for (let index = 0; index < types.length; index++) {
      const type = types[index];
      const oz = carriageOriginZ(index);
      const layout = getLayout(type);
      const [WINDOW_Y0] = layout.windowBand;
      // The brass lamps hang on the piers between windows at the usual height whatever the windows do.
      const WINDOW_Y1 = DEFAULT_WINDOW_BAND[1];
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
        // The board centred on the carriage's longest run of side, hung from the cornice; shorter only for a very
        // long name.
        const paint = paints[index] ?? DEFAULT_BOARD_PAINT;
        const { aspect } = boardFor(paint);
        const zc = oz + (longest.z0 + longest.z1) / 2;
        const length = Math.min(NAME_HEIGHT * aspect, NAME_MAX_LENGTH, longest.z1 - longest.z0 - 1.2);
        const height = length / aspect;
        const board = new THREE.PlaneGeometry(length, height);
        board.rotateY(Math.PI / 2);
        board.rotateZ(NAME_TILT);
        board.translate(longest.face + NAME_TOP_OUT + Math.sin(NAME_TILT) * height / 2, longest.top + NAME_TOP_UP - Math.cos(NAME_TILT) * height / 2, zc);
        const list = boardGeos.get(paint) ?? [];
        list.push(board);
        boardGeos.set(paint, list);
      }
      yield;
    }
    const solidGeo = s.isEmpty ? null : s.build();
    yield;
    const lampGeo = lamps.isEmpty ? null : lamps.build();

    for (const mesh of [this.solid, this.lamps, ...this.boardMeshes]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.solid = this.lamps = null;
    this.boardMeshes = [];
    if (solidGeo) {
      this.solid = new THREE.Mesh(solidGeo, MATERIALS.solid);
      this.solid.castShadow = true;
      this.solid.layers.enable(STATIC_CASTER_LAYER);
      this.group.add(this.solid);
      CarriageView.shadowEpoch++;
    }
    if (lampGeo) {
      this.lamps = new THREE.Mesh(lampGeo, MATERIALS.lamps);
      this.group.add(this.lamps);
    }
    for (const [paint, geos] of boardGeos) {
      const mesh = new THREE.Mesh(mergePlanes(geos), boardFor(paint).material);
      // Receives the moon's shadow like the paint round it (the shader the warm-up compiles for textured boards).
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.boardMeshes.push(mesh);
      for (const g of geos) g.dispose();
    }

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
  b.box(CARPET_LENGTH / 2, FLOOR_Y + 0.018, zc, CARPET_LENGTH - 0.12, 0.012, z1 - z0 - 0.12, CARPET_RED, 0, FLAT);
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
