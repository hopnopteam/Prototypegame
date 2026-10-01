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
 * A starting tier for this device. Phones start at MEDIUM at most (session 14: iPhones reported "Apple GPU"
 * and got HIGH, whose multisampling, soft shadows and second reflection pass cost frames for almost no visible
 * difference; every tier looks the same by design). HIGH and ULTRA stay one tap away in Settings. `auto` also
 * steps down on its own if the frame rate stays low, but never up.
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
    // Safari reports a capped core count and no memory on every iPhone, so those say nothing about Apple chips.
    const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || /Apple/i.test(gpu);
    if (memory <= 2 || maxTexture < 4096 || (!apple && cores <= 4)) return 'low';
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
