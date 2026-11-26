import * as THREE from 'three';
import { GeoBuilder } from './geo';

/**
 * A guest's pair of shoes, left outside the cabin door at lights out (session 24, the night shift): scuffed brown
 * until someone polishes them, then dark and gleaming. Two shared geometries; one small mesh per cabin.
 */
const cache: { dull?: THREE.BufferGeometry; shined?: THREE.BufferGeometry } = {};

function build(shined: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // Owner: "I am not able to see shoes at all": brighter tan uppers with pale scuffs, a cream lining showing in the
  // opening and a darker sole, so the pair reads against the corridor boards; polished, a deep oxblood with a gleam.
  const leather = shined ? '#5A1F1A' : '#A47A55';
  const sole = shined ? '#140E0C' : '#3E2E25';
  const style = { shade: shined ? 1 : 0.9, surface: shined ? ('varnish' as const) : ('leather' as const) };
  for (const x of [-0.065, 0.065]) {
    // Sole, the shoe's body, its rounded toe, the heel block and the cream lining at the top.
    b.box(x, 0.009, 0, 0.088, 0.018, 0.25, sole, 0, { shade: 0.9 });
    b.box(x, 0.026, -0.1, 0.07, 0.02, 0.05, sole, 0, { shade: 0.9 });
    b.rounded(x, 0.048, -0.015, 0.082, 0.062, 0.19, 0.03, leather, style);
    b.sphere(x, 0.037, 0.087, 0.043, leather, 1, 0.72, style);
    b.box(x, 0.0795, -0.052, 0.052, 0.002, 0.082, '#E9DCC4', 0, { shade: 1 });
    // The laces: a pale cross over the instep.
    b.box(x, 0.0795, 0.005, 0.044, 0.004, 0.012, shined ? '#D9C9A8' : '#EADFC8', 0, { shade: 1 });
    b.box(x, 0.0795, 0.028, 0.04, 0.004, 0.012, shined ? '#D9C9A8' : '#EADFC8', 0, { shade: 1 });
    if (shined) {
      // Polished: a highlight along each toe cap and the side.
      b.box(x + 0.016, 0.073, 0.072, 0.014, 0.004, 0.06, '#FFF1DA', 0, { shade: 1 });
      b.box(x + 0.042, 0.055, -0.02, 0.003, 0.012, 0.12, '#E9C9A6', 0, { shade: 1 });
    } else {
      // Scuffs on the toe and the side.
      b.box(x - 0.012, 0.074, 0.08, 0.02, 0.004, 0.026, '#D6C3A6', 0, { shade: 1 });
      b.box(x + 0.042, 0.042, 0.02, 0.003, 0.016, 0.04, '#CDB89A', 0, { shade: 1 });
    }
  }
  return b.build();
}

export function shoesGeometry(shined: boolean): THREE.BufferGeometry {
  if (shined) return (cache.shined ??= build(true));
  return (cache.dull ??= build(false));
}
