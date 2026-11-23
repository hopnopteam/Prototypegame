import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterView } from './CharacterView';
import { MODEL_EXT, REAL_CARRIAGE } from './RealCarriage';

/**
 * Graphics experiment: the conductor as a realistic rigged figure to go with the photoreal carriage. A Ready Player
 * Me avatar re-dyed in the railway's navy, with a peaked cap modelled here, moving on clips from Ready Player Me's own
 * animation library (made for this skeleton, so they apply as they are). It follows the game's own player: where they stand,
 * which way they face, how fast they go. The game's figure stays underneath for everything else (what it carries,
 * its shadow, its speech bubble); only its body is hidden.
 */
const BASE = 'real/';
/** The avatar stands about 1.84 m; the conductor reads a touch smaller beside the carriage's 1.1 m walls. */
const SCALE = 0.95;
const WALK_SPEED = 1.35;   // m/s at which the walk clip plays at 1×
const RUN_SPEED = 3.6;
const RUN_FROM = 3.0;
const FADE = 0.22;
/** Navy uniform: brightness of the original outfit mapped onto these colours (dark to light). */
const NAVY: [number, [number, number, number]][] = [[0, [6, 9, 22]], [0.3, [16, 26, 62]], [0.58, [34, 52, 112]], [0.68, [196, 200, 206]], [0.85, [236, 238, 240]]];

let figure: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let current = '';
let host: CharacterView | null = null;
let hidden: THREE.Object3D[] = [];

export function attachRealConductor(scene: THREE.Scene, view: CharacterView): void {
  if (!REAL_CARRIAGE) return;
  host = view;
  void load(scene);
}

async function load(scene: THREE.Scene): Promise<void> {
  try {
    const loader = new GLTFLoader();
    const names = ['idle', 'walk', 'run'];
    const [body, ...clips] = await Promise.all([`${BASE}conductor${MODEL_EXT}`, ...names.map((n) => `${BASE}${n}${MODEL_EXT}`)].map((u) => loader.loadAsync(u)));
    const root = new THREE.Group();
    root.name = 'real conductor';
    const avatar = body.scene;
    avatar.scale.setScalar(SCALE);
    root.add(avatar);
    avatar.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = false;
      o.castShadow = false;
      const name = o.name;
      if (/Headwear|Icosphere/i.test(name)) o.visible = false;
      const mat = o.material as THREE.MeshStandardMaterial;
      if (/Outfit_Top|Outfit_Bottom/.test(name) && mat.map) mat.map = redye(mat.map, NAVY);
      if (/Outfit_Footwear/.test(name) && mat.map) mat.map = redye(mat.map, [[0, [4, 4, 5]], [1, [40, 36, 36]]]);
      if (/Outfit/.test(name)) mat.roughness = Math.max(mat.roughness, 0.6);
    });
    addCap(avatar);
    mixer = new THREE.AnimationMixer(avatar);
    clips.forEach((g, i) => {
      const clip = g.animations[0];
      if (!clip) return;
      // In place: the game moves the conductor, so only the hips' bob is kept of the root motion.
      const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'Hips.position').map((t) => {
        if (t.name !== 'Hips.position') return t;
        const c = t.clone();
        const v = c.values;
        const x0 = v[0], z0 = v[2];
        for (let k = 0; k < v.length; k += 3) { v[k] = x0; v[k + 2] = z0; }
        return c;
      });
      actions[names[i]] = mixer!.clipAction(new THREE.AnimationClip(names[i], clip.duration, tracks));
    });
    play('idle');
    scene.add(root);
    figure = root;
  } catch (err) {
    console.warn('[RealConductor] could not load the conductor', err);
  }
}

/** Brightness of an outfit texture mapped onto a colour ramp, on a canvas. */
function redye(src: THREE.Texture, stops: [number, [number, number, number]][]): THREE.Texture {
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k];
    const [b, cb] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (v - a) / Math.max(1e-4, b - a)));
    p[i] = ca[0] + (cb[0] - ca[0]) * t;
    p[i + 1] = ca[1] + (cb[1] - ca[1]) * t;
    p[i + 2] = ca[2] + (cb[2] - ca[2]) * t;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  return t;
}

/** A railway peaked cap: navy crown, gold band and badge, a glossy black peak; parented to the head bone. */
function addCap(avatar: THREE.Object3D): void {
  avatar.updateMatrixWorld(true);
  let head: THREE.Bone | null = null;
  let top: THREE.Object3D | null = null;
  avatar.traverse((o) => {
    if (o instanceof THREE.Bone && o.name === 'Head') head = o;
    if (o.name === 'HeadTop_End') top = o;
  });
  if (!head || !top) return;
  const navy = new THREE.MeshStandardMaterial({ color: 0x0b1430, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8963c, roughness: 0.3, metalness: 1 });
  const peak = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.15 });
  const lathe = (pts: [number, number][], m: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40), m);
  const cap = new THREE.Group();
  const crown = lathe([[0, 0], [0.095, 0], [0.1, 0.05], [0.118, 0.085], [0.12, 0.095], [0.11, 0.1], [0, 0.105]], navy);
  crown.scale.set(1, 1, 1.1);
  cap.add(crown);
  cap.add(lathe([[0.098, 0.004], [0.101, 0.004], [0.105, 0.04], [0.102, 0.04]], gold));
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.006, 32, 1, false, -Math.PI / 2, Math.PI), peak);
  visor.scale.set(1, 1, 0.55);
  visor.position.set(0, 0.006, 0.04);
  visor.rotation.x = 0.22;
  cap.add(visor);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 20), gold);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.06, 0.112);
  cap.add(badge);
  const t = new THREE.Vector3();
  (top as THREE.Object3D).getWorldPosition(t);
  cap.position.set(t.x, t.y - 0.075, t.z + 0.01);
  cap.rotation.x = -0.1;
  avatar.add(cap);
  (head as THREE.Bone).attach(cap);
}

function play(name: string, timeScale = 1): void {
  const next = actions[name];
  if (!next) return;
  next.timeScale = timeScale;
  if (current === name) return;
  const prev = actions[current];
  next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
  prev?.fadeOut(FADE);
  current = name;
}

/** Each frame, after the game's figure has been placed: follow it and pick the clip by speed. */
export function updateRealConductor(dt: number, speed: number): void {
  if (!figure || !host || !mixer) return;
  const root = host.root;
  figure.position.copy(root.position);
  figure.quaternion.copy(root.quaternion);
  if (speed < 0.2) play('idle');
  else if (speed < RUN_FROM) play('walk', Math.max(0.6, speed / WALK_SPEED));
  else play('run', speed / RUN_SPEED);
  mixer.update(dt);
  // Hide the game figure's body (its carried things, shadow and bubble stay).
  if (!hidden.length) {
    const keep = new Set<THREE.Object3D>();
    host.stackAnchor.traverse((o) => keep.add(o));
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !keep.has(o) && !(o instanceof THREE.Sprite) && o.parent !== root) hidden.push(o);
    });
  }
  for (const o of hidden) o.visible = false;
}
