import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { VISUALS } from '../config/visuals';
import type { CarriageView } from './CarriageView';

/**
 * Graphics experiment (branch `graphics-experiment`): the lobby carriage, and the station and sea round it, drawn
 * photoreal in real time, the way a modern engine draws a scene, after the owner's reference images.
 *
 * Built in Blender on the game's own floor plan (`experiments/realism/game_export.py`) and drawn here in a scene of
 * its own, after the game's, into the same frame and depth buffer (so everything still sorts): every surface with its
 * own textures (colour, relief, roughness) and gloss, metal, clear coat or velvet sheen; a live sun with soft shadows
 * (the conductor's too); the light that is not the sun's (the sky, with occlusion, and every bounce, the sun's
 * included) baked by Cycles; reflections of the sky; and Blender's AgX tone curve. The game's own lights and grade
 * never touch it, and its stylized lakeside is hidden.
 *
 * On in a build made with REAL=1 or with `?real=1`; `?real=0` turns it off. Its files sit beside the page in `real/`.
 */
declare const __REAL_CARRIAGE__: boolean;
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const param = query?.get('real') ?? null;
export const REAL_CARRIAGE: boolean = param === '1' || (param !== '0' && typeof __REAL_CARRIAGE__ !== 'undefined' && __REAL_CARRIAGE__ === true);

/** The afternoon the scene was lit for, in the game's day cycle: the game's own things are lit for it too. */
export const REAL_TIME_OF_DAY = 0.53;
const BASE = 'real/';
/** Models are published as `.glb.wasm`: the artifact host serves `.wasm` as binary, untouched, and not `.glb`. */
export const MODEL_EXT = '.glb.wasm';
/** Exposure into the AgX curve (the Cycles renders used 0 EV); `?ev=` to try another. */
const EXPOSURE = Number(query?.get('ev')) || 1.0;
/** The references' framing: closer than the game's (7.8 m across). */
const VIEW_WIDTH = 5.6;
/** The sun's shadow: a square this many metres across round the view, this many texels. */
const SHADOW_SPAN = 16;
const SHADOW_SIZE = 4096;

if (REAL_CARRIAGE) VISUALS.camera.minVisibleWidth = VIEW_WIDTH;

interface Spec {
  kind: 'pbr' | 'flat' | 'emit';
  color?: number[] | null;
  rough?: number;
  metal?: number;
  coat?: number;
  sheen?: number;
  sheen_tint?: number[] | null;
  scale?: number;
  aspect?: number;
  nstrength?: number;
  map?: string;
  normalMap?: string;
  roughnessMap?: string;
  strength?: number;
  Coat_Weight?: number;
  Coat_Roughness?: number;
  Sheen_Weight?: number;
  Sheen_Tint?: number[];
  Transmission_Weight?: number;
  Anisotropic?: number;
  Emission_Strength?: number;
  Emission_Color?: number[];
}

interface Lighting {
  sun: { direction: [number, number, number]; strength: number; color: [number, number, number] };
  bounceScale: number;
  skyScale: number;
}

/** The photoreal scene, drawn after the game's own. */
export const realScene = new THREE.Scene();
if (REAL_CARRIAGE && typeof window !== 'undefined') {
  const w = window as unknown as { nightExpressReal: THREE.Scene; nightExpressPick: (x: number, y: number, cam: THREE.Camera) => string[] };
  w.nightExpressReal = realScene;
  // debugging: what in the photoreal scene is under a point of the screen (normalised device coordinates)
  w.nightExpressPick = (x, y, cam) => {
    const r = new THREE.Raycaster();
    r.setFromCamera(new THREE.Vector2(x, y), cam);
    return r.intersectObject(realScene, true).slice(0, 3).map((h) => {
      const m = h.object as THREE.Mesh;
      const mat = Array.isArray(m.material) ? m.material[h.face?.materialIndex ?? 0] : m.material;
      return `${m.name || m.type}/${mat?.name} @ ${h.point.toArray().map((v) => v.toFixed(2)).join(',')}`;
    });
  };
}
const world = new THREE.Group();
world.matrixAutoUpdate = false;
realScene.add(world);
const sun = new THREE.DirectionalLight();
realScene.add(sun, sun.target);
const toSunDir = new THREE.Vector3(0, 1, 0);
let anchor: THREE.Object3D | null = null;
let ready = false;
let loading: Promise<void> | null = null;
let rendererRef: THREE.WebGLRenderer | null = null;
const waiting: CarriageView[] = [];
const dressed = new WeakSet<CarriageView>();

export function loadRealCarriage(renderer?: THREE.WebGLRenderer): Promise<void> {
  if (!REAL_CARRIAGE) return Promise.resolve();
  if (renderer) rendererRef = renderer;
  if (loading) return loading;
  loading = load().catch((err) => console.warn('[RealCarriage] could not load the photoreal carriage', err));
  return loading;
}

