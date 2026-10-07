import * as THREE from 'three';
import { Rng } from '../core/Rng';

export type ParticleKind = 'dust' | 'sparkle' | 'confetti' | 'smoke' | 'steam' | 'star' | 'cash' | 'heart' | 'chimney';

interface KindSpec {
  colors: string[];
  size: [number, number];
  life: [number, number];
  speed: [number, number];
  up: [number, number];
  gravity: number;
  drag: number;
  grow: number;
  /** 0 soft round, 1 star, 2 card, 3 a soft puff lit by the moon at night (smoke, steam, dust). */
  shape: 0 | 1 | 2 | 3;
  alpha: number;
  /** Carried along with the countryside as it scrolls past (smoke from a cottage chimney stays with the cottage's air). */
  rides?: boolean;
}

const SPECS: Record<ParticleKind, KindSpec> = {
  dust: { colors: ['#E3D3B0', '#CDB88E', '#F2E6C9'], size: [0.5, 0.9], life: [0.6, 1.0], speed: [1.5, 3.5], up: [0.5, 1.5], gravity: -0.5, drag: 3, grow: 0.8, shape: 3, alpha: 0.7 },
  sparkle: { colors: ['#FFE08A', '#FFFFFF', '#FFD35C'], size: [0.22, 0.4], life: [0.5, 0.8], speed: [0.6, 1.6], up: [1.2, 2.4], gravity: 1.5, drag: 1.5, grow: -0.2, shape: 1, alpha: 1 },
  confetti: { colors: ['#F4B8C0', '#F2B233', '#8CC4D6', '#BFE5D3', '#C0485C', '#FBF6EC', '#2C4A6E'], size: [0.08, 0.13], life: [1.1, 1.7], speed: [1.5, 3.6], up: [3, 5.5], gravity: 7, drag: 1.4, grow: 0, shape: 2, alpha: 1 },
  smoke: { colors: ['#EDEAE4', '#D8D4CC', '#FFFFFF'], size: [0.55, 0.85], life: [1.6, 2.2], speed: [0.1, 0.3], up: [1.0, 1.5], gravity: -0.2, drag: 0.6, grow: 1.2, shape: 3, alpha: 0.5 },
  steam: { colors: ['#FFFFFF', '#F0F0F0'], size: [0.4, 0.7], life: [1.0, 1.6], speed: [0.2, 0.6], up: [0.8, 1.4], gravity: -0.3, drag: 1, grow: 0.9, shape: 3, alpha: 0.5 },
  star: { colors: ['#FFD35C', '#FFE9A8'], size: [0.35, 0.6], life: [0.8, 1.2], speed: [2, 4], up: [2, 4], gravity: 4, drag: 1.4, grow: -0.1, shape: 1, alpha: 1 },
  cash: { colors: ['#7CC47F', '#A6DDB0'], size: [0.12, 0.18], life: [0.6, 0.9], speed: [1.5, 3], up: [2, 3.5], gravity: 8, drag: 0.8, grow: 0, shape: 2, alpha: 1 },
  heart: { colors: ['#E8577A', '#F28CA5'], size: [0.3, 0.45], life: [0.9, 1.3], speed: [0.2, 0.6], up: [1.0, 1.6], gravity: -0.4, drag: 1, grow: 0.1, shape: 0, alpha: 1 },
  chimney: { colors: ['#D9D6CF', '#C9C6C0', '#E6E3DC'], size: [0.35, 0.55], life: [2.6, 3.6], speed: [0.04, 0.12], up: [0.45, 0.7], gravity: -0.04, drag: 0.4, grow: 1.8, shape: 3, alpha: 0.3, rides: true },
};

const tmpColor = new THREE.Color();

