import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Session 51b: the icons with no free model that fits (a broom, a key, a ticket, a film reel…) built in three.js in
 * the same soft, rounded, chunky manner as the Tiny Treats models, so every icon over a guest or a job reads as one
 * set: rendered with the same lights and the same ink outline by the icon render page (src/iconrender.ts). Each
 * builder returns a group about one unit tall, its base on y = 0. Used only by the render page, never in the game.
 */
type Builder = () => THREE.Group;

function mat(color: string, rough = 0.55, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function rbox(w: number, h: number, d: number, r: number, color: string, x = 0, y = 0, z = 0, rough = 0.55): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)), mat(color, rough));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, rough = 0.5, metal = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 40), mat(color, rough, metal));
  m.position.set(x, y, z);
  return m;
}
function torus(r: number, t: number, color: string, arc = Math.PI * 2, rough = 0.5, metal = 0): THREE.Mesh {
  return new THREE.Mesh(new THREE.TorusGeometry(r, t, 16, 48, arc), mat(color, rough, metal));
}
function sphere(r: number, color: string, x = 0, y = 0, z = 0, sy = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat(color));
  m.position.set(x, y, z);
  m.scale.y = sy;
  return m;
}
function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts) g.add(p);
  return g;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

const INK = '#2B2230';
const GOLD = '#E8B44A';
const BRASS = '#C9973F';
const CREAM = '#FBF3E2';

/** A cup on its saucer: `drink` is the colour in the cup, `foam` a latte's heart on top. */
function cupOnSaucer(drink: string, foam?: string): THREE.Group {
  const g = group(
    cyl(0.62, 0.55, 0.07, CREAM, 0, 0.035, 0),
    cyl(0.45, 0.32, 0.5, CREAM, 0, 0.32, 0),
    cyl(0.4, 0.4, 0.02, drink, 0, 0.56, 0),
    at(torus(0.16, 0.055, CREAM, Math.PI * 1.3), 0.47, 0.34, 0, 0, 0, -Math.PI * 0.65),
  );
  if (foam) {
    // A heart of milk foam: two discs and a point.
    g.add(sphere(0.1, foam, -0.07, 0.575, -0.03, 0.15), sphere(0.1, foam, 0.07, 0.575, -0.03, 0.15));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.02, 3), mat(foam));
    g.add(at(tip, 0, 0.575, 0.09, 0, Math.PI, 0));
  }
  return g;
}

