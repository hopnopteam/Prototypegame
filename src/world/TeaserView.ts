import * as THREE from 'three';
import { buildCarriageRoof, FLOOR_Y, TARP_TIE_Z, tarpProfile } from './CarriageView';
import { GeoBuilder } from './geo';
import { CARRIAGE_LENGTH, EXTERIOR_WALL_HEIGHT, HALF_WIDTH } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { STATIC_CASTER_LAYER } from './Lighting';
import { WORLD_UI_LAYER } from './CameraRig';
import type { Particles } from './Particles';

/** The ribbon: its colour, a darker shade for the bow's insides, its width and how far it stands off the canvas. */
const RIBBON = '#D7263D';
const RIBBON_DARK = '#A3162B';
const RIBBON_WIDTH = 0.42;
const RIBBON_OFF = 0.05;
/** The cross band, the bow and the medallion sit on the first rope tie (no sag there), at the end the train sees. */
const BAND_Z = TARP_TIE_Z[0];
/** Sparkles rise off the front of the canvas, the part in view from the coupling platform (metres from its front). */
const SPARKLE_REACH = 6;
/**
 * The "?" medallion: its size, how high it floats over the canvas, and where: over the camera's side of the canvas,
 * a little behind the bow (the camera looks across the train from that side, so over the ridge it sat off screen).
 */
const BADGE_SIZE = 1.15;
const BADGE_LIFT = 0.95;
const BADGE_X = 1.25;
const BADGE_BACK = 0.9;
/** Sparkles a second off the canvas: waiting, and once the coupling is affordable. */
const SPARKLES_IDLE = 2.2;
const SPARKLES_READY = 7;
/** The canvas shivers now and then, as if something inside were eager to get out (seconds between, and how long). */
const SHIVER_EVERY = 4.2;
const SHIVER_EVERY_READY = 2.1;
const SHIVER_SECONDS = 0.7;

/**
 * Phase 1 (owner: "the next carriage is already hitched behind the train under a tarp"): the next carriage waiting
 * behind the train, never walkable, saying nothing about what is under the tarp (every carriage is a surprise,
 * session 29). Session 64 (owner: "the next carriage teaser isn't at all exciting… we need to know that something is
 * awaiting"): it is wrapped like a present: a crimson ribbon round it both ways with a big bow on top, warm light
 * spilling from under the canvas's hem, a gold "?" medallion bobbing over it, sparkles rising off it, and now and then
 * the whole wrapping shivers. Once the coupling can be bought it all quickens and brightens. Visual only (the sparkles
 * use the particles' own generator).
 */
export class TeaserView {
  readonly group = new THREE.Group();
  /** The canvas, the ribbon and the bow: what shivers. */
  private readonly cover = new THREE.Group();
  private readonly tarp: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly glowMaterial = new THREE.MeshBasicMaterial({ color: '#FFC86A', toneMapped: false, fog: false });
  private readonly badge: THREE.Sprite;
  private time = 0;
  private nextShiver = SHIVER_EVERY;
  private shiverLeft = 0;
  private sparkleDebt = 0;
  private sparkleIndex = 0;
  private readonly top: number;

