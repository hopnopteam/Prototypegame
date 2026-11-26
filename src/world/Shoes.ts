import * as THREE from 'three';
import { GeoBuilder } from './geo';
import type { Recolor } from './models/library';

/**
 * A guest's pair of shoes, left outside the cabin door at lights out (session 24, the night shift): scuffed until
 * someone polishes them, then deep and gleaming. Two shared geometries; one small mesh per cabin.
 *
 * Owner (after De-Slop B: "the shoes look way too weird… far more realistic but rooted into the game art style"): the
 * pair is the figures' own Blender-made smart shoe (`fig_smart`, the shape every guest wears: a rounded toe cap, a
 * waisted sole, a heel and a laced vamp), at a grown-up's size, set down the way someone leaves a pair by a door (side
 * by side, one a little ahead and turned out), on a dark lining. Dull: dusty tan with pale laces and a worn sole.
 * Polished: oxblood with a varnish that catches the light, and dark laces.
 */
const cache: { dull?: THREE.BufferGeometry; shined?: THREE.BufferGeometry } = {};

/** The figures' kit keys (see CharacterParts' `figKeys`): red the inside, green the leather, blue the sole, yellow the laces. */
const BAND = { sat: [0.6, 1] as [number, number], val: [0.2, 1] as [number, number] };
function keys(lining: string, leather: string, sole: string, lace: string): Recolor[] {
  return [
    { hue: [345, 15], ...BAND, ref: '#FF2A2A', to: lining },
    { hue: [105, 135], ...BAND, ref: '#2AFF2A', to: leather },
    { hue: [225, 255], ...BAND, ref: '#2A2AFF', to: sole },
    { hue: [45, 75], ...BAND, ref: '#FFFF2A', to: lace },
  ];
}

/** The kit shoe is 0.186 m long; a grown-up's shoe left by the door is about a quarter of a metre before SHOE_SCALE. */
const SCALE = 1.34;

function build(shined: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const recolor = shined ? keys('#2A1612', '#5E1F1A', '#1A100C', '#2A1A14') : keys('#3A2A20', '#9A7250', '#4A3A30', '#E6D8BE');
  const surface = shined ? ('varnish' as const) : ('leather' as const);
  // Left a little behind and turned in, right a touch ahead and turned out: a pair set down, not two boxes.
  b.model('fig_smart', -0.068, 0, -0.012, 0.1, SCALE, SCALE, SCALE, { recolor, shade: shined ? 1 : 0.9, surface });
  b.model('fig_smart', 0.068, 0, 0.018, -0.16, SCALE, SCALE, SCALE, { recolor, shade: shined ? 1 : 0.9, surface });
  return b.build();
}

export function shoesGeometry(shined: boolean): THREE.BufferGeometry {
  if (shined) return (cache.shined ??= build(true));
  return (cache.dull ??= build(false));
}
