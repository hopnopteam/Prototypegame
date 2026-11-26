import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import { CarriageView } from './CarriageView';
import { RIVALS } from '../config/press';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, LOCOMOTIVE_LENGTH } from './layout';
import { ADD_GLOW, glowTexture, MATERIALS } from './materials';
import { PALETTE } from './palette';
import { type Recolor, modelEntry } from './models/library';
import { signTexture } from './sprites';
import { REFLECT_LAYER } from './Water';
import { ACTIVE_ROUTE } from '../config/routes';

/** How far the headlight's beam dips toward the track (radians). */
/**
 * Session 66 (de-slop T11: "a saturated lavender/indigo box… screams stock kit"): the engine and tender's kit blue-violet
 * repainted a deep railway green, so they belong with the warm carriages (red buffers and gold trim stay as modelled).
 */
const LOCO_PAINT: Recolor[] = [{ hue: [200, 300], sat: [0.15, 1], ref: '#5A64B4', to: '#3F6E53' }];

const HEADLIGHT_TILT = -0.09;

/** A cone of light 10 m long along -z from its apex, fading toward the far end. */
const BEAM_GEOMETRY = (() => {
  const g = new THREE.ConeGeometry(1.5, 10, 20, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -5);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = 1 - Math.min(1, -pos.getZ(i) / 10);
    colors.set([t, t * 0.9, t * 0.7], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
})();
const POOL_GEOMETRY = new THREE.PlaneGeometry(2.8, 7.5).rotateX(-Math.PI / 2);

/** A soft oval of warm light for the track ahead of the headlamp. */
/** The headlamp's pool on the track ahead (session 24: opaque and added; see glowTexture). */
const POOL_TEXTURE = (): THREE.Texture => glowTexture(64, 128, 32, 75, 2, 62, [[0, 0.9], [0.5, 0.35], [1, 0]]);
const POOL_COLOR = new THREE.Color('#FFE2AA');

/** The cab roof's top, the row of flagpoles across it (half its span), their height and the flags' size. */
/** The locomotive model's uniform scale: its width about a carriage's lower body. */
const LOCO_SCALE = 2.2;
/** The model's front faces +z; a half turn points it down the line (-z). */
const LOCO_TURN = Math.PI;
/** Gap between the cab and the tender. */
const TENDER_GAP = 0.25;
/** Chimney as a fraction of the model's length from its front; the lamp's height on the model. */
const CHIMNEY_AT = 0.2;
const LAMP_Y = 0.62;
const CAB_ROOF_TOP = 1.66 * LOCO_SCALE;
/**
 * De-Slop B5, measured on the model (its own units, before the half turn): the cab's side face on the camera side,
 * its window (pale blue glass at y 1.0–1.2, z −1.0…−0.5) and the gold lining below it (y 0.7).
 */
const CAB_SIDE_X = 0.59;
const CAB_WINDOW_Z = -0.75;
/** The cab's back doorway (model units): its frame x −0.39…+0.31 at z −1.3 (outer face) to −1.25 (recess). */
const CAB_DOOR_X = -0.04;
const CAB_DOOR_Y = 1.02;
const CAB_DOOR_Z = -1.275;
const CAB_DOOR_W = 0.5;
const CAB_DOOR_H = 0.26;
/** The nameplate, between the window and the gold line (model units), and its width in metres. */
const PLATE_Y = 0.86;
const PLATE_W = 1.15;
/**
 * Phase 4, the streamliner (the coast's `locomotive`): a shrouded engine and a matching tender painted with the live
 * livery (body and trim materials, so it fades from sun-bleached to fresh blue with the route's liveries), a rounded
 * nose with the headlamp in it, a white band down each side, a dark skirt over the bogies and a raked windscreen.
 */
const STREAM = { width: 3.0, skirtTop: 0.78, waist: 1.85, bodyTop: 2.95, nose: 2.4, engine: 6.6, radius: 0.32, lampY: 1.5 };
const PENNANT_ROW = 1.4;
const PENNANT_POLE = 0.58;
const PENNANT_WIDTH = 0.3;
const PENNANT_DROP = 0.21;
/** Flags are lightened toward white so they read against the night sky (the rivals' liveries are deep). */
const PENNANT_LIFT = 0.3;
const flagTint = new THREE.Color();
const lifted = (hex: string, by: number): string => '#' + flagTint.set(hex).lerp(new THREE.Color('#FFFFFF'), by).getHexString();
/** One slot for every rival in the league. */
const PENNANT_SLOTS = RIVALS.length;

/** Steam locomotive at the head of the train (top of the screen). Faces -z. Kenney's blue and gold engine (session 51b). */
export class LocomotiveView {
  readonly group = new THREE.Group();
  /** World position the smoke puffs come out of. */
  readonly chimneyTop = new THREE.Vector3();
  /** The brass nameplate on the tender, facing the train: the player's name for her. */
  private nameplate!: THREE.Mesh;
  private name = '';
  /** Pennants of the rivals beaten (session 18): a line from a brass mast on the cab roof to the chimney. */
  private pennants: THREE.Mesh | null = null;
  private pennantKey = '';
  private pennantLine!: { from: THREE.Vector3; to: THREE.Vector3 };
  /** The cab roof the pennants stand on. */
  private roofTop = CAB_ROOF_TOP;
  private readonly lampMaterial = new THREE.MeshBasicMaterial({ color: '#FFE3A8' });
  private readonly beam = new THREE.Mesh(BEAM_GEOMETRY, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false }));
  private readonly pool = new THREE.Mesh(POOL_GEOMETRY, new THREE.MeshBasicMaterial({ map: POOL_TEXTURE(), color: 0x000000, ...ADD_GLOW }));

  constructor() {
    const back = -GANGWAY_LENGTH;
    const front = back - LOCOMOTIVE_LENGTH;
    const b = new GeoBuilder();
    const streamliner = ACTIVE_ROUTE.locomotive === 'streamliner';
    const roofTop = streamliner ? STREAM.bodyTop : CAB_ROOF_TOP;
    if (streamliner) {
      this.buildStreamliner(b, front, back);
      const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(STATIC_CASTER_LAYER);
      this.group.add(mesh);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 14).rotateX(Math.PI / 2), this.lampMaterial);
      lamp.position.set(0, STREAM.lampY, front + 0.06);
      this.group.add(lamp);
      this.beam.position.set(0, STREAM.lampY, front + 0.02);
      this.beam.rotation.x = HEADLIGHT_TILT;
      this.pool.position.set(0, 0.3, front - 5.2);
      this.group.add(this.beam, this.pool);
      this.chimneyTop.set(0, STREAM.bodyTop + 0.2, front + STREAM.nose + 1.2);
      this.pennantLine = { from: new THREE.Vector3(-PENNANT_ROW, roofTop, front + STREAM.engine - 0.3), to: new THREE.Vector3(PENNANT_ROW - PENNANT_WIDTH, roofTop, front + STREAM.engine - 0.3) };
      this.roofTop = roofTop;
      this.group.traverse((o) => o.layers.enable(REFLECT_LAYER));
      this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
      this.nameplate.position.set(0, 1.3, back + 0.03);
      this.nameplate.visible = false;
      this.group.add(this.nameplate);
      return;
    }
    // Session 51b (owner: "the engine… very ugly… the tires are all over the place… a model that looks and behaves very
    // well"): Kenney's Train Kit steam locomotive (CC0), blue with gold lining and proper wheels and rods, scaled up
    // uniformly, with the kit's own coal wagon as its tender behind the cab, shortened to fit the locomotive's length.
    const loco = modelEntry('locomotive');
    const s = LOCO_SCALE;
    const locoLength = (loco.max[2] - loco.min[2]) * s;
    const locoMid = front + locoLength / 2;
    b.object('locomotive');
    b.model('locomotive', 0, 0, locoMid, LOCO_TURN, s, s, s, { surface: 'varnish', shade: 0.95, recolor: LOCO_PAINT });
    const tender = modelEntry('tender');
    const tenderLength = back - (front + locoLength) - TENDER_GAP;
    const tz = tenderLength / (tender.max[2] - tender.min[2]);
    b.model('tender', 0, 0, back - tenderLength / 2, 0, s * 0.95, s * 0.82, tz, { surface: 'varnish', shade: 0.95, recolor: LOCO_PAINT });
    b.endObject();
    // Where the parts stand on the model (fractions of its length from the front, of its height): chimney, lamp, cab.
    const chimneyZ = front + CHIMNEY_AT * locoLength;
    const cabBack = front + locoLength;
    const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(STATIC_CASTER_LAYER);
    this.group.add(mesh);

    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.25, 14).rotateX(Math.PI / 2), this.lampMaterial);
    lamp.position.set(0, LAMP_Y * s, front + 0.12);
    this.group.add(lamp);
    // The headlight at night: a soft cone of light down the line and a warm pool where it lands on the track.
    this.beam.position.set(0, LAMP_Y * s, front + 0.05);
    this.beam.rotation.x = HEADLIGHT_TILT;
    this.pool.position.set(0, 0.3, front - 5.2);
    this.group.add(this.beam, this.pool);

    this.chimneyTop.set(0, loco.max[1] * s + 0.1, chimneyZ);
    // The flagpoles stand in a row along the cab roof's rear edge (the edge nearest the camera).
    this.pennantLine = { from: new THREE.Vector3(-PENNANT_ROW, CAB_ROOF_TOP, cabBack - 0.3), to: new THREE.Vector3(PENNANT_ROW - PENNANT_WIDTH, CAB_ROOF_TOP, cabBack - 0.3) };
    this.group.traverse((o) => o.layers.enable(REFLECT_LAYER));

    // De-Slop B5: the cab is lived in at night (its side window glows warm), and the name is a brass plate fixed
    // to the cab side on two brackets, under the window where the camera sees it (it hung in the air over the gap
    // between the tender and the first carriage).
    const cabX = CAB_SIDE_X * s + 0.012;
    const cabZ = locoMid - CAB_WINDOW_Z * s;
    // The cab's back (facing the tender and the camera) is an open doorway: its upper half glows with the firebox.
    const cabGlow = new THREE.Mesh(new THREE.PlaneGeometry(CAB_DOOR_W * s, CAB_DOOR_H * s), new THREE.MeshBasicMaterial({ color: '#FFB866' }));
    cabGlow.position.set(-CAB_DOOR_X * s, CAB_DOOR_Y * s, locoMid - CAB_DOOR_Z * s);
    this.group.add(cabGlow);
    const brackets = new GeoBuilder();
    for (const dz of [-0.5, 0.5]) brackets.box(cabX + 0.02, PLATE_Y * s, cabZ + dz * (PLATE_W - 0.12), 0.05, 0.08, 0.05, PALETTE.brass, 0, { surface: 'brass' });
    const bracketMesh = new THREE.Mesh(brackets.build(), MATERIALS.solid);
    this.group.add(bracketMesh);
    this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_W * 0.15).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.nameplate.position.set(cabX + 0.05, PLATE_Y * s, cabZ);
    this.nameplate.visible = false;
    this.group.add(this.nameplate);
  }

  /**
   * Phase 4: the streamliner. Two-tone like the classic coast streamliners: the livery's body colour below the waist,
   * its trim colour (white) above and over the roof with a stripe of the body colour down its middle, a dark window
   * band along the cab, a rounded nose in the same two colours with a raked windscreen, a dark skirt over the bogies,
   * and a matching tender. Livery parts are on the livery materials, so the paint follows the route's liveries.
   */
  private buildStreamliner(b: GeoBuilder, front: number, back: number): void {
    const S = STREAM;
    const lower = new GeoBuilder();
    const upper = new GeoBuilder();
    const w = S.width;
    const waist = S.waist;
    const engineBack = front + S.engine;
    const shroud0 = front + S.nose;
    const tender0 = engineBack + 0.3;
    // The skirt and underframe, dark, the whole length; bogie wheels peeping out under it.
    b.object('locomotive');
    b.box(0, (S.skirtTop + 0.3) / 2, (front + 0.4 + back) / 2, w - 0.3, S.skirtTop - 0.3, back - front - 0.6, '#2B3038', 0, { shade: 0.85, surface: 'iron' });
    for (const z of [front + 1.6, front + 2.6, engineBack - 1.8, engineBack - 0.8, back - 2.1, back - 1.0]) {
      for (const x of [-1, 1]) b.cylinder(x * (w / 2 - 0.42), 0.42, z, 0.36, 0.36, 0.16, '#1E2128', 16, 'x', { shade: 0.9, surface: 'iron' });
    }
    // The window band along both sides of the engine (the cab at the front, the engine room behind), the raked
    // windscreen at the top of the nose and the buffer beam.
    for (const x of [-1, 1]) b.box(x * (w / 2 + 0.008), waist + 0.32, (shroud0 + engineBack) / 2, 0.02, 0.36, engineBack - shroud0 - 0.5, '#1F2A36', 0, { shade: 1, surface: 'glass' });
    for (const x of [-1, 1]) b.box(x * (w / 2 - 0.042), waist + 0.22, (tender0 + back) / 2, 0.02, 0.3, back - tender0 - 0.8, '#1F2A36', 0, { shade: 1, surface: 'glass' });
    b.add(new THREE.BoxGeometry(w * 0.6, 0.5, 0.06), '#1F2A36', 0, S.bodyTop - 0.38, shroud0 - 0.42, -0.75, 0, 0, { shade: 1, surface: 'glass' });
    b.box(0, 0.7, front + 0.3, w - 0.5, 0.18, 0.3, '#2B3038', 0, { shade: 0.9, surface: 'iron' });
    b.endObject();
    // The shroud: the body colour from the skirt to the waist, the trim colour from the waist over the roof.
    const block = (g: GeoBuilder, z0: number, z1: number, y0: number, y1: number, inset: number, radius: number): void => {
      g.rounded(0, (y0 + y1) / 2, (z0 + z1) / 2, w - inset, y1 - y0, z1 - z0, radius, '#FFFFFF', { shade: 0.95 });
    };
    block(lower, shroud0, engineBack, S.skirtTop, waist, 0, 0.1);
    block(upper, shroud0, engineBack, waist, S.bodyTop, 0.04, S.radius);
    block(lower, tender0, back, S.skirtTop, waist - 0.1, 0.1, 0.1);
    block(upper, tender0, back, waist - 0.1, S.bodyTop - 0.25, 0.14, S.radius);
    // A stripe of the body colour down the middle of the roof, and a low vent where the steam comes out.
    lower.box(0, S.bodyTop + 0.004, (shroud0 + engineBack) / 2 + 0.2, 0.46, 0.012, engineBack - shroud0 - 0.8, '#FFFFFF', 0, { shade: 1 });
    lower.box(0, S.bodyTop - 0.25 + 0.004, (tender0 + back) / 2, 0.46, 0.012, back - tender0 - 0.8, '#FFFFFF', 0, { shade: 1 });
    lower.rounded(0, S.bodyTop + 0.08, shroud0 + 1.2, 0.36, 0.16, 0.8, 0.06, '#FFFFFF', { shade: 0.85 });
    // The nose: a half ellipsoid down the line, its lower half in the body colour and its upper half in the trim.
    const ry = (S.bodyTop - S.skirtTop) / 2;
    const noseY = waist;
    const half = (phiStart: number, scale: number): THREE.BufferGeometry =>
      new THREE.SphereGeometry(1, 28, 14, phiStart, Math.PI, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale((w / 2) * scale, ry * scale, S.nose * scale);
    lower.add(half(Math.PI, 1), '#FFFFFF', 0, noseY, shroud0, 0, 0, 0, { shade: 0.95 });
    upper.add(half(0, 1), '#FFFFFF', 0, noseY, shroud0, 0, 0, 0, { shade: 0.95 });
    for (const [g, material] of [[lower, MATERIALS.livery], [upper, MATERIALS.liveryTrim]] as const) {
      const mesh = new THREE.Mesh(g.build(), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(STATIC_CASTER_LAYER);
      this.group.add(mesh);
    }
  }

  /**
   * Hoists a pennant for each rival beaten: a row of little brass flagpoles along the cab roof's rear edge,
   * right above the nameplate where the camera looks, each flying that rival's livery with a band of their
   * trim, in the order they fell (the league table, worn on the engine). Rebuilt only when the list changes.
   */
  setPennants(colours: { livery: string; trim: string }[]): void {
    const key = colours.map((c) => c.livery).join(',');
    if (key === this.pennantKey) return;
    this.pennantKey = key;
    if (this.pennants) {
      this.group.remove(this.pennants);
      this.pennants.geometry.dispose();
      this.pennants = null;
    }
    if (colours.length === 0) return;
    const b = new GeoBuilder();
    const { from, to } = this.pennantLine;
    colours.forEach((colour, i) => {
      const x = from.x + ((to.x - from.x) * i) / Math.max(1, PENNANT_SLOTS - 1);
      const z = from.z;
      b.object(`pennant ${i}`);
      b.cylinder(x, this.roofTop + PENNANT_POLE / 2, z, 0.012, 0.016, PENNANT_POLE, PALETTE.brass, 6);
      b.sphere(x, this.roofTop + PENNANT_POLE + 0.02, z, 0.026, PALETTE.gold, 1);
      // The flag streams out sideways from the top of the pole: a band of trim at the hoist, the livery beyond.
      const y = this.roofTop + PENNANT_POLE - PENNANT_DROP / 2 - 0.02;
      b.box(x + 0.035, y, z, 0.05, PENNANT_DROP, 0.012, lifted(colour.trim, PENNANT_LIFT * 0.5), 0, { shade: 1 });
      const shape = new THREE.Shape();
      shape.moveTo(0, PENNANT_DROP / 2);
      shape.lineTo(0, -PENNANT_DROP / 2);
      shape.lineTo(PENNANT_WIDTH, 0);
      shape.closePath();
      const flag = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
      flag.translate(0, 0, -0.006);
      b.add(flag, lifted(colour.livery, PENNANT_LIFT), x + 0.06, y, z, 0, 0, 0, { shade: 1 });
    });
    b.endObject();
    const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    mesh.castShadow = true;
    mesh.layers.enable(STATIC_CASTER_LAYER);
    mesh.layers.enable(REFLECT_LAYER);
    this.pennants = mesh;
    this.group.add(mesh);
    CarriageView.shadowEpoch++;
  }

  setName(name: string): void {
    if (name === this.name) return;
    this.name = name;
    const material = this.nameplate.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = signTexture(name, PALETTE.brass, PALETTE.ink, 640, 96);
    material.needsUpdate = true;
    this.nameplate.visible = name.length > 0;
  }

  /** Repaint once the display font has arrived. */
  refreshName(): void {
    const name = this.name;
    this.name = '';
    this.setName(name);
  }

  /** 0 day, 1 night: the headlamp glows (and blooms) and throws its beam at night. */
  setNight(night: number): void {
    this.lampMaterial.color.set('#FFE3A8').multiplyScalar(1 + 3 * night);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 * night;
    (this.pool.material as THREE.MeshBasicMaterial).color.copy(POOL_COLOR).multiplyScalar(0.55 * night);
  }

  /** The model's wheels and rods are part of its body (they used to spin on their own, out of step with the rods). */
  update(_dt: number, _speed: number): void {}
}
