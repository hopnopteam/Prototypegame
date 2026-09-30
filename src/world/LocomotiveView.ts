import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, LOCOMOTIVE_LENGTH } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
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
function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 80, 2, 32, 70, 62);
  g.addColorStop(0, 'rgba(255, 226, 170, 0.9)');
  g.addColorStop(0.5, 'rgba(255, 210, 150, 0.35)');
  g.addColorStop(1, 'rgba(255, 200, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Steam locomotive at the head of the train (top of the screen). Faces -z. Navy, gold and signal red. */
export class LocomotiveView {
  readonly group = new THREE.Group();
  /** World position the smoke puffs come out of. */
  readonly chimneyTop = new THREE.Vector3();
  private readonly wheels: THREE.Mesh[] = [];
  /** The brass nameplate on the tender, facing the train: the player's name for her. */
  private readonly nameplate: THREE.Mesh;
  private name = '';
  private readonly lampMaterial = new THREE.MeshBasicMaterial({ color: '#FFE3A8' });
  private readonly beam = new THREE.Mesh(BEAM_GEOMETRY, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  private readonly pool = new THREE.Mesh(POOL_GEOMETRY, new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));

  constructor() {
    const back = -GANGWAY_LENGTH;
    const front = back - LOCOMOTIVE_LENGTH;
    const b = new GeoBuilder();
    // Boiler, cab and tender wear the train's livery (white here, tinted by the shared material).
    const liv = new GeoBuilder();
    const trim = new GeoBuilder();
    const body = '#FFFFFF';
    const mid = (front + back) / 2;

    // Frame and running board: red valance with a gold line, black chassis.
    b.box(0, 0.42, mid, 2.9, 0.3, LOCOMOTIVE_LENGTH - 0.3, PALETTE.locoBlack);
    b.box(0, FLOOR_Y + 0.02, mid, 3.1, 0.08, LOCOMOTIVE_LENGTH - 0.5, PALETTE.locoRed, 0, { shade: 1 });
    b.box(0, FLOOR_Y + 0.065, mid, 3.12, 0.012, LOCOMOTIVE_LENGTH - 0.52, PALETTE.gold, 0, { shade: 1 });

    // Boiler with gold bands and a dark smokebox.
    const boilerFront = front + 0.8;
    const boilerBack = back - 3.4;
    const boilerLength = boilerBack - boilerFront;
    liv.cylinder(0, 1.55, (boilerFront + boilerBack) / 2, 0.95, 0.95, boilerLength, body, 24, 'z', { shade: 0.75 });
    b.cylinder(0, 1.55, boilerFront - 0.05, 0.98, 0.98, 0.5, PALETTE.smokebox, 24, 'z', { shade: 0.75 });
    b.cylinder(0, 1.55, boilerFront - 0.32, 0.5, 0.5, 0.06, PALETTE.locoBlack, 20, 'z', { shade: 1 });
    for (let i = 1; i <= 3; i++) b.cylinder(0, 1.55, boilerFront + (boilerLength * i) / 4, 0.985, 0.985, 0.07, PALETTE.gold, 24, 'z', { shade: 0.85 });

    // Chimney, dome and whistle.
    const chimneyZ = boilerFront + 0.7;
    b.cylinder(0, 2.75, chimneyZ, 0.26, 0.32, 0.9, PALETTE.locoBlack, 14, 'y', { shade: 0.8 });
    b.cylinder(0, 3.24, chimneyZ, 0.36, 0.28, 0.16, PALETTE.gold, 14, 'y', { shade: 1 });
    b.sphere(0, 2.45, boilerFront + boilerLength * 0.55, 0.38, PALETTE.gold, 2, 0.9);
    b.cylinder(0.25, 2.55, boilerBack - 0.4, 0.06, 0.06, 0.35, PALETTE.gold, 8);

    // Cab: navy with a cream window band and a dark roof.
    const cabFront = boilerBack;
    const cabBack = back - 0.6;
    const cabMid = (cabFront + cabBack) / 2;
    liv.box(0, 1.65, cabMid, 3.0, 2.2, cabBack - cabFront, body, 0, { shade: 0.75 });
    trim.box(0, 2.0, cabMid, 3.03, 0.7, cabBack - cabFront - 0.2, body, 0, { shade: 1 });
    b.box(0, 2.88, cabMid, 3.3, 0.14, cabBack - cabFront + 0.4, PALETTE.navyDark, 0, { shade: 1 });
    b.box(0, 0.95, cabMid, 3.04, 0.12, cabBack - cabFront, PALETTE.gold, 0, { shade: 1 });
    b.box(1.53, 1.3, cabMid, 0.02, 0.26, 0.7, PALETTE.gold, 0, { shade: 1 });
    // Tender end facing the train: navy panel with gold lining, a round window, coal heaped on top.
    liv.box(0, 1.2, back - 0.3, 2.7, 1.3, 0.6, body, 0, { shade: 0.7 });
    b.box(0, 1.2, back - 0.005, 2.5, 1.1, 0.02, PALETTE.navyDark, 0, { shade: 1 });
    liv.box(0, 1.2, back + 0.006, 2.4, 1.0, 0.012, body, 0, { shade: 0.95 });
    b.cylinder(0, 1.35, back + 0.012, 0.22, 0.22, 0.02, PALETTE.gold, 18, 'z', { shade: 1 });
    b.cylinder(0, 1.35, back + 0.02, 0.18, 0.18, 0.02, PALETTE.windowDay, 18, 'z', { shade: 1 });
    b.box(0, 1.87, back - 0.3, 2.5, 0.06, 0.55, PALETTE.gold, 0, { shade: 1 });
    b.box(0, 1.95, back - 0.3, 2.2, 0.14, 0.45, '#3A3840', 0, { pattern: PATTERN.dots, color2: '#26252B', scale: 0.07, shade: 1 });

    // Buffer beam, cowcatcher, buffers.
    b.box(0, 0.62, front + 0.2, 3.0, 0.3, 0.3, PALETTE.locoRed, 0, { shade: 0.9 });
    b.prism(0, 0.2, front - 0.1, 2.6, 0.4, 0.5, PALETTE.locoBlack);
    for (const x of [-1.2, 1.2]) b.cylinder(x, 0.62, front, 0.12, 0.12, 0.3, PALETTE.chrome, 10, 'z');

    const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const livery = new THREE.Mesh(liv.build(), MATERIALS.livery);
    livery.castShadow = true;
    livery.receiveShadow = true;
    this.group.add(livery, new THREE.Mesh(trim.build(), MATERIALS.liveryTrim));

    // Cab windows and the headlamp glow at night.
    const windows = new GeoBuilder();
    for (const x of [-1.52, 1.52]) windows.box(x, 2.0, cabMid, 0.02, 0.5, 0.8, PALETTE.windowDay);
    windows.box(0, 2.1, cabFront - 0.01, 1.8, 0.45, 0.02, PALETTE.windowDay);
    this.group.add(new THREE.Mesh(windows.build(), MATERIALS.windows));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.25, 14).rotateX(Math.PI / 2), this.lampMaterial);
    lamp.position.set(0, 1.55, front + 0.5);
    this.group.add(lamp);
    // The headlight at night: a soft cone of light down the line and a warm pool where it lands on the track.
    this.beam.position.set(0, 1.55, front + 0.35);
    this.beam.rotation.x = HEADLIGHT_TILT;
    this.pool.position.set(0, 0.3, front - 5.2);
    this.group.add(this.beam, this.pool);

    // Driving wheels spin with train speed: red with gold hubs.
    const wheelGeo = new GeoBuilder()
      .cylinder(0, 0, 0, 0.55, 0.55, 0.14, PALETTE.locoRed, 20, 'x', { shade: 0.85 })
      .cylinder(0.02, 0, 0, 0.14, 0.14, 0.16, PALETTE.gold, 12, 'x', { shade: 1 })
      .box(0.05, 0, 0, 0.04, 0.9, 0.08, PALETTE.gold, 0, { shade: 1 })
      .build();
    for (const x of [-1.42, 1.42]) {
      for (let i = 0; i < 3; i++) {
        const wheel = new THREE.Mesh(wheelGeo, MATERIALS.solid);
        wheel.position.set(x, 0.55, boilerFront + 1.4 + i * 1.25);
        if (x < 0) wheel.rotation.y = Math.PI;
        this.group.add(wheel);
        this.wheels.push(wheel);
      }
    }

    this.chimneyTop.set(0, 3.4, chimneyZ);
    this.group.traverse((o) => o.layers.enable(REFLECT_LAYER));

    this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.nameplate.position.set(0, 0.86, back + 0.03);
    this.nameplate.visible = false;
    this.group.add(this.nameplate);
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
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.55 * night;
  }

  update(dt: number, speed: number): void {
    const spin = (speed / 0.55) * dt;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
  }
}
