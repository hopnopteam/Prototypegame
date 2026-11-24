import * as THREE from 'three';

/**
 * Graphics experiment: the stylized look (owner's second reference, a warm, painted, toy-like render with depth).
 * The Blender carriage keeps its shapes and its baked bounce light (light only, no colour, so it holds for any paint);
 * here every surface is repainted in flat, saturated, hand-picked colours with painted textures drawn on a canvas
 * (planks with dark seams, a diamond rug, light grey tiles), the outer walls turn cream inside with gold caps and
 * glowing sconces, and the sea and the grass are drawn live (an animated turquoise sea with foam and glints, lush
 * instanced grass blades with flowers). `?style=0` brings back the photoreal materials.
 */
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const STYLE = query?.get('style') !== '0';

/** sRGB 0–255 to the linear values the materials take. */
const lin = (r: number, g: number, b: number): [number, number, number] => [r, g, b].map((v) => Math.pow(v / 255, 2.2)) as [number, number, number];

export interface StyleOverride {
  color?: [number, number, number];
  rough?: number;
  metal?: number;
  coat?: number;
  sheen?: number;
  /** A painted texture (canvas), in place of the photo texture; tiling in metres unless `uv01`. */
  paint?: () => THREE.Texture;
  scale?: number;
  /** Keep the photo's relief (normal map) at this strength; dropped otherwise. */
  relief?: number;
  /** Lit live like dressing, with no texture at all. */
  emit?: number;
}

// ------------------------------------------------------------------ painted textures
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.flipY = false;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

/** A seeded random, so the paint is the same every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rgb = (r: number, g: number, b: number, k = 1): string => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

/** Warm brown boards with dark seams and staggered ends: 1024 px for 2.4 m, eight boards of 30 cm. */
function planks(): THREE.Texture {
  return canvas(1024, 1024, (g) => {
    const r = rand(7);
    const rows = 8;
    const h = 1024 / rows;
    const tones = [[164, 106, 62], [154, 98, 56], [172, 114, 68], [146, 92, 52], [160, 104, 62]];
    for (let i = 0; i < rows; i++) {
      let x = -r() * 700;
      while (x < 1024) {
        const len = 520 + r() * 420;
        const t = tones[Math.floor(r() * tones.length)];
        const k = 0.94 + r() * 0.1;
        const grad = g.createLinearGradient(0, i * h, 0, i * h + h);
        grad.addColorStop(0, rgb(t[0], t[1], t[2], k * 1.06));
        grad.addColorStop(1, rgb(t[0], t[1], t[2], k * 0.93));
        g.fillStyle = grad;
        g.fillRect(x, i * h, len, h);
        // a few soft grain streaks
        g.globalAlpha = 0.1;
        for (let s = 0; s < 5; s++) {
          g.fillStyle = r() > 0.5 ? '#5a3418' : '#e0a066';
          const y = i * h + 6 + r() * (h - 12);
          g.fillRect(x + r() * 40, y, len * (0.4 + r() * 0.6), 1.5 + r() * 2);
        }
        g.globalAlpha = 1;
        // the plank's end: a dark seam
        g.fillStyle = '#3b2010';
        g.fillRect(x + len - 3, i * h, 4, h);
        x += len;
      }
      // the long seam, with a soft lip of light on the board below it
      g.fillStyle = '#3b2010';
      g.fillRect(0, i * h, 1024, 4);
      g.fillStyle = 'rgba(255,214,160,0.25)';
      g.fillRect(0, i * h + 4, 1024, 2);
    }
    // the far end and the near end tile: repeat the seam at the bottom edge
    g.fillStyle = '#3b2010';
    g.fillRect(0, 1020, 1024, 4);
  });
}

