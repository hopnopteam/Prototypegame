import * as THREE from 'three';
import { GeoBuilder } from './geo';

/**
 * A guest's pair of shoes, left outside the cabin door at lights out (session 24, the night shift): scuffed brown
 * until someone polishes them, then dark and gleaming. Two shared geometries; one small mesh per cabin.
 */
const cache: { dull?: THREE.BufferGeometry; shined?: THREE.BufferGeometry } = {};

function build(shined: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const leather = shined ? '#3A2318' : '#8A6A55';
  const sole = shined ? '#1E1612' : '#5B4A40';
  const style = { shade: shined ? 1 : 0.85, surface: shined ? ('varnish' as const) : ('leather' as const) };
  for (const x of [-0.06, 0.06]) {
    // Sole, the shoe's body, its rounded toe and the dark opening at the top.
    b.box(x, 0.008, 0, 0.085, 0.016, 0.24, sole, 0, { shade: 0.9 });
    b.rounded(x, 0.045, -0.015, 0.08, 0.06, 0.19, 0.03, leather, style);
    b.sphere(x, 0.035, 0.085, 0.042, leather, 1, 0.7, style);
    b.box(x, 0.0765, -0.05, 0.05, 0.002, 0.08, '#20181A', 0, { shade: 1 });
    // Polished: a highlight along each toe cap.
    if (shined) b.box(x + 0.015, 0.07, 0.07, 0.012, 0.004, 0.06, '#F3E3C8', 0, { shade: 1 });
  }
  return b.build();
}

export function shoesGeometry(shined: boolean): THREE.BufferGeometry {
  if (shined) return (cache.shined ??= build(true));
  return (cache.dull ??= build(false));
}