  constructor() {
    const body = new GeoBuilder();
    const top = FLOOR_Y + EXTERIOR_WALL_HEIGHT;
    const zc = CARRIAGE_LENGTH / 2;
    // The sides and ends (the tarp's hems hang over their tops), in the train's livery.
    body.box(0, (FLOOR_Y + top) / 2, zc, HALF_WIDTH * 2 - 0.04, top - FLOOR_Y, CARRIAGE_LENGTH - 0.04, '#FFFFFF', 0, { shade: 0.82 });
    const frame = new GeoBuilder();
    // The underframe and two bogies with their wheels.
    frame.box(0, FLOOR_Y - 0.12, zc, HALF_WIDTH * 2 - 0.3, 0.2, CARRIAGE_LENGTH - 0.6, '#2E3138', 0, { shade: 0.8 });
    for (const bz of [2.6, CARRIAGE_LENGTH - 2.6]) {
      frame.box(0, 0.3, bz, 1.9, 0.18, 2.2, '#3A3D44', 0, { shade: 0.8 });
      for (const dz of [-0.7, 0.7]) for (const x of [-1.0, 1.0]) frame.cylinder(x, 0.26, bz + dz, 0.26, 0.26, 0.1, PALETTE.iron, 12, 'x', { shade: 0.85 });
    }
    // The buffers and the coupling at its front, reaching for the train's.
    for (const x of [-1.3, 1.3]) {
      frame.cylinder(x, 0.36, -0.06, 0.09, 0.09, 0.12, PALETTE.chrome, 12, 'z', { shade: 1, surface: 'iron' });
      frame.cylinder(x, 0.36, -0.135, 0.13, 0.13, 0.03, PALETTE.chrome, 14, 'z', { shade: 1, surface: 'iron' });
    }
    frame.box(0, 0.34, 0.04, HALF_WIDTH * 2 - 0.3, 0.14, 0.1, '#A8352C', 0, { shade: 0.9, surface: 'paint' });
    const bodyMesh = new THREE.Mesh(body.build(), MATERIALS.livery);
    const frameMesh = new THREE.Mesh(frame.build(), MATERIALS.solid);
    this.tarp = buildCarriageRoof();
    const ribbon = new THREE.Mesh(buildRibbon(), MATERIALS.solid);
    for (const mesh of [bodyMesh, frameMesh, this.tarp, ribbon]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(STATIC_CASTER_LAYER);
    }
    // The cover shivers about the carriage's middle, at the top of its walls.
    this.cover.position.set(0, top, zc);
    for (const m of [this.tarp, ribbon]) {
      m.position.set(0, -top, -zc);
      this.cover.add(m);
    }
    // Warm light spilling out from under the canvas's hem along both sides, as if the carriage were lit and ready.
    const ye = top + 0.06;
    const glowGeo = new GeoBuilder();
    for (const s of [-1, 1]) glowGeo.box(s * (HALF_WIDTH + 0.005), ye - 0.52, zc, 0.02, 0.07, CARRIAGE_LENGTH - 0.5, '#FFFFFF', 0, { shade: 1 });
    this.glow = new THREE.Mesh(glowGeo.build(), this.glowMaterial);
    // The "?" medallion over the bow (world UI: it hides with the rest in the intro and in clean shots).
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), transparent: true, depthWrite: false }));
    this.badge.scale.set(BADGE_SIZE, BADGE_SIZE, 1);
    this.top = ye + 0.42;
    this.badge.position.set(BADGE_X, this.top + BADGE_LIFT, BAND_Z + BADGE_BACK);
    this.badge.layers.set(WORLD_UI_LAYER);
    this.badge.renderOrder = 5;
    this.group.add(bodyMesh, frameMesh, this.cover, this.glow, this.badge);
    this.group.visible = false;
  }

  /** Every frame while it is in view: the bob, the glow's breath, the sparkles and the shiver. */
  update(dt: number, ready: boolean, particles: Particles | null): void {
    if (!this.group.visible) return;
    this.time += dt;
    const t = this.time;
    // The medallion bobs and turns like a coin; quicker and bigger once the coupling can be bought.
    const bob = ready ? 0.16 : 0.1;
    this.badge.position.y = this.top + BADGE_LIFT + Math.sin(t * (ready ? 3.4 : 2.1)) * bob;
    const turn = Math.cos(t * (ready ? 2.6 : 1.4));
    const pulse = ready ? 1 + 0.08 * Math.sin(t * 6) : 1;
    this.badge.scale.set(BADGE_SIZE * Math.max(0.12, Math.abs(turn)) * pulse, BADGE_SIZE * pulse, 1);
    // The light under the hem breathes.
    const breath = 0.5 + 0.5 * Math.sin(t * (ready ? 4 : 2));
    const k = ready ? 0.75 + 0.45 * breath : 0.45 + 0.3 * breath;
    this.glowMaterial.color.setRGB(1.0 * k, 0.78 * k, 0.42 * k);
    // Sparkles rise off the canvas at spots spread evenly along it (a fixed sequence: no randomness spent).
    if (particles) {
      this.sparkleDebt += dt * (ready ? SPARKLES_READY : SPARKLES_IDLE);
      while (this.sparkleDebt >= 1) {
        this.sparkleDebt -= 1;
        const i = this.sparkleIndex++;
        const along = ((i * 0.6180339887) % 1) * SPARKLE_REACH + 0.3;
        const across = Math.sin(i * 2.399) * (HALF_WIDTH - 0.3);
        tmp.set(across, this.top + 0.05, along);
        this.group.localToWorld(tmp);
        particles.emit('sparkle', tmp.x, tmp.y, tmp.z, 1, 0.1);
      }
    }
    // The wrapping shivers now and then.
    this.nextShiver -= dt;
    if (this.nextShiver <= 0) {
      this.nextShiver = ready ? SHIVER_EVERY_READY : SHIVER_EVERY;
      this.shiverLeft = SHIVER_SECONDS;
    }
    if (this.shiverLeft > 0) {
      this.shiverLeft = Math.max(0, this.shiverLeft - dt);
      const p = 1 - this.shiverLeft / SHIVER_SECONDS;
      const fade = Math.sin(p * Math.PI);
      const a = (ready ? 1.4 : 1) * fade;
      this.cover.rotation.z = Math.sin(p * 38) * 0.012 * a;
      this.cover.scale.set(1 + 0.012 * a * Math.sin(p * 26), 1 + 0.035 * a * Math.abs(Math.sin(p * 19)), 1);
    } else if (this.cover.rotation.z !== 0 || this.cover.scale.y !== 1) {
      this.cover.rotation.z = 0;
      this.cover.scale.set(1, 1, 1);
    }
  }
}