/** The lobby rug: a red and maroon diamond checker inside a cream line and a gold border (UV 0–1). */
function diamondRug(): THREE.Texture {
  return canvas(1024, 1024, (g) => {
    const W = 1024;
    g.fillStyle = rgb(196, 150, 62);
    g.fillRect(0, 0, W, W);
    g.fillStyle = rgb(120, 22, 30);
    g.fillRect(34, 34, W - 68, W - 68);
    g.fillStyle = rgb(240, 224, 190);
    g.fillRect(58, 58, W - 116, W - 116);
    const x0 = 70, x1 = W - 70;
    g.save();
    g.beginPath();
    g.rect(x0, x0, x1 - x0, x1 - x0);
    g.clip();
    g.fillStyle = rgb(150, 26, 34);
    g.fillRect(x0, x0, x1 - x0, x1 - x0);
    const n = 6;
    const s = (x1 - x0) / n;
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) {
        const cx = x0 + (i + 0.5) * s;
        const cy = x0 + (j + 0.5) * s;
        g.fillStyle = (i + j) % 2 === 0 ? rgb(196, 40, 46) : rgb(110, 18, 28);
        g.beginPath();
        g.moveTo(cx, cy - s / 2);
        g.lineTo(cx + s / 2, cy);
        g.lineTo(cx, cy + s / 2);
        g.lineTo(cx - s / 2, cy);
        g.closePath();
        g.fill();
        // a small gold dot at each diamond's heart
        g.fillStyle = rgb(214, 168, 72);
        g.beginPath();
        g.arc(cx, cy, s * 0.06, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    g.strokeStyle = rgb(214, 168, 72);
    g.lineWidth = 6;
    g.strokeRect(x0 + 3, x0 + 3, x1 - x0 - 6, x1 - x0 - 6);
  });
}

/** A plain red carpet with a faint weave (in metres). */
function redCarpet(): THREE.Texture {
  return canvas(256, 256, (g) => {
    const r = rand(3);
    g.fillStyle = rgb(176, 28, 36);
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(90,0,8,0.12)' : 'rgba(255,90,90,0.08)';
      g.fillRect(r() * 256, r() * 256, 2, 2);
    }
  });
}

/** Light grey square tiles with grout lines: 512 px for 1.2 m (four 30 cm tiles a side). */
function tiles(): THREE.Texture {
  return canvas(512, 512, (g) => {
    const r = rand(11);
    g.fillStyle = rgb(150, 150, 150);
    g.fillRect(0, 0, 512, 512);
    const n = 4;
    const s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const k = 0.95 + r() * 0.07;
        g.fillStyle = rgb(212, 212, 208, k);
        g.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(i * s + 4, j * s + 4, s - 8, 3);
      }
    }
  });
}

