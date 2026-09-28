import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, LOCOMOTIVE_LENGTH } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

/** Steam locomotive at the head of the train (top of the screen). Faces -z. */
export class LocomotiveView {
  readonly group = new THREE.Group();
  /** World position the smoke puffs come out of. */
  readonly chimneyTop = new THREE.Vector3();
  private readonly wheels: THREE.Mesh[] = [];

  constructor() {
    const back = -GANGWAY_LENGTH;
    const front = back - LOCOMOTIVE_LENGTH;
    const b = new GeoBuilder();
    const g = PALETTE.locoGreen;

    b.box(0, 0.42, (front + back) / 2, 2.9, 0.3, LOCOMOTIVE_LENGTH - 0.3, PALETTE.locoBlack);
    b.box(0, FLOOR_Y + 0.02, (front + back) / 2, 3.1, 0.08, LOCOMOTIVE_LENGTH - 0.5, PALETTE.locoRed);

    // Boiler with brass bands and a dark smokebox.
    const boilerFront = front + 0.8;
    const boilerBack = back - 3.4;
    const boilerLength = boilerBack - boilerFront;
    b.cylinder(0, 1.55, (boilerFront + boilerBack) / 2, 0.95, 0.95, boilerLength, g, 14, 'z');
    b.cylinder(0, 1.55, boilerFront - 0.05, 0.98, 0.98, 0.5, PALETTE.locoBlack, 14, 'z');
    for (let i = 1; i <= 3; i++) b.cylinder(0, 1.55, boilerFront + (boilerLength * i) / 4, 0.99, 0.99, 0.08, PALETTE.brass, 14, 'z');

    // Chimney, dome and whistle.
    const chimneyZ = boilerFront + 0.7;
    b.cylinder(0, 2.75, chimneyZ, 0.26, 0.32, 0.9, PALETTE.locoBlack, 10);
    b.cylinder(0, 3.24, chimneyZ, 0.36, 0.28, 0.16, PALETTE.brass, 10);
    b.sphere(0, 2.45, boilerFront + boilerLength * 0.55, 0.38, PALETTE.brass, 1);
    b.cylinder(0.25, 2.55, boilerBack - 0.4, 0.06, 0.06, 0.35, PALETTE.brass, 6);

    // Cab.
    const cabFront = boilerBack;
    const cabBack = back - 0.6;
    b.box(0, 1.65, (cabFront + cabBack) / 2, 3.0, 2.2, cabBack - cabFront, g);
    b.box(0, 2.85, (cabFront + cabBack) / 2, 3.3, 0.14, cabBack - cabFront + 0.4, PALETTE.locoBlack);
    b.box(0, 0.95, (cabFront + cabBack) / 2, 3.04, 0.12, cabBack - cabFront, PALETTE.brass);
    // Coal bunker.
    b.box(0, 1.2, back - 0.3, 2.6, 1.2, 0.6, PALETTE.locoBlack);
    b.box(0, 1.85, back - 0.3, 2.3, 0.2, 0.5, '#2A2A2A');

    // Cowcatcher and buffer beam.
    b.box(0, 0.62, front + 0.2, 3.0, 0.3, 0.3, PALETTE.locoRed);
    b.prism(0, 0.2, front - 0.1, 2.6, 0.4, 0.5, PALETTE.locoBlack);
    for (const x of [-1.2, 1.2]) b.cylinder(x, 0.62, front, 0.12, 0.12, 0.3, PALETTE.chrome, 8, 'z');

    this.group.add(new THREE.Mesh(b.build(), MATERIALS.solid));

    // Cab windows and the headlamp glow at night.
    const windows = new GeoBuilder();
    for (const x of [-1.51, 1.51]) windows.box(x, 2.0, (cabFront + cabBack) / 2, 0.02, 0.6, 0.9, PALETTE.windowDay);
    windows.box(0, 2.1, cabFront - 0.01, 1.8, 0.5, 0.02, PALETTE.windowDay);
    this.group.add(new THREE.Mesh(windows.build(), MATERIALS.windows));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.25, 10).rotateX(Math.PI / 2), MATERIALS.lamp);
    lamp.position.set(0, 1.55, front + 0.5);
    this.group.add(lamp);

    // Driving wheels spin with train speed.
    const wheelGeo = new GeoBuilder().cylinder(0, 0, 0, 0.55, 0.55, 0.14, PALETTE.locoRed, 12, 'x').box(0, 0, 0, 0.16, 0.9, 0.08, PALETTE.brass).build();
    for (const x of [-1.42, 1.42]) {
      for (let i = 0; i < 3; i++) {
        const wheel = new THREE.Mesh(wheelGeo, MATERIALS.solid);
        wheel.position.set(x, 0.55, boilerFront + 1.4 + i * 1.25);
        this.group.add(wheel);
        this.wheels.push(wheel);
      }
    }

    this.chimneyTop.set(0, 3.4, chimneyZ);
  }

  update(dt: number, speed: number): void {
    const spin = (speed / 0.55) * dt;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
  }
}