export const ICON_BUILDERS: Record<string, Builder> = {
  coffee: () => cupOnSaucer('#4A2A1C'),
  latte: () => cupOnSaucer('#C8925E', '#FFF6E6'),
  broom: () => {
    const fan = new THREE.Shape();
    fan.moveTo(-0.16, 0.5); fan.lineTo(0.16, 0.5); fan.lineTo(0.42, 0); fan.lineTo(-0.42, 0); fan.closePath();
    const bristles = new THREE.Mesh(new THREE.ExtrudeGeometry(fan, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }), mat('#E8C35A', 0.85));
    bristles.position.z = -0.08;
    const head = group(
      bristles,
      rbox(0.4, 0.14, 0.26, 0.06, '#C83B3B', 0, 0.54, 0),
      ...[-0.22, -0.08, 0.08, 0.22].map((dx) => at(rbox(0.035, 0.4, 0.04, 0.015, '#C9A23A'), dx, 0.22, 0.13, 0, 0, -dx * 0.9)),
      cyl(0.045, 0.045, 1.0, '#B8834F', 0, 1.1, 0),
    );
    return group(at(head, 0, 0.05, 0, 0, 0, -0.28));
  },
  key: () => {
    const bow = at(torus(0.24, 0.08, GOLD, Math.PI * 2, 0.3, 0.6), -0.45, 0.5, 0, 0, 0, 0);
    const shaft = at(cyl(0.06, 0.06, 0.9, GOLD, 0, 0, 0, 0.3, 0.6), 0.2, 0.5, 0, 0, 0, Math.PI / 2);
    const bit1 = rbox(0.1, 0.22, 0.1, 0.03, GOLD, 0.5, 0.38, 0, 0.3);
    const bit2 = rbox(0.1, 0.16, 0.1, 0.03, GOLD, 0.32, 0.41, 0, 0.3);
    const tag = at(rbox(0.3, 0.42, 0.06, 0.06, '#D44A4A'), -0.72, 0.18, 0.05, 0, 0, 0.35);
    return group(bow, shaft, bit1, bit2, tag);
  },
  ticket: () => {
    // Owner (twice: "the train ticket logo is a little weird"): one plain, bold shape that reads at a glance. A golden
    // ticket cut in one piece, a semicircle bitten out of each long edge where the stub tears off, a dotted tear line
    // between the bites, a big red star on the ticket and a single red bar on the stub. Nothing small to decode.
    const W = 1.42;
    const H = 0.8;
    const R = 0.1;
    const bite = 0.11;
    const split = W / 2 - 0.4;
    const depth = 0.07;
    const s = new THREE.Shape();
    const x0 = -W / 2;
    const x1 = W / 2;
    const y0 = -H / 2;
    const y1 = H / 2;
    s.moveTo(x0 + R, y0);
    s.lineTo(split - bite, y0);
    s.absarc(split, y0, bite, Math.PI, 0, true);
    s.lineTo(x1 - R, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + R);
    s.lineTo(x1, y1 - R);
    s.quadraticCurveTo(x1, y1, x1 - R, y1);
    s.lineTo(split + bite, y1);
    s.absarc(split, y1, bite, 0, Math.PI, true);
    s.lineTo(x0 + R, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - R);
    s.lineTo(x0, y0 + R);
    s.quadraticCurveTo(x0, y0, x0 + R, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 20 });
    g.translate(0, 0, -depth / 2);
    const card = new THREE.Mesh(g, mat('#F4C24A', 0.5));
    const top = depth / 2 + 0.026;
    // A five-pointed star, extruded, in the middle of the ticket.
    const star = new THREE.Shape();
    const cx = (x0 + split) / 2;
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.105 : 0.25;
      const px = cx + Math.cos(a) * r;
      const py = Math.sin(a) * r - 0.01;
      if (i) star.lineTo(px, py);
      else star.moveTo(px, py);
    }
    star.closePath();
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    sg.translate(0, 0, top - 0.012);
    const starMesh = new THREE.Mesh(sg, mat('#D8483B', 0.45));
    const perfs = new THREE.Group();
    for (let i = 0; i < 4; i++) perfs.add(at(cyl(0.028, 0.028, 0.02, '#B0802E'), split, y0 + bite + 0.09 + (i * (H - 2 * bite - 0.18)) / 3, top - 0.01, Math.PI / 2, 0, 0));
    const bar = rbox(0.09, 0.42, 0.03, 0.04, '#D8483B', (split + x1) / 2, 0, top - 0.004);
    const t = group(card, starMesh, perfs, bar);
    return group(at(t, 0, 0.45, 0, -0.38, 0.22, 0.12));
  },
  shoe: () => {
    const sole = rbox(1.08, 0.08, 0.42, 0.04, '#3A2A22', 0, 0.04, 0);
    const toe = sphere(0.24, '#8A4A2A', 0.3, 0.2, 0, 0.75);
    toe.scale.set(1.5, 0.75, 0.85);
    const body = rbox(0.62, 0.34, 0.38, 0.14, '#8A4A2A', -0.18, 0.24, 0);
    const opening = sphere(0.14, '#3A2218', -0.18, 0.4, 0, 0.25);
    opening.scale.set(1.5, 0.25, 0.95);
    const heel = rbox(0.24, 0.14, 0.36, 0.04, '#3A2A22', -0.38, 0.07, 0);
    const lace = rbox(0.18, 0.05, 0.22, 0.02, CREAM, 0.12, 0.34, 0);
    const shine = sphere(0.05, '#FFFFFF', 0.36, 0.33, 0.12, 0.6);
    return group(sole, toe, body, opening, heel, lace, shine);
  },
  film: () => {
    const reel = at(cyl(0.5, 0.5, 0.18, '#3D4552', 0, 0, 0, 0.35, 0.4), 0, 0.55, 0, Math.PI / 2, 0, 0);
    const g = group(reel);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(at(cyl(0.1, 0.1, 0.2, '#1E232B'), Math.cos(a) * 0.27, 0.55 + Math.sin(a) * 0.27, 0.01, Math.PI / 2, 0, 0));
    }
    g.add(at(cyl(0.08, 0.08, 0.22, '#C9CDD2'), 0, 0.55, 0, Math.PI / 2, 0, 0));
    g.add(rbox(0.9, 0.1, 0.12, 0.03, '#6B4A2A', 0.35, 0.05, 0.1));
    return g;
  },
  wipe: () => {
    const bottle = cyl(0.2, 0.22, 0.6, '#5DB6E0', 0.1, 0.3, 0, 0.3);
    const neck = cyl(0.08, 0.12, 0.14, CREAM, 0.1, 0.67, 0);
    const head = rbox(0.34, 0.14, 0.14, 0.05, '#F2F2F2', 0.2, 0.78, 0);
    const trigger = at(rbox(0.08, 0.2, 0.1, 0.03, '#E05A5A'), 0.05, 0.66, 0, 0, 0, 0.3);
    const sponge = rbox(0.42, 0.2, 0.3, 0.07, '#F2CF4A', -0.38, 0.1, 0.12);
    const scrub = rbox(0.42, 0.06, 0.3, 0.03, '#4FA35A', -0.38, 0.23, 0.12);
    return group(bottle, neck, head, trigger, sponge, scrub);
  },
  bell: () => group(
    cyl(0.6, 0.62, 0.08, '#6B4A2A', 0, 0.04, 0),
    new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(GOLD, 0.25, 0.7)),
    sphere(0.08, GOLD, 0, 0.53, 0),
  ),
  luggage: () => group(
    rbox(1.0, 0.75, 0.42, 0.1, '#A0522D', 0, 0.42, 0),
    rbox(0.08, 0.77, 0.44, 0.03, '#E8C35A', -0.28, 0.42, 0),
    rbox(0.08, 0.77, 0.44, 0.03, '#E8C35A', 0.28, 0.42, 0),
    at(torus(0.14, 0.04, '#3A2A22', Math.PI), 0, 0.82, 0),
    at(rbox(0.22, 0.14, 0.04, 0.03, CREAM), 0.36, 0.62, 0.23, 0, 0, 0.2),
    cyl(0.06, 0.06, 0.06, '#2B2B2B', -0.4, 0.04, 0.15), cyl(0.06, 0.06, 0.06, '#2B2B2B', 0.4, 0.04, 0.15),
  ),
  crate: () => {
    const g = group(rbox(0.95, 0.7, 0.75, 0.04, '#C99456', 0, 0.35, 0));
    for (const y of [0.12, 0.58]) g.add(rbox(0.97, 0.1, 0.77, 0.02, '#A87544', 0, y, 0));
    g.add(at(rbox(1.15, 0.08, 0.04, 0.02, '#A87544'), 0, 0.35, 0.385, 0, 0, 0.55));
    g.add(rbox(0.4, 0.12, 0.3, 0.05, '#7FC3E6', 0.15, 0.76, 0), cyl(0.12, 0.12, 0.3, CREAM, -0.22, 0.8, 0));
    g.children[g.children.length - 1].rotation.z = Math.PI / 2;
    return g;
  },
  roll: () => group(
    at(cyl(0.38, 0.38, 0.55, '#FAF7F0', 0, 0, 0, 0.8), 0, 0.38, 0, 0, 0, Math.PI / 2),
    at(cyl(0.12, 0.12, 0.56, '#B8834F'), 0, 0.38, 0, 0, 0, Math.PI / 2),
    at(rbox(0.5, 0.5, 0.02, 0.01, '#FAF7F0', 0.6), 0.25, 0.12, 0.3, -1.2, 0, 0),
  ),
  popcorn: () => {
    const box = cyl(0.42, 0.3, 0.75, '#D9433F', 0, 0.375, 0);
    const g = group(box);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(rbox(0.07, 0.76, 0.02, 0.01, CREAM, Math.cos(a) * 0.36, 0.38, Math.sin(a) * 0.36));
      g.children[g.children.length - 1].rotation.y = -a;
    }
    const puffs: [number, number, number][] = [[0, 0.88, 0], [0.18, 0.84, 0.1], [-0.18, 0.83, 0.08], [0.1, 0.84, -0.18], [-0.12, 0.82, -0.16], [0, 1.0, 0.04], [0.14, 0.96, -0.05], [-0.13, 0.95, 0.02]];
    for (const [x, y, z] of puffs) g.add(sphere(0.14, '#FFF1C9', x, y, z));
    return g;
  },
  newspaper: () => {
    const page = rbox(1.0, 0.07, 0.72, 0.03, '#F3EEE2', 0, 0.05, 0);
    const fold = rbox(1.0, 0.07, 0.72, 0.03, '#ECE6D8', 0.02, 0.12, -0.02);
    const head = rbox(0.82, 0.02, 0.1, 0.01, INK, 0.02, 0.165, -0.24);
    const photo = rbox(0.34, 0.02, 0.3, 0.01, '#7FA9C8', -0.2, 0.165, 0.08);
    const lines = [0.02, 0.1, 0.18].map((dz) => rbox(0.36, 0.02, 0.04, 0.01, '#8C8577', 0.22, 0.165, dz));
    return group(at(group(page, fold, head, photo, ...lines), 0, 0.3, 0, 1.0, -0.2, 0));
  },
  news: () => ICON_BUILDERS.newspaper(),
  snack: () => group(
    rbox(0.66, 0.86, 0.24, 0.12, '#F2C14E', 0, 0.47, 0),
    rbox(0.68, 0.07, 0.12, 0.02, '#D9A23A', 0, 0.91, 0),
    rbox(0.68, 0.07, 0.12, 0.02, '#D9A23A', 0, 0.05, 0),
    at(cyl(0.2, 0.2, 0.04, '#D9433F'), 0, 0.5, 0.12, Math.PI / 2, 0, 0),
    at(cyl(0.11, 0.11, 0.045, '#F5D27A'), 0, 0.5, 0.13, Math.PI / 2, 0, 0),
  ),
  turndown: () => group(
    rbox(1.0, 0.3, 0.7, 0.15, '#FBF8F2', 0, 0.15, 0),
    at(rbox(0.36, 0.08, 0.28, 0.04, '#6B3A22'), 0.05, 0.34, 0.05, 0, 0.4, 0),
    at(rbox(0.38, 0.03, 0.08, 0.01, GOLD), 0.05, 0.39, 0.05, 0, 0.4, 0),
  ),
  bin: () => {
    const g = group(cyl(0.42, 0.34, 0.85, '#7B8A96', 0, 0.425, 0, 0.4, 0.3), cyl(0.45, 0.45, 0.06, '#5E6B76', 0, 0.86, 0, 0.4, 0.3));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(rbox(0.04, 0.6, 0.02, 0.01, '#5E6B76', Math.cos(a) * 0.4, 0.43, Math.sin(a) * 0.4));
    }
    g.add(sphere(0.14, CREAM, 0.05, 0.9, 0.05, 0.8));
    return g;
  },
  binoculars: () => group(
    at(cyl(0.2, 0.22, 0.6, '#3F4E66'), -0.24, 0.25, 0, Math.PI / 2, 0, 0),
    at(cyl(0.2, 0.22, 0.6, '#3F4E66'), 0.24, 0.25, 0, Math.PI / 2, 0, 0),
    at(cyl(0.16, 0.16, 0.02, '#9FD3E6', -0.24, 0.25, 0.31, 0.1), 0, 0, 0, Math.PI / 2, 0, 0),
    rbox(0.3, 0.12, 0.2, 0.05, '#2B3444', 0, 0.3, 0),
  ),
  cash: () => {
    const g = group();
    for (let i = 0; i < 4; i++) {
      const b = rbox(1.0, 0.07, 0.52, 0.02, i % 2 ? '#6FB86A' : '#5FA85A', 0, 0.035 + i * 0.075, 0);
      b.rotation.y = (i - 1.5) * 0.12;
      g.add(b);
    }
    g.add(rbox(0.16, 0.31, 0.54, 0.02, '#F2E8C9', 0, 0.16, 0), cyl(0.12, 0.12, 0.01, '#3E7A3A', 0, 0.31, 0));
    return g;
  },
  trophy: () => group(
    rbox(0.6, 0.18, 0.5, 0.05, '#6B4A2A', 0, 0.09, 0),
    cyl(0.07, 0.1, 0.3, GOLD, 0, 0.33, 0, 0.25, 0.7),
    at(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.06, 0), new THREE.Vector2(0.28, 0.08), new THREE.Vector2(0.38, 0.32), new THREE.Vector2(0.4, 0.52), new THREE.Vector2(0.36, 0.53)], 40), mat(GOLD, 0.25, 0.7)), 0, 0.46, 0),
    at(torus(0.14, 0.04, GOLD, Math.PI * 2, 0.25, 0.7), -0.4, 0.74, 0),
    at(torus(0.14, 0.04, GOLD, Math.PI * 2, 0.25, 0.7), 0.4, 0.74, 0),
    cyl(0.12, 0.12, 0.03, '#FFF1B8', 0, 0.62, 0.38).rotateX(Math.PI / 2),
  ),
  bed: () => group(
    rbox(1.1, 0.25, 0.7, 0.04, '#8A5A3A', 0, 0.2, 0),
    rbox(1.04, 0.14, 0.66, 0.06, CREAM, 0, 0.38, 0),
    rbox(0.66, 0.12, 0.68, 0.05, '#4E8DBA', 0.2, 0.44, 0),
    rbox(0.26, 0.12, 0.5, 0.06, '#FFFFFF', -0.36, 0.47, 0),
    rbox(0.1, 0.6, 0.72, 0.04, '#8A5A3A', -0.56, 0.35, 0),
  ),
  box: () => group(
    rbox(0.9, 0.62, 0.7, 0.03, '#C99456', 0, 0.31, 0),
    rbox(0.92, 0.04, 0.16, 0.01, '#E8D3A8', 0, 0.63, 0),
  ),
  linen: () => {
    const g = group();
    ['#FFFFFF', '#E8F0F6', '#FFFFFF'].forEach((c, i) => g.add(rbox(0.9, 0.16, 0.62, 0.07, c, 0, 0.09 + i * 0.17, 0)));
    g.add(rbox(0.08, 0.53, 0.64, 0.02, '#E05A73', 0, 0.26, 0));
    return g;
  },
  bath: () => group(
    rbox(1.2, 0.5, 0.65, 0.22, '#F7F4EE', 0, 0.38, 0),
    rbox(1.0, 0.04, 0.47, 0.16, '#8FD0E8', 0, 0.6, 0),
    sphere(0.14, '#FFFFFF', -0.2, 0.65, 0.02), sphere(0.11, '#FFFFFF', 0.05, 0.66, -0.06), sphere(0.12, '#FFFFFF', 0.25, 0.65, 0.05),
    ...[-0.45, 0.45].map((x) => sphere(0.07, GOLD, x, 0.07, 0.22)),
    at(cyl(0.035, 0.035, 0.35, '#C9CDD2'), -0.55, 0.78, 0),
  ),
  chest: () => group(
    rbox(1.0, 0.5, 0.62, 0.05, '#A0522D', 0, 0.25, 0),
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.0, 32, 1, false, 0, Math.PI), mat('#B5633A')), 0, 0.5, 0, 0, 0, Math.PI / 2),
    rbox(0.08, 0.82, 0.64, 0.02, GOLD, -0.35, 0.4, 0), rbox(0.08, 0.82, 0.64, 0.02, GOLD, 0.35, 0.4, 0),
    rbox(0.16, 0.2, 0.06, 0.03, GOLD, 0, 0.48, 0.32),
  ),
  gem: () => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat('#4FC3E8', 0.15));
    m.scale.y = 1.2;
    m.position.y = 0.6;
    return group(m);
  },
};

export { INK, BRASS };
