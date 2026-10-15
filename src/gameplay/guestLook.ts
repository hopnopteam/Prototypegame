import type { ArchetypeDef } from '../config/content';
import { ARCHETYPES } from '../config/content';
import { CROWD } from '../config/crowd';
import type { CharacterLook } from '../world/CharacterView';

/**
 * One of a guest type's few looks (session 23): look 0 is the type's own; the others change the skin tone, the
 * hair (never a grandma's silver), the coat's shade, add spectacles or long hair, and sometimes leave the hat off.
 * The bounded set keeps the body geometries cached (types × variants).
 */
export function guestLook(base: CharacterLook, archetype: ArchetypeDef, v: number): CharacterLook {
  if (v === 0) return base;
  const a = ARCHETYPES.indexOf(archetype);
  const silver = /^#(E|F)/i.test(archetype.colors.hair);
  const casualHat = base.hat === 'cap' || base.hat === 'beanie' || base.hat === 'boater';
  return {
    ...base,
    skin: CROWD.skinTones[(a * 3 + v * 2) % CROWD.skinTones.length],
    hair: silver ? base.hair : CROWD.hairColours[(a + v * 2) % CROWD.hairColours.length],
    body: v === 2 ? shadeHex(base.body, 18) : v === 3 ? shadeHex(base.body, -16) : base.body,
    hat: v === 3 && casualHat ? 'none' : base.hat,
    glasses: base.glasses || (a + v) % 3 === 0,
    hairStyle: base.hairStyle === 'bun' ? 'bun' : CROWD.hairStyles[(a * 2 + v) % CROWD.hairStyles.length],
  };
}

/** A hex colour lightened (+) or darkened (−) by `amount` per channel. */
function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

