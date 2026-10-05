import * as THREE from 'three';
import { Rng } from '../core/Rng';

/** Bands the fireflies drift over (x across the line, height above the ground): the land verge and fields, the reeds on the bank. */
const BANDS: { x: [number, number]; y: [number, number]; share: number }[] = [
  { x: [3.8, 12.0], y: [0.25, 1.5], share: 0.68 },
  { x: [-7.7, -4.0], y: [0.3, 1.2], share: 0.32 },
];
const COUNT = 220;
/** The stretch of line they cover (world z), wrapped as the countryside scrolls past. */
const Z_MIN = -90;
const Z_MAX = 70;
/** Size on screen in CSS pixels at full glow. */
const SIZE_PX = 5.5;

/**
 * Fireflies over the verges and the reeds at night (session 18, owner: "make the whole world quite lived
 * in"): one draw for all of them, every one animated on the GPU (its own wander, its own slow blink), so the
 * cost on the CPU is a few uniforms a frame. They scroll with the countryside and keep out of the platform
 * while the train is in a station. Hidden by day.
 */
export class Fireflies {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private scroll = 0;

  constructor() {
    const rng = new Rng(5150);
    const position = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
      const band = rng.next() < BANDS[0].share ? BANDS[0] : BANDS[1];
      position[i * 3] = rng.range(band.x[0], band.x[1]);
      position[i * 3 + 1] = rng.range(band.y[0], band.y[1]);
      position[i * 3 + 2] = rng.range(Z_MIN, Z_MAX);
      seed[i * 2] = rng.range(0, Math.PI * 2);
      seed[i * 2 + 1] = rng.range(0.6, 1.4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uNight: { value: 0 },
        uPx: { value: SIZE_PX },
        uHide: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime;
        uniform float uScroll;
        uniform float uNight;
        uniform float uPx;
        uniform vec4 uHide;
        varying float vGlow;
        void main() {
          vec3 p = position;
          float t = uTime * aSeed.y;
          // Wrap along the line as the countryside scrolls past, then wander a little in a slow loop.
          p.z = ${Z_MIN.toFixed(1)} + mod(p.z - ${Z_MIN.toFixed(1)} + uScroll, ${(Z_MAX - Z_MIN).toFixed(1)});
          p.x += sin(t * 0.7 + aSeed.x) * 0.35;
          p.y += sin(t * 1.3 + aSeed.x * 2.0) * 0.18;
          p.z += cos(t * 0.5 + aSeed.x) * 0.4;
          // A slow blink: mostly dim, glowing for a moment now and then.
          float blink = pow(max(0.0, sin(uTime * 0.9 * aSeed.y + aSeed.x * 3.0)), 6.0);
          float hidden = step(uHide.x, p.x) * step(p.x, uHide.y) * step(uHide.z, p.z) * step(p.z, uHide.w);
          vGlow = (0.3 + 0.7 * blink) * uNight * (1.0 - hidden);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * (0.55 + 0.45 * blink) * step(0.01, vGlow);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float a = (1.0 - smoothstep(0.0, 1.0, length(q))) * vGlow;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.42) * a, a);
        }
      `,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 19;
  }

  /**
   * Advances the scroll and the glow. `hide` is the platform's region while a station is alongside (null
   * otherwise); `pixelRatio` keeps them the same size on every screen.
   */
  update(dt: number, speed: number, night: number, pixelRatio: number, hide: { x0: number; x1: number; z0: number; z1: number } | null): void {
    this.scroll = (this.scroll + speed * dt) % (Z_MAX - Z_MIN);
    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uScroll.value = this.scroll;
    u.uNight.value = Math.max(0, (night - 0.5) * 2);
    u.uPx.value = SIZE_PX * pixelRatio;
    const h = u.uHide.value as THREE.Vector4;
    if (hide) h.set(hide.x0, hide.x1, hide.z0, hide.z1);
    else h.set(0, 0, 0, 0);
    this.points.visible = u.uNight.value > 0.01;
  }
}
