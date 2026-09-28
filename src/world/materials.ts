import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Shared materials. Everything static is vertex-coloured Lambert with flat shading: cheap on phones and it
 * gives the faceted low-poly look. Night warmth is a single emissive uniform per material, not extra lights.
 */
export const MATERIALS = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  /** Interior floors: glow warmly at night so the train reads as lit from inside. */
  floor: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(PALETTE.windowNight), emissiveIntensity: 0 }),
  windows: new THREE.MeshLambertMaterial({ color: PALETTE.windowDay, emissive: new THREE.Color(PALETTE.windowNight), emissiveIntensity: 0 }),
  lamp: new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow }),
  character: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
  lockedOverlay: new THREE.MeshBasicMaterial({ color: '#3A2E2A', transparent: true, opacity: 0.35, depthWrite: false }),
  dirt: new THREE.MeshBasicMaterial({ color: '#8A6A45', transparent: true, opacity: 0.85, depthWrite: false }),
};

/** 0 = day, 1 = full night. */
export function setNightAmount(amount: number): void {
  MATERIALS.floor.emissiveIntensity = 0.42 * amount;
  MATERIALS.windows.emissiveIntensity = 1.25 * amount;
  MATERIALS.windows.color.set(amount > 0.5 ? '#6A5A48' : PALETTE.windowDay);
}

export const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.34, 16).rotateX(-Math.PI / 2);

/**
 * Radial-fill ring for walk-over zones: a soft outline that sweeps clockwise as the action completes.
 * One tiny shader instead of rebuilding ring geometry every frame.
 */
export function createZoneMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uFill: { value: new THREE.Color(PALETTE.zoneActive) },
      uProgress: { value: 0 },
      uPulse: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uFill;
      uniform float uProgress;
      uniform float uPulse;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      const float PI = 3.14159265;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ring = smoothstep(0.74, 0.8, r) * (1.0 - smoothstep(0.94, 1.0, r));
        float angle = atan(p.x, p.y);
        float a = (angle + PI) / (2.0 * PI);
        float filled = step(a, uProgress) * step(0.001, uProgress);
        float disc = (1.0 - smoothstep(0.72, 0.76, r)) * filled;
        float glow = uPulse * (0.18 + 0.12 * sin(uTime * 6.0)) * (1.0 - smoothstep(0.0, 0.8, r));
        vec3 color = mix(uColor, uFill, max(filled * ring, disc));
        float alpha = max(ring * (0.85 + 0.15 * filled), disc * 0.55) + glow;
        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });
}