/** Painted grass ground under the blades: greens in soft patches (in metres). */
function lawn(): THREE.Texture {
  return canvas(512, 512, (g) => {
    const r = rand(5);
    g.fillStyle = rgb(88, 150, 48);
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(130,190,60,0.25)' : 'rgba(50,110,30,0.25)';
      const x = r() * 512, y = r() * 512, rad = 20 + r() * 60;
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        g.beginPath();
        g.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Warm sand with a few darker grains (in metres). */
function sand(): THREE.Texture {
  return canvas(256, 256, (g) => {
    const r = rand(9);
    g.fillStyle = rgb(238, 212, 156);
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(180,140,90,0.25)' : 'rgba(255,240,200,0.3)';
      g.fillRect(r() * 256, r() * 256, 2, 2);
    }
  });
}

const cache = new Map<string, THREE.Texture>();
const once = (key: string, f: () => THREE.Texture) => (): THREE.Texture => {
  let t = cache.get(key);
  if (!t) {
    t = f();
    cache.set(key, t);
  }
  return t;
};

// ------------------------------------------------------------------ the palette, by material name
const GOLD: StyleOverride = { color: lin(240, 182, 60), rough: 0.35, metal: 0.4 };
const CRIMSON: StyleOverride = { color: lin(168, 28, 38), rough: 0.5, coat: 0.15 };
const STYLES: [RegExp, StyleOverride][] = [
  [/^oak floor/, { paint: once('planks', planks), scale: 2.4, rough: 0.55, coat: 0.12 }],
  [/^persian rug/, { paint: once('rug', diamondRug), scale: 1, rough: 0.95 }],
  [/^red carpet/, { paint: once('carpet', redCarpet), scale: 0.8, rough: 0.95 }],
  [/^crimson paint/, CRIMSON],
  [/^dark crimson/, { color: lin(140, 22, 32), rough: 0.5, coat: 0.15 }],
  [/^cream (panel|paint)/, { color: lin(244, 230, 200), rough: 0.7 }],
  [/^(brass|polished brass|gold thread)/, GOLD],
  [/^walnut/, { color: lin(198, 140, 86), rough: 0.55, relief: 0.15 }],
  [/^oak$/, { color: lin(176, 112, 62), rough: 0.55, relief: 0.15 }],
  [/^green leather/, { color: lin(156, 178, 120), rough: 0.7 }],
  [/^red velvet/, { color: lin(180, 26, 36), rough: 0.75, sheen: 0.6 }],
  [/^red satin/, { color: lin(160, 24, 34), rough: 0.5 }],
  [/^white linen/, { color: lin(248, 245, 238), rough: 0.85 }],
  [/^black iron/, { color: lin(40, 40, 46), rough: 0.5 }],
  [/^case teal/, { color: lin(64, 150, 150), rough: 0.6 }],
  [/^case grey/, { color: lin(150, 156, 166), rough: 0.6 }],
  [/^case cream/, { color: lin(236, 220, 186), rough: 0.6 }],
  [/^case tan/, { color: lin(206, 150, 90), rough: 0.6 }],
  [/^case olive/, { color: lin(130, 146, 74), rough: 0.6 }],
  [/^case ox/, { color: lin(150, 40, 40), rough: 0.6 }],
  [/^strap/, { color: lin(96, 58, 32), rough: 0.6 }],
  [/^leaf/, { color: lin(60, 140, 50), rough: 0.6 }],
  [/^lamp shade/, { color: lin(255, 236, 190), rough: 0.8, emit: 0.6 }],
  [/^platform paving/, { paint: once('tiles', tiles), scale: 1.2, rough: 0.8 }],
  [/^kerb/, { color: lin(176, 176, 172), rough: 0.8 }],
  [/^safety line/, { color: lin(250, 200, 30), rough: 0.6 }],
  [/^lawn/, { paint: once('lawn', lawn), scale: 3, rough: 0.9 }],
  [/^sand/, { paint: once('sand', sand), scale: 1.5, rough: 0.95 }],
  [/^boulder/, { color: lin(150, 152, 156), rough: 0.75 }],
  [/^ballast/, { color: lin(120, 112, 104), rough: 0.9, relief: 0.6 }],
  [/^sleeper/, { color: lin(110, 72, 44), rough: 0.8 }],
  [/^rail steel/, { color: lin(150, 150, 156), rough: 0.35, metal: 0.8 }],
  [/^underframe/, { color: lin(40, 30, 30), rough: 0.7 }],
];

export function styleFor(name: string): StyleOverride | null {
  if (!STYLE) return null;
  for (const [re, s] of STYLES) if (re.test(name)) return s;
  return null;
}

/** Materials whose painted texture is laid out 0–1 on the object rather than in metres. */
export const UV01 = /^persian rug/;

// ------------------------------------------------------------------ the outer walls: cream inside, crimson and gold outside
/**
 * The outer walls are one paint in Blender. Inside the carriage they turn cream with a crimson skirting, outside they
 * keep the crimson with a gold band at the waist: chosen per fragment from where it is and which way it faces.
 */
/** The inverse of the carriage's placement, shared by every wall material (updated each frame by RealCarriage). */
export const carriageInverse = { value: new THREE.Matrix4() };

export function paintWalls(m: THREE.Material, inner: number, floorY: number, length: number): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uCream = { value: new THREE.Color().setRGB(...lin(244, 230, 200)) };
    sh.uniforms.uGold = { value: new THREE.Color().setRGB(...lin(236, 178, 72)) };
    sh.uniforms.uCarInv = carriageInverse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSPos;\nvarying vec3 vSNrm;\nuniform mat4 uCarInv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSPos = (uCarInv * modelMatrix * vec4(position, 1.0)).xyz;
        vSNrm = normalize(mat3(uCarInv) * mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSPos;\nvarying vec3 vSNrm;\nuniform vec3 uCream;\nuniform vec3 uGold;')
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          float inside = 0.0;
          if (abs(vSPos.x) < ${(inner + 0.06).toFixed(3)} && sign(vSPos.x) * vSNrm.x < -0.5) inside = 1.0;
          if (vSPos.z < 0.3 && vSNrm.z > 0.5) inside = 1.0;
          if (vSPos.z > ${(length - 0.3).toFixed(3)} && vSNrm.z < -0.5) inside = 1.0;
          float h = vSPos.y - ${floorY.toFixed(3)};
          if (inside > 0.5) {
            if (h > 0.12) diffuseColor.rgb = uCream;
            if (h > 0.12 && h < 0.15) diffuseColor.rgb = uGold;
          } else if (abs(vSNrm.y) < 0.5) {
            if (h > 0.3 && h < 0.36) diffuseColor.rgb = uGold;
            if (h > 1.0 && h < 1.04) diffuseColor.rgb = uGold;
          }
        }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|walls`;
}

// ------------------------------------------------------------------ gold caps, corner posts and sconces
interface WallLike { x0: number; z0: number; x1: number; z1: number; height: number; kind: string }

export function buildTrim(walls: WallLike[], floorY: number, inner: number, windows: [number, number]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'style trim';
  const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...lin(240, 182, 60)), roughness: 0.35, metalness: 0.4 });
  const capGeo = new THREE.BoxGeometry(1, 1, 1);
  const postGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
  const knobGeo = new THREE.SphereGeometry(1, 16, 12);
  const caps: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const knobs: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const corners = new Map<string, [number, number, number]>();
  for (const w of walls) {
    const top = floorY + w.height;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    const sx = w.x1 - w.x0 + 0.05, sz = w.z1 - w.z0 + 0.05;
    // the cap: a rounded gold rail a little wider than the wall
    caps.push(m.clone().compose(new THREE.Vector3(cx, top + 0.025, cz), new THREE.Quaternion(), new THREE.Vector3(sx, 0.06, sz)));
    // posts at the open ends of interior walls and the ends of the cut-away
    const along = w.z1 - w.z0 > w.x1 - w.x0;
    const ends: [number, number][] = along ? [[cx, w.z0], [cx, w.z1]] : [[w.x0, cz], [w.x1, cz]];
    for (const [ex, ez] of ends) {
      const key = `${ex.toFixed(2)},${ez.toFixed(2)}`;
      if (!corners.has(key)) corners.set(key, [ex, ez, top]);
    }
  }
  for (const [x, z, top] of corners.values()) {
    const h = top - floorY;
    posts.push(m.clone().compose(new THREE.Vector3(x, floorY + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.055, h, 0.055)));
    knobs.push(m.clone().compose(new THREE.Vector3(x, top + 0.06, z), new THREE.Quaternion(), new THREE.Vector3(0.065, 0.065, 0.065)));
  }
  const inst = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], name: string) => {
    const im = new THREE.InstancedMesh(geo, gold, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.name = name;
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  };
  inst(capGeo, caps, 'gold caps');
  inst(postGeo, posts, 'gold posts');
  inst(knobGeo, knobs, 'gold knobs');

  // sconces: a gold back plate and a glowing tulip shade on the inside of the long walls, between the windows
  const shade = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.5).multiplyScalar(2.2), toneMapped: true });
  const plate = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16);
  plate.rotateZ(Math.PI / 2);
  const tulip = new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  tulip.rotateX(Math.PI);
  const glowTex = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
  const y = floorY + Math.min(0.98, windows[1] + 0.02);
  for (const side of [-1, 1]) {
    for (let z = 1.6; z < 17.6; z += 2.4) {
      if (side > 0 && z > 0.6 && z < 2.4) continue; // the door
      const x = side * (inner - 0.012);
      const p = new THREE.Mesh(plate, gold);
      p.position.set(x, y, z);
      const t = new THREE.Mesh(tulip, shade);
      t.position.set(x - side * 0.06, y + 0.02, z);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), gold);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(x - side * 0.035, y, z);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(0.42);
      glow.position.copy(t.position);
      glow.renderOrder = 5;
      g.add(p, arm, t, glow);
    }
  }
  return g;
}

function glowTexture(): THREE.Texture {
  return canvas(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,230,180,1)');
    grad.addColorStop(0.25, 'rgba(255,190,110,0.55)');
    grad.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }, false);
}

// ------------------------------------------------------------------ the sea
/** The shoreline's wander along the train (metres, added to the shore's x): shared by the sea, the lawn and the grass. */
const SHORE_WOB_GLSL = (z: string): string => `(-0.9 * sin(${z} * 0.35) - 0.5 * sin(${z} * 0.9 + 1.3) - 0.35 * sin(${z} * 2.1 + 0.4))`;
export const shoreAt = (shoreX: number, z: number): number => shoreX - 0.9 * Math.sin(z * 0.35) - 0.5 * Math.sin(z * 0.9 + 1.3) - 0.35 * Math.sin(z * 2.1 + 0.4);

/** The lawn ends at the shoreline: nothing of it is drawn out at sea. */
export function cutAtShore(m: THREE.Material, shoreX: number): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uCarInv = carriageInverse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCPos;\nuniform mat4 uCarInv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCPos = (uCarInv * modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCPos;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vCPos.x < ${shoreX.toFixed(3)} + ${SHORE_WOB_GLSL('vCPos.z')}) discard;`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|shore`;
}
/**
 * A stylized sea: turquoise shading to deep teal with distance from the beach, bands of white foam that roll in and
 * fade at the shore, and sun glints that twinkle; unlit, its colours chosen to sit in the warm afternoon.
 */
export function buildSea(shoreX: number, y: number): { mesh: THREE.Mesh; update: (t: number) => void } {
  const geo = new THREE.PlaneGeometry(90, 160, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(shoreX - 45 + 1.5, y, 9);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uShore: { value: shoreX } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uShore;
      varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        float d = uShore + ${SHORE_WOB_GLSL('vP.z')} - vP.x;   // metres out to sea
        vec3 shallow = vec3(0.10, 0.80, 0.78);
        vec3 mid = vec3(0.02, 0.55, 0.70);
        vec3 deep = vec3(0.01, 0.30, 0.52);
        vec3 c = mix(shallow, mid, smoothstep(0.0, 6.0, d));
        c = mix(c, deep, smoothstep(6.0, 28.0, d));
        // soft ripples in the colour
        float n = noise(vec2(vP.x * 0.6 + uTime * 0.15, vP.z * 0.6)) + noise(vec2(vP.x * 1.7, vP.z * 1.7 - uTime * 0.2));
        c *= 0.93 + 0.08 * n;
        // foam: the edge on the sand, and bands rolling in
        float edge = 1.0 - smoothstep(0.0, 0.5, d);
        float wave = fract(d * 0.28 + uTime * 0.18);
        float band = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.06, 0.2, wave)) * (1.0 - smoothstep(1.0, 6.0, d));
        band *= smoothstep(0.35, 0.7, noise(vec2(vP.z * 0.8, d * 0.5 + uTime * 0.1)));
        float foam = clamp(edge + band * 0.85, 0.0, 1.0);
        c = mix(c, vec3(0.95, 0.98, 0.97), foam);
        // glints: little stars of sunlight
        float gl = noise(vec2(vP.x * 4.0 + uTime * 0.7, vP.z * 4.0 - uTime * 0.4)) * noise(vec2(vP.x * 3.1 - uTime * 0.5, vP.z * 2.7));
        c += vec3(1.0, 0.95, 0.8) * smoothstep(0.55, 0.7, gl) * smoothstep(2.0, 6.0, d) * 0.9;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stylized sea';
  mesh.receiveShadow = false;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// ------------------------------------------------------------------ grass blades and flowers
/**
 * Lush grass: blades scattered over every triangle painted with the lawn (by area), each a tapered, bent blade from
 * a dark green root to a sunlit yellow-green tip, swaying in the wind; a few flowers among them.
 */
export function buildGrass(src: THREE.Mesh, lawnIndex: number, count: number, shoreX = -1e9): { group: THREE.Group; update: (t: number) => void } {
  const group = new THREE.Group();
  group.name = 'grass';
  const geo = src.geometry;
  const pos = geo.getAttribute('position');
  const index = geo.getIndex();
  const tris: number[] = [];
  const areas: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
  let total = 0;
  for (const gr of groups) {
    if ((gr.materialIndex ?? 0) !== lawnIndex) continue;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      total += area;
      tris.push(ia, ib, ic);
      areas.push(total);
    }
  }
  const empty = { group, update: () => {} };
  if (!areas.length) return empty;
  // one blade: five vertices, tapering to a tip, bent forward
  const blade = new THREE.BufferGeometry();
  const W = 0.035, H = 1;
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-W, 0, 0, W, 0, 0, -W * 0.6, H * 0.5, 0.02, W * 0.6, H * 0.5, 0.02, 0, H, 0.08], 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.3, 1, 0, 0.3, 1, 0, 0.5, 1, 0, 0.5, 1, 0, 0.8, 0.6], 3));
  blade.setAttribute('aT', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 1], 1));
  blade.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT;\nvarying float vT;\nuniform float uTime;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vT = aT;
        {
          vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sway = sin(uTime * 1.6 + root.x * 0.7 + root.z * 0.5) * 0.5 + sin(uTime * 2.7 + root.z * 1.3) * 0.25;
          transformed.z += sway * 0.12 * aT * aT;
          transformed.x += sway * 0.05 * aT * aT;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT;')
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(0.38, 0.55, 0.42), vec3(1.25, 1.18, 0.8), vT);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', lookChunk);
  };
  mat.customProgramCacheKey = () => 'style-grass';
  const im = new THREE.InstancedMesh(blade, mat, count);
  im.name = 'grass blades';
  im.receiveShadow = true;
  im.castShadow = false;
  const r = rand(21);
  const pick = (): THREE.Vector3 => {
    for (let tries = 0; tries < 30; tries++) {
      const p = pickAny();
      if (p.x > shoreAt(shoreX, p.z) + 0.12) return p;
    }
    return new THREE.Vector3(0, -100, 0);
  };
  const pickAny = (): THREE.Vector3 => {
    const t = r() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    a.fromBufferAttribute(pos, tris[lo * 3]);
    b.fromBufferAttribute(pos, tris[lo * 3 + 1]);
    c.fromBufferAttribute(pos, tris[lo * 3 + 2]);
    let u = r(), v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    return a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v).applyMatrix4(src.matrix);
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const greens = [[0.16, 0.45, 0.06], [0.22, 0.52, 0.08], [0.13, 0.38, 0.05], [0.28, 0.55, 0.1]];
  for (let i = 0; i < count; i++) {
    const p = pick();
    e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    const h = 0.16 + r() * 0.2;
    m.compose(p, q, new THREE.Vector3(1 + r() * 0.6, h, 1));
    im.setMatrixAt(i, m);
    const gcol = greens[Math.floor(r() * greens.length)];
    col.setRGB(gcol[0], gcol[1], gcol[2]);
    im.setColorAt(i, col);
  }
  group.add(im);

  // flowers: a little star of petals on a stalk, white, yellow and pink
  const petals = new THREE.CircleGeometry(0.03, 5);
  petals.rotateX(-Math.PI / 2);
  const fmat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide });
  fmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', lookChunk); };
  fmat.customProgramCacheKey = () => 'style-flower';
  const nf = Math.round(count / 70);
  const fl = new THREE.InstancedMesh(petals, fmat, nf);
  const fcols = [[1, 1, 0.95], [1, 0.85, 0.15], [1, 0.55, 0.7], [1, 1, 0.95]];
  for (let i = 0; i < nf; i++) {
    const p = pick();
    p.y += 0.2 + r() * 0.12;
    m.compose(p, q.setFromEuler(e.set(0, r() * 6.28, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + r() * 0.6));
    fl.setMatrixAt(i, m);
    const fc = fcols[Math.floor(r() * fcols.length)];
    fl.setColorAt(i, col.setRGB(fc[0], fc[1], fc[2]));
  }
  fl.name = 'flowers';
  group.add(fl);
  return { group, update: (t) => { time.value = t; } };
}

/** The stylized grade, set by RealCarriage so grass and flowers share it. */
let lookChunk = '#include <tonemapping_fragment>';
export function setLookChunk(chunk: string): void {
  lookChunk = chunk;
}