async function load(): Promise<void> {
  const json = async <T>(f: string): Promise<T> => (await fetch(BASE + f)).json() as Promise<T>;
  const [light, specs] = await Promise.all([json<Lighting>('lighting.json'), json<Record<string, Spec>>('materials.json')]);
  const tl = new THREE.TextureLoader();
  const texCache = new Map<string, Promise<THREE.Texture>>();
  const tex = (f: string, srgb: boolean): Promise<THREE.Texture> => {
    const key = `${f}|${srgb}`;
    let p = texCache.get(key);
    if (!p) {
      p = tl.loadAsync(BASE + f).then((t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.flipY = false;
        t.anisotropy = 8;
        return t;
      });
      texCache.set(key, p);
    }
    return p;
  };
  const [bounce, ao, skyTex] = await Promise.all([tex('bounce.jpg', true), tex('ao.jpg', false), tl.loadAsync(BASE + 'sky.jpg')]);
  for (const t of [bounce, ao]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.channel = 1;
  }
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  let env: THREE.Texture = skyTex;
  realScene.environment = skyTex;
  realScene.environmentIntensity = 1;
  if (rendererRef) {
    const pm = new THREE.PMREMGenerator(rendererRef);
    env = pm.fromEquirectangular(skyTex).texture;
    pm.dispose();
  }

  realScene.environmentIntensity = light.skyScale;
  // the sun: its direction and strength from the bake, so live light and baked bounce agree
  toSunDir.set(...light.sun.direction).normalize();
  sun.color.setRGB(...light.sun.color);
  sun.intensity = light.sun.strength;
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -SHADOW_SPAN / 2;
  sc.right = sc.top = SHADOW_SPAN / 2;
  sc.near = 0.5;
  sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${BASE}scene${MODEL_EXT}`);
  const made = new Map<string, Promise<THREE.Material>>();
  const material = (name: string, baked: boolean): Promise<THREE.Material> => {
    const key = `${name}|${baked}`;
    let p = made.get(key);
    if (!p) {
      p = build(specs[name] ?? specs[name.replace(/\.\d+$/, '')] ?? { kind: 'flat', color: [0.5, 0.5, 0.5], rough: 0.6 }, name, baked);
      made.set(key, p);
    }
    return p;
  };
  const build = async (s: Spec, name: string, baked: boolean): Promise<THREE.Material> => {
    const coat = s.coat ?? s.Coat_Weight ?? 0;
    const sheen = s.sheen ?? s.Sheen_Weight ?? 0;
    const glass = /^(glass|bottle|crystal)/.test(name) || (s.Transmission_Weight ?? 0) > 0.5;
    const m = coat > 0 || sheen > 0 || glass || (s.Anisotropic ?? 0) > 0 ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
    m.name = name;
    const c = s.color ?? [1, 1, 1];
    m.color.setRGB(c[0], c[1], c[2]);
    m.roughness = s.rough ?? 0.5;
    m.metalness = s.metal ?? 0;
    const rx = 1 / (s.scale ?? 1);
    const ry = 1 / ((s.scale ?? 1) * (s.aspect ?? 1));
    const tiled = async (f: string, srgb: boolean): Promise<THREE.Texture> => {
      const t = (await tex(f, srgb)).clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return t;
    };
    if (s.map) {
      m.map = await tiled(s.map, true);
      m.color.setRGB(1, 1, 1);
    }
    if (s.normalMap) {
      m.normalMap = await tiled(s.normalMap, false);
      const k = s.nstrength ?? 1;
      m.normalScale.set(k, k);
    }
    if (s.roughnessMap) {
      m.roughnessMap = await tiled(s.roughnessMap, false);
      m.roughness = 1;
    }
    if (m instanceof THREE.MeshPhysicalMaterial) {
      m.clearcoat = coat;
      m.clearcoatRoughness = s.Coat_Roughness ?? 0.12;
      if (sheen > 0) {
        m.sheen = sheen;
        const st = s.sheen_tint ?? s.Sheen_Tint ?? [1, 1, 1];
        m.sheenColor.setRGB(Math.min(1, c[0] * st[0] * 2 + 0.05), Math.min(1, c[1] * st[1] * 2 + 0.02), Math.min(1, c[2] * st[2] * 2 + 0.02));
        m.sheenRoughness = 0.45;
      }
      if (s.Anisotropic) m.anisotropy = s.Anisotropic;
      if (glass) {
        m.transparent = true;
        m.opacity = 0.16;
        m.roughness = 0.03;
        m.depthWrite = false;
        m.color.setRGB(0.9, 0.95, 1);
      }
    }
    if (s.kind === 'emit' || (s.Emission_Strength ?? 0) > 0) {
      const ec = s.kind === 'emit' ? c : (s.Emission_Color ?? c);
      m.emissive.setRGB(ec[0], ec[1], ec[2]);
      m.emissiveIntensity = s.kind === 'emit' ? (s.strength ?? 1) * 0.5 : (s.Emission_Strength ?? 0);
    }
    m.envMap = env;
    m.envMapIntensity = light.skyScale;
    if (baked) {
      // The carriage: the bake carries all light but the sun's direct light, so the sky's own diffuse light is not
      // added again; its reflections stay, dimmed by the baked occlusion.
      m.lightMap = bounce;
      m.lightMapIntensity = light.bounceScale * Math.PI;
      m.aoMap = ao;
      m.aoMapIntensity = 1;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = look(sh.fragmentShader.replace('#include <lights_fragment_maps>', LIGHTS_MAPS_NO_SKY_DIFFUSE));
      };
      m.customProgramCacheKey = () => 'real-baked';
    } else {
      applyLook(m);
    }
    return m;
  };

  gltf.scene.updateMatrixWorld(true);
  const meshes: Promise<void>[] = [];
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const owner = o.name === 'carriage' || o.parent?.name === 'carriage';
    const src = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
    meshes.push(Promise.all(src.map((mm) => material(mm.name, owner))).then((mats) => {
      const mesh = new THREE.Mesh(o.geometry, mats.length === 1 ? mats[0] : mats);
      mesh.applyMatrix4(o.matrixWorld);
      mesh.castShadow = !/glass/.test(o.name);
      mesh.receiveShadow = true;
      world.add(mesh);
    }));
  });
  await Promise.all(meshes);
  ready = true;
  for (const v of waiting.splice(0)) dress(v);
}

/**
 * The renders' look: three's AgX, then Blender's "Medium High Contrast" (a gentle S-curve on the display values) and
 * a little more colour.
 */
const LOOK = /* glsl */ `
#if defined( TONE_MAPPING )
  gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
  {
    vec3 d = pow( max( gl_FragColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) );
    d = mix( d, d * d * ( 3.0 - 2.0 * d ), 0.42 );
    float l = dot( d, vec3( 0.2126, 0.7152, 0.0722 ) );
    d = mix( vec3( l ), d, 1.14 );
    gl_FragColor.rgb = pow( clamp( d, 0.0, 1.0 ), vec3( 2.2 ) );
  }
#endif
`;
const look = (src: string): string => src.replace('#include <tonemapping_fragment>', LOOK);

/** Gives any material in the photoreal scene the renders' look (the conductor's too). */
export function applyLook(m: THREE.Material): void {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = look(sh.fragmentShader);
  };
  m.customProgramCacheKey = () => 'real-look';
}

/** three's lights_fragment_maps chunk without the sky's diffuse light: the baked map already holds it, occluded. */
const LIGHTS_MAPS_NO_SKY_DIFFUSE = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  #ifdef USE_LIGHTMAP
    vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
    vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
    irradiance += lightMapIrradiance;
  #endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  #ifdef USE_ANISOTROPY
    radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
  #else
    radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
  #endif
  #ifdef USE_CLEARCOAT
    clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
  #endif
#endif
`;

/** Swap carriage 0's procedural build for the photoreal one (now, or once the files have loaded). */
export function dressRealCarriage(view: CarriageView, index: number): void {
  if (!REAL_CARRIAGE || index !== 0 || view.layout.type !== 'lobby') return;
  if (!ready) {
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
  if (dressed.has(view)) return;
  dressed.add(view);
  const beds = new Set<THREE.Object3D>(view.cabinBeds);
  for (const child of view.group.children) {
    const stock = child.userData?.stock as string | undefined;
    const plain = child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && Object.keys(child.userData ?? {}).length === 0;
    if (plain || beds.has(child) || (stock && stock.startsWith('stock:luggage'))) hide(child);
  }
  anchor = view.group;
}

/**
 * Draws the photoreal scene over the game's frame (Stage calls it right after its own render): follows carriage 0,
 * keeps the sun's shadow round what the camera sees, and renders through AgX with its own soft shadows.
 */
export function renderRealScene(renderer: THREE.WebGLRenderer, camera: THREE.Camera, focus: THREE.Vector3): void {
  if (!REAL_CARRIAGE || !ready) return;
  if (anchor) {
    anchor.updateWorldMatrix(true, false);
    world.matrix.copy(anchor.matrixWorld);
    world.matrixWorldNeedsUpdate = true;
  }
  // texel-snapped, so the soft edges do not shimmer as the view moves
  const texel = SHADOW_SPAN / SHADOW_SIZE;
  sun.target.position.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
  sun.position.copy(sun.target.position).addScaledVector(toSunDir, 30);
  const tm = renderer.toneMapping;
  const te = renderer.toneMappingExposure;
  const autoClear = renderer.autoClear;
  const shadows = renderer.shadowMap.enabled;
  const shadowType = renderer.shadowMap.type;
  const shadowAuto = renderer.shadowMap.autoUpdate;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.render(realScene, camera);
  renderer.toneMapping = tm;
  renderer.toneMappingExposure = te;
  renderer.autoClear = autoClear;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = shadowType;
  renderer.shadowMap.autoUpdate = shadowAuto;
}
