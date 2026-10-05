import * as THREE from 'three';
import type { Rect } from '../core/types';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';

const GINGER = '#D9894A';
const GINGER_DARK = '#B86A32';
const CREAM = '#F3E3C8';
const INK = '#2A2433';
/** How close the conductor comes before the cat lifts its head and watches them. */
const WATCH_RADIUS = 2.6;
/** Turning speed of the head (radians a second) and how far it turns. */
const HEAD_TURN_RATE = 3;
const HEAD_TURN_MAX = 1.1;

/**
 * The lobby cat (session 18, owner: "make the whole world quite lived in… actually alive"): a ginger cat
 * curled up on the reception desk between the bell and the ledger. It breathes, its tail swishes, and it
 * lifts its head to watch the conductor go by. Three small meshes on the shared solid material; it only
 * rests on the desk (the clipping audit holds it there), so it never gets in anyone's way.
 */
export class TrainCat {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Group;
  private readonly tail: THREE.Mesh;
  private time = Math.random() * 10;
  private yaw = 0;
  private lift = 0;

  constructor() {
    const body = new GeoBuilder();
    body.object('cat');
    // Curled up like a loaf: a round back, a cream chest, the paws tucked under.
    body.add(new THREE.SphereGeometry(0.13, 12, 9).scale(0.95, 0.62, 1.25), GINGER, 0, 0.075, 0, 0, 0, 0, { shade: 0.85, surface: 'fabric' });
    body.add(new THREE.SphereGeometry(0.06, 8, 6).scale(1.2, 0.8, 0.8), CREAM, 0, 0.05, -0.12, 0, 0, 0, { shade: 0.9, surface: 'fabric' });
    for (const x of [-0.045, 0.045]) body.add(new THREE.SphereGeometry(0.028, 6, 5).scale(1, 0.7, 1.4), CREAM, x, 0.02, -0.17, 0, 0, 0, { shade: 1 });
    // Two darker stripes across the back.
    for (const z of [-0.02, 0.06]) body.add(new THREE.TorusGeometry(0.118, 0.012, 4, 12, Math.PI * 0.9).rotateY(Math.PI / 2).scale(0.95, 0.62, 1), GINGER_DARK, 0, 0.075, z, 0, 0, 0.05, { shade: 1 });
    body.endObject();
    this.body = new THREE.Mesh(body.build(), MATERIALS.solid);
    this.body.castShadow = true;

    const head = new GeoBuilder();
    head.object('cat');
    head.add(new THREE.SphereGeometry(0.075, 10, 8).scale(1.1, 0.95, 1), GINGER, 0, 0, 0, 0, 0, 0, { shade: 0.9, surface: 'fabric' });
    head.add(new THREE.SphereGeometry(0.035, 6, 5).scale(1.3, 0.8, 0.9), CREAM, 0, -0.025, -0.06, 0, 0, 0, { shade: 1 });
    for (const x of [-0.045, 0.045]) {
      head.add(new THREE.ConeGeometry(0.03, 0.06, 4).rotateY(Math.PI / 4), GINGER, x, 0.07, 0.005, 0, 0, x > 0 ? -0.25 : 0.25, { shade: 0.9 });
      head.add(new THREE.BoxGeometry(0.022, 0.008, 0.006), INK, x * 0.72, 0.012, -0.072, 0, 0, x > 0 ? 0.25 : -0.25, { shade: 1 });
    }
    head.add(new THREE.SphereGeometry(0.009, 5, 4), '#D07A86', 0, -0.012, -0.083, 0, 0, 0, { shade: 1 });
    head.endObject();
    this.head = new THREE.Group();
    const headMesh = new THREE.Mesh(head.build(), MATERIALS.solid);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.head.position.set(0, 0.11, -0.12);

    const tail = new GeoBuilder();
    tail.object('cat');
    // The tail curls round the cat's side toward its paws.
    tail.add(new THREE.TorusGeometry(0.15, 0.022, 5, 14, Math.PI * 0.85).rotateX(Math.PI / 2), GINGER, 0, 0, 0, 0, 0, 0, { shade: 0.85, surface: 'fabric' });
    tail.add(new THREE.SphereGeometry(0.026, 6, 5), GINGER_DARK, 0.15, 0, 0, 0, 0, 0, { shade: 1 });
    tail.endObject();
    this.tail = new THREE.Mesh(tail.build(), MATERIALS.solid);
    this.tail.position.set(0, 0.025, 0.02);
    this.tail.rotation.y = -0.4;

    this.group.add(this.body, this.head, this.tail);
    this.group.userData.object = 'cat';
  }

  /** Curls up on the desk's top, between the bell (front end) and the ledger, facing into the lobby. */
  place(desk: Rect, top: number): void {
    const cx = (desk.x0 + desk.x1) / 2;
    this.group.position.set(cx - 0.02, top, desk.z0 + 0.62);
    this.group.rotation.y = Math.PI / 2;
  }

  /**
   * Breathes, swishes its tail and watches the conductor while they are near (`dx`, `dz` from the cat in
   * the carriage's frame, or null when they are not in this carriage). Returns true while it is watching.
   */
  update(dt: number, dx: number | null, dz: number | null): boolean {
    this.time += dt;
    const t = this.time;
    this.body.scale.y = 1 + Math.sin(t * 1.6) * 0.035;
    this.tail.rotation.y = -0.4 + Math.sin(t * 0.9) * 0.18 + Math.max(0, Math.sin(t * 0.23)) * Math.sin(t * 5) * 0.12;
    const near = dx !== null && dz !== null && dx * dx + dz * dz < WATCH_RADIUS * WATCH_RADIUS;
    // The head is modelled facing -z; the group is turned to face the lobby (+x), so local angles are relative to that.
    let want = 0;
    if (near && dx !== null && dz !== null) {
      const angle = Math.atan2(-dx, -dz) - this.group.rotation.y;
      const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
      want = Math.max(-HEAD_TURN_MAX, Math.min(HEAD_TURN_MAX, wrapped));
    }
    const step = HEAD_TURN_RATE * dt;
    this.yaw += Math.max(-step, Math.min(step, want - this.yaw));
    this.lift += ((near ? 1 : 0) - this.lift) * Math.min(1, dt * 4);
    this.head.rotation.set(-0.35 + this.lift * 0.45, this.yaw, Math.sin(t * 0.5) * 0.05 * (1 - this.lift));
    this.head.position.y = 0.09 + this.lift * 0.03;
    return near;
  }
}
