import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const welds = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * Session 32: a geometry's triangles with their shared corners welded (an indexed copy, cached). GeoBuilder's parts
 * come apart into three corners a triangle; welded, a smooth head or sleeve runs the vertex shader 4–5 times less and
 * takes about a third of the memory. Indexed geometry comes back as it is.
 */
export function welded(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.getIndex()) return geometry;
  let w = welds.get(geometry);
  if (!w) {
    w = mergeVertices(geometry, 1e-4);
    welds.set(geometry, w);
  }
  return w;
}
