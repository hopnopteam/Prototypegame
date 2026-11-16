import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import { CarriageView } from './CarriageView';
import { RIVALS } from '../config/press';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, LOCOMOTIVE_LENGTH } from './layout';
import { ADD_GLOW, glowTexture, MATERIALS } from './materials';
import { PALETTE } from './palette';
import { modelEntry } from './models/library';
import { signTexture } from './sprites';
import { REFLECT_LAYER } from './Water';

/** How far the headlight's beam dips toward the track (radians). */
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
  private readonly nameplate: THREE.Mesh;
  private name = '';
  /** Pennants of the rivals beaten (session 18): a line from a brass mast on the cab roof to the chimney. */
  private pennants: THREE.Mesh | null = null;
  private pennantKey = '';
  private readonly pennantLine: { from: THREE.Vector3; to: THREE.Vector3 };
  private readonly lampMaterial = new THREE.MeshBasicMaterial({ color: '#FFE3A8' });
  private readonly beam = new THREE.Mesh(BEAM_GEOMETRY, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false }));
  private readonly pool = new THREE.Mesh(POOL_GEOMETRY, new THREE.MeshBasicMaterial({ map: POOL_TEXTURE(), color: 0x000000, ...ADD_GLOW }));

  constructor() {
    const back = -GANGWAY_LENGTH;
    const front = back - LOCOMOTIVE_LENGTH;
    const b = new GeoBuilder();
    // Session 51b (owner: "the engine… very ugly… the tires are all over the place… a model that looks and behaves very
    // well"): Kenney's Train Kit steam locomotive (CC0), blue with gold lining and proper wheels and rods, scaled up
    // uniformly, with the kit's own coal wagon as its tender behind the cab, shortened to fit the locomotive's length.
    const loco = modelEntry('locomotive');
    const s = LOCO_SCALE;
    const locoLength = (loco.max[2] - loco.min[2]) * s;
    const locoMid = front + locoLength / 2;
    b.object('locomotive');
    b.model('locomotive', 0, 0, locoMid, LOCO_TURN, s, s, s, { surface: 'varnish', shade: 0.95 });
    const tender = modelEntry('tender');
    const tenderLength = back - (front + locoLength) - TENDER_GAP;
    const tz = tenderLength / (tender.max[2] - tender.min[2]);
    b.model('tender', 0, 0, back - tenderLength / 2, 0, s * 0.95, s * 0.82, tz, { surface: 'varnish', shade: 0.95 });
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

    this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.nameplate.position.set(0, 0.86, back + 0.03);
    this.nameplate.visible = false;
    this.group.add(this.nameplate);
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
      b.cylinder(x, CAB_ROOF_TOP + PENNANT_POLE / 2, z, 0.012, 0.016, PENNANT_POLE, PALETTE.brass, 6);
      b.sphere(x, CAB_ROOF_TOP + PENNANT_POLE + 0.02, z, 0.026, PALETTE.gold, 1);
      // The flag streams out sideways from the top of the pole: a band of trim at the hoist, the livery beyond.
      const y = CAB_ROOF_TOP + PENNANT_POLE - PENNANT_DROP / 2 - 0.02;
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