/**
 * Every particle in the game in one Points draw call: dust on coupling, sparkles on cleaning, confetti on
 * level-up, smoke from the chimney. Fixed-size typed arrays, so emitting never allocates.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly capacity: number;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly shape: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly kind: Uint8Array;
  private cursor = 0;
  private readonly rng = new Rng(99);
  private readonly material: THREE.ShaderMaterial;
  private readonly kinds = Object.keys(SPECS) as ParticleKind[];

  /** How many particles are alive now, and how many the pool holds (the live performance overlay). */
  stats(): { active: number; capacity: number } {
    let active = 0;
    for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) active++;
    return { active, capacity: this.capacity };
  }

  constructor(capacity = 900) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 400 }, uNight: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aShape;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vShape = aShape;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        #include <common>
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float a = 1.0;
          vec3 color = vColor;
          if (vShape > 2.5) {
            // A soft ball of smoke: at night, bright on the side facing the moon (upper left), deep blue below.
            float r = length(p);
            a = 1.0 - smoothstep(0.5, 1.0, r);
            vec3 n = vec3(p.x, -p.y, sqrt(max(0.0, 1.0 - r * r)));
            float lit = max(dot(n, normalize(vec3(-0.55, 0.65, 0.5))), 0.0);
            vec3 moonlit = vColor * mix(vec3(0.22, 0.26, 0.38), vec3(0.78, 0.84, 1.0), lit);
            color = mix(vColor, moonlit, uNight);
          } else if (vShape < 0.5) {
            a = 1.0 - smoothstep(0.55, 1.0, length(p));
          } else if (vShape < 1.5) {
            float ang = atan(p.y, p.x);
            float r = length(p);
            float starR = 0.45 + 0.4 * pow(abs(cos(ang * 2.5)), 3.0);
            a = 1.0 - smoothstep(starR - 0.12, starR, r);
          } else {
            a = step(abs(p.x), 0.8) * step(abs(p.y), 0.55);
          }
          if (a * vAlpha < 0.02) discard;
          gl_FragColor = vec4(color, a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  /** 0 day, 1 night: smoke and dust are lit by the moon at night. */
  setNight(night: number): void {
    this.material.uniforms.uNight.value = night;
  }

  /** Pixels-per-metre scale: viewport height / (2·tan(fov/2)). */
  setScale(scale: number): void {
    this.material.uniforms.uScale.value = scale;
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, count: number, spread = 0.2, velocity?: { x: number; y: number; z: number }): void {
    const spec = SPECS[kind];
    const rng = this.rng;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(spec.speed[0], spec.speed[1]);
      this.position[i * 3] = x + rng.range(-spread, spread);
      this.position[i * 3 + 1] = y + rng.range(-spread, spread) * 0.5;
      this.position[i * 3 + 2] = z + rng.range(-spread, spread);
      this.velocity[i * 3] = Math.cos(angle) * speed + (velocity?.x ?? 0);
      this.velocity[i * 3 + 1] = rng.range(spec.up[0], spec.up[1]) + (velocity?.y ?? 0);
      this.velocity[i * 3 + 2] = Math.sin(angle) * speed + (velocity?.z ?? 0);
      tmpColor.set(rng.pick(spec.colors));
      this.color[i * 3] = tmpColor.r;
      this.color[i * 3 + 1] = tmpColor.g;
      this.color[i * 3 + 2] = tmpColor.b;
      this.baseSize[i] = rng.range(spec.size[0], spec.size[1]);
      this.size[i] = this.baseSize[i];
      this.baseAlpha[i] = spec.alpha;
      this.alpha[i] = spec.alpha;
      this.shape[i] = spec.shape;
      this.maxLife[i] = rng.range(spec.life[0], spec.life[1]);
      this.life[i] = this.maxLife[i];
      this.kind[i] = this.kinds.indexOf(kind);
    }
  }

  /** `ground` is how fast the countryside scrolls past (kinds that ride with it move along at that speed). */
  update(dt: number, ground = 0): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      const spec = SPECS[this.kinds[this.kind[i]]];
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.exp(-spec.drag * dt);
      this.velocity[i * 3] *= drag;
      this.velocity[i * 3 + 1] = this.velocity[i * 3 + 1] * drag - spec.gravity * dt;
      this.velocity[i * 3 + 2] *= drag;
      this.position[i * 3] += this.velocity[i * 3] * dt;
      this.position[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.position[i * 3 + 2] += (this.velocity[i * 3 + 2] + (spec.rides ? ground : 0)) * dt;
      this.size[i] = Math.max(0.01, this.baseSize[i] * (1 + spec.grow * t));
      this.alpha[i] = this.baseAlpha[i] * (t < 0.1 ? t / 0.1 : 1 - Math.max(0, t - 0.6) / 0.4);
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aShape.needsUpdate = true;
  }
}
