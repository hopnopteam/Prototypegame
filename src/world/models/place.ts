import type { Rect } from '../../core/types';
import type { GeoBuilder } from '../geo';
import type { PropDef } from '../layout';
import { modelEntry } from './library';

/**
 * Session 49–50: a KayKit seat (the couch or the armchair) fitted to a prop's rect, its back against the wall the prop
 * faces away from, the upholstery, cushions and wood in our colours. Shared by the cabins and the venues.
 */
export function seatModel(b: GeoBuilder, id: 'couch' | 'armchair', r: Rect, facing: PropDef['facing'], floorY: number, height: number, cover: string, cushions: string, wood: string, surface: 'fabric' | 'velvet' | 'leather' = 'fabric'): void {
  const e = modelEntry(id);
  // The model's back is at its min z (tall −1): turned a quarter so its back meets x0 (facing right) or x1.
  const back = e.tall < 0 ? 1 : -1;
  // Session 54: a seat can also face along the room (`rear` toward +z, `front` toward −z), its back to the end walls.
  const along = facing === 'front' || facing === 'rear';
  const rotY = along
    ? ((facing === 'rear') === (back > 0) ? 0 : Math.PI)
    : facing === 'left' ? -back * Math.PI / 2 : back * Math.PI / 2;
  const sx = along ? (r.x1 - r.x0) / (e.max[0] - e.min[0]) : (r.z1 - r.z0) / (e.max[0] - e.min[0]);
  const sz = along ? (r.z1 - r.z0) / (e.max[2] - e.min[2]) : (r.x1 - r.x0) / (e.max[2] - e.min[2]);
  const sy = height / (e.max[1] - e.min[1]);
  b.model(id, (r.x0 + r.x1) / 2, floorY, (r.z0 + r.z1) / 2, rotY, sx, sy, sz, {
    recolor: [
      { hue: [20, 55], sat: [0.4, 1], val: [0.75, 1], ref: '#fbb856', to: cover },
      { hue: [190, 230], ref: '#68a8d4', to: cushions },
      { hue: [0, 30], val: [0, 0.7], ref: '#8a4a37', to: wood },
    ],
    surface,
  });
}
