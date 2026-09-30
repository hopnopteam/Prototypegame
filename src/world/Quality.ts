import type * as THREE from 'three';
import { QUALITY_TIERS, VISUALS, type QualityTier, type TierSettings } from '../config/visuals';

export type QualitySetting = QualityTier | 'auto';

/** What the device tells us about its graphics chip (empty when the browser hides it). */
export function gpuName(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

/**
 * A starting tier for this device. Deliberately cautious on phones (the 3 GB mid-range target gets MEDIUM):
 * `auto` also steps down on its own if the frame rate stays low, but never up, so a guess that is too high
 * costs a few seconds while one that is too low would cost the look for good.
 */
export function detectTier(renderer: THREE.WebGLRenderer): QualityTier {
  const gpu = gpuName(renderer);
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) return 'low';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency || 4;
  const touch = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const maxTexture = renderer.capabilities.maxTextureSize;
  if (touch) {
    if (memory <= 2 || cores <= 4 || maxTexture < 4096) return 'low';
    // Apple GPUs and recent Adreno / Mali / Xclipse chips handle reflections and soft shadows.
    if (/Apple/i.test(gpu) && memory >= 4) return 'high';
    if (/Adreno \(TM\) (7\d\d|8\d\d)|Adreno \(TM\) 6[6-9]\d|Mali-G(7[1-9]|[89]\d|7\d\d)|Immortalis|Xclipse/i.test(gpu)) return 'high';
    return 'medium';
  }
  // Desktops: integrated graphics get HIGH, anything else ULTRA.
  if (/Intel|UHD|HD Graphics|Iris(?! Xe)/i.test(gpu) && !/Arc/i.test(gpu)) return 'high';
  if (memory <= 4 && cores <= 4) return 'high';
  return 'ultra';
}

export function tierSettings(tier: QualityTier): TierSettings {
  return VISUALS.quality.tiers[tier];
}

/** The tier below (LOW stays LOW). */
export function lowerTier(tier: QualityTier): QualityTier {
  return QUALITY_TIERS[Math.max(0, QUALITY_TIERS.indexOf(tier) - 1)];
}

export function isTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as string[]).includes(value);
}