const tmp = new THREE.Vector3();

/**
 * The ribbon round the canvas: a band across it over the middle rope tie, a band along its ridge and down both end
 * flaps, and a bow where they cross (two loops, a knot, two tails), all standing just off the canvas.
 */
function buildRibbon(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const style = { shade: 1, surface: 'velvet' as const };
  const ye = FLOOR_Y + EXTERIOR_WALL_HEIGHT + 0.06;
  const prof = tarpProfile();
  // Outward normals of the cross-section, so the band stands evenly off the canvas all the way round.
  const off = prof.map((p, i) => {
    const a = prof[Math.max(0, i - 1)];
    const c = prof[Math.min(prof.length - 1, i + 1)];
    let nx = c.y - a.y;
    let ny = -(c.x - a.x);
    if (ny < 0 || (Math.abs(ny) < 1e-6 && nx * p.x < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const l = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / l) * RIBBON_OFF, y: p.y + (ny / l) * RIBBON_OFF };
  });
  const band: number[] = [];
  const z0 = BAND_Z - RIBBON_WIDTH / 2;
  const z1 = BAND_Z + RIBBON_WIDTH / 2;
  for (let i = 0; i < off.length - 1; i++) {
    const a = off[i];
    const c = off[i + 1];
    band.push(a.x, a.y, z1, c.x, c.y, z0, a.x, a.y, z0, a.x, a.y, z1, c.x, c.y, z1, c.x, c.y, z0);
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(band, 3));
  bandGeo.computeVertexNormals();
  b.object('teaser:ribbon');
  b.add(bandGeo, RIBBON, 0, 0, 0, 0, 0, 0, style);
  // Along the ridge (the canvas's crown) and down over both end flaps to the hem.
  const ridge = ye + 0.42 + RIBBON_OFF;
  const zs = -0.16 - RIBBON_OFF;
  const ze = CARRIAGE_LENGTH + 0.16 + RIBBON_OFF;
  b.box(0, ridge, (zs + ze) / 2, RIBBON_WIDTH, 0.02, ze - zs, RIBBON, 0, style);
  for (const z of [zs, ze]) b.box(0, (ridge + ye - 0.46) / 2, z, RIBBON_WIDTH, ridge - (ye - 0.46), 0.02, RIBBON, 0, style);
  // The bow: two loops leaning out from a knot, and two tails trailing down the canvas.
  const by = ridge + 0.06;
  for (const s of [-1, 1]) {
    b.add(new THREE.TorusGeometry(0.34, 0.08, 10, 24).scale(1, 0.62, 0.45), RIBBON, s * 0.33, by + 0.16, BAND_Z, 0, 0, s * 0.42, style);
    b.add(new THREE.TorusGeometry(0.24, 0.05, 8, 18).scale(1, 0.55, 0.4), RIBBON_DARK, s * 0.33, by + 0.15, BAND_Z, 0, 0, s * 0.42, style);
    b.add(new THREE.BoxGeometry(0.2, 0.02, 0.62), RIBBON, s * 0.2, by - 0.02, BAND_Z + s * 0.32, 0.18 * s, s * 0.5, 0, style);
  }
  b.add(new THREE.SphereGeometry(0.15, 14, 10).scale(1, 0.85, 0.9), RIBBON_DARK, 0, by + 0.08, BAND_Z, 0, 0, 0, style);
  b.endObject();
  return b.build();
}

/** The gold "?" medallion: a coin with a rim, a white question mark outlined in ink, drawn once. */
function badgeTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r);
  grad.addColorStop(0, '#FFF3B0');
  grad.addColorStop(0.55, '#FFC93A');
  grad.addColorStop(1, '#D9891A');
  g.fillStyle = '#2A1E35';
  g.beginPath();
  g.arc(r, r, r - 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 16, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(r, r, r - 30, Math.PI * 1.05, Math.PI * 1.65);
  g.stroke();
  g.font = `900 ${Math.round(size * 0.62)}px Jost, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 18;
  g.strokeStyle = '#2A1E35';
  g.strokeText('?', r, r + size * 0.03);
  g.fillStyle = '#FFFFFF';
  g.fillText('?', r, r + size * 0.03);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
