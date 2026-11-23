import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarriageView } from './CarriageView';

/**
 * Graphics experiment (branch `graphics-experiment`): the lobby carriage as a photoreal build. It is modelled in
 * Blender on the game's own floor plan (`experiments/realism/game_lobby.py`), its light path traced by Cycles and baked
 * into one texture (sun, sky, bounce light, contact shadows, lamp glow), and drawn here unlit with that texture, so a
 * phone shows the offline render's light for the price of one textured mesh.
 *
 * On in a build made with REAL=1 or with `?real=1`; `?real=0` turns it off. The files sit beside the page in `real/`.
 * Only the carriage's static structure, its beds and the rack's cases are swapped; everything that moves (doors,
 * blinds, guests, locks, the tarp, the cat) is still the game's own.
 */
declare const __REAL_CARRIAGE__: boolean;
const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('real') : null;
export const REAL_CARRIAGE: boolean = param === '1' || (param !== '0' && typeof __REAL_CARRIAGE__ !== 'undefined' && __REAL_CARRIAGE__ === true);

/** The afternoon the bake was lit for, in the game's day cycle (Lighting's keys): the world around it matches. */
export const REAL_TIME_OF_DAY = 0.53;
const BASE = 'real/';
/**
 * The models are published as `.glb.wasm`: the artifact host serves only standard web types, and `.wasm` is served as
 * binary, untouched. GLTFLoader reads the bytes whatever the name.
 */
export const MODEL_EXT = '.glb.wasm';
/** Exposure into the tone curve (Blender's renders used 0 EV). */
const EXPOSURE = 1.0;
/**
 * Blender's AgX view with its "Medium High Contrast" look, close enough for a phone: the AgX inset matrix, a log2
 * encoding over 16.5 stops, the default sigmoid, the outset matrix, then a gentle contrast lift around mid grey.
 */
const AGX = `
vec3 realAgX( vec3 color ) {
  const mat3 inset = mat3( 0.856627153315983, 0.137318972929847, 0.11189821299995,
                           0.0951212405381588, 0.761241990602591, 0.0767994186031903,
                           0.0482516061458583, 0.101439036467562, 0.811302368396859 );
  const mat3 outset = mat3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
                            -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
                            -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  color = inset * max( color, vec3( 1e-10 ) );
  color = clamp( ( log2( color ) - minEv ) / ( maxEv - minEv ), 0.0, 1.0 );
  vec3 x2 = color * color;
  vec3 x4 = x2 * x2;
  color = 15.5 * x4 * x2 - 40.14 * x4 * color + 31.96 * x4 - 6.868 * x2 * color + 0.4298 * x2 + 0.1191 * color - 0.00232;
  color = outset * color;
  color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
  color = mix( color, smoothstep( 0.0, 1.0, color ), 0.35 );
  return clamp( color, 0.0, 1.0 );
}`;

interface Loaded {
  root: THREE.Group;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;
const waiting: CarriageView[] = [];
const dressed = new WeakSet<CarriageView>();

export function loadRealCarriage(): Promise<Loaded | null> {
  if (!REAL_CARRIAGE) return Promise.resolve(null);
  if (loading) return loading;
  loading = (async () => {
    try {
      // Two bakes on one set of UVs: the surfaces' colour (sharp, 4096) and the light on them (soft, 2048, stored as a
      // fraction of `lightScale`). Drawn unlit: colour × light, through the same AgX curve as the Cycles renders,
      // instead of the game's own grade (which suits its stylized materials, not path-traced light).
      const meta = await (await fetch(`${BASE}lobby_bake.json`)).json() as { lightScale: number };
      const loader = new THREE.TextureLoader();
      const [albedo, light] = await Promise.all([loader.loadAsync(`${BASE}lobby_albedo.jpg`), loader.loadAsync(`${BASE}lobby_light.jpg`)]);
      for (const t of [albedo, light]) {
        t.flipY = false;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
      }
      light.channel = 0;
      const gltf = await new GLTFLoader().loadAsync(`${BASE}lobby${MODEL_EXT}`);
      // MeshBasicMaterial divides a light map by π (physical units); the bake is already in the light's own units.
      const baked = agx(new THREE.MeshBasicMaterial({ map: albedo, lightMap: light, lightMapIntensity: meta.lightScale * Math.PI, toneMapped: false }));
      // Flowers, leaves and the chassis carry their lit colour per vertex (no texture space for things that small).
      const dressing = agx(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      const glass = new THREE.MeshBasicMaterial({ color: 0xbcd4dc, transparent: true, opacity: 0.18, depthWrite: false });
      const root = new THREE.Group();
      root.name = 'real carriage';
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mesh = new THREE.Mesh(o.geometry, o.name.includes('glass') ? glass : o.name.includes('dressing') ? dressing : baked);
        mesh.applyMatrix4(o.matrixWorld);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        root.add(mesh);
      });
      loaded = { root };
      for (const v of waiting.splice(0)) dress(v);
      return loaded;
    } catch (err) {
      console.warn('[RealCarriage] could not load the photoreal carriage', err);
      return null;
    }
  })();
  return loading;
}

/** The renders' tone curve in place of the game's grade. */
function agx(m: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRealExposure = { value: EXPOSURE };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uRealExposure;\n' + AGX + '\nvoid main() {')
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = realAgX( gl_FragColor.rgb * uRealExposure );');
  };
  m.customProgramCacheKey = () => 'real-agx';
  return m;
}

/** Swap carriage 0's procedural build for the photoreal one (now, or once the files have loaded). */
export function dressRealCarriage(view: CarriageView, index: number): void {
  if (!REAL_CARRIAGE || index !== 0 || view.layout.type !== 'lobby') return;
  if (!loaded) {
    waiting.push(view);
    void loadRealCarriage();
    return;
  }
  dress(view);
}

function hide(o: THREE.Object3D): void {
  o.traverse((c) => c.layers.disableAll());
}

function dress(view: CarriageView): void {
  if (!loaded || dressed.has(view)) return;
  dressed.add(view);
  const beds = new Set<THREE.Object3D>(view.cabinBeds);
  for (const child of view.group.children) {
    const stock = child.userData?.stock as string | undefined;
    const plain = child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && Object.keys(child.userData ?? {}).length === 0;
    if (plain || beds.has(child) || (stock && stock.startsWith('stock:luggage'))) hide(child);
  }
  const copy = loaded.root.clone();
  view.group.add(copy);
}
