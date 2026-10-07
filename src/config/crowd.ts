/**
 * A crowd of individuals (session 23, owner: "the NPCs should be far more dynamic and have more variety"). Each
 * guest type comes in a few looks (skin, hair, coat shade, spectacles, long hair, sometimes no hat) and heights,
 * and while they wait they do things that suit them: check the time, look about, take a call, chat with whoever
 * stands next to them, stretch. Purely for show: none of it touches play (the choices use no game randomness).
 */

/** What someone standing about does (CharacterView actions). */
export type IdleAction = 'watch' | 'look' | 'phone' | 'chat' | 'yawn' | 'read' | 'wave';

export const CROWD = {
  /** Looks per guest type (each a cached body geometry, so this bounds memory: types × variants). */
  variants: 4,
  skinTones: ['#F6D3B8', '#EDBE9A', '#D9A07A', '#C98E68', '#A86E4E', '#7E5038'],
  hairColours: ['#1D1616', '#3A2418', '#5B3A29', '#8C5A32', '#C9A15A', '#B5543A'],
  /** Heights (root scale), shortest and tallest. */
  height: [0.93, 1.06] as [number, number],
  /** Seconds between one idle and the next, and how long one lasts. */
  idleGap: [3, 7] as [number, number],
  idleSeconds: [2.2, 4] as [number, number],
  /** Two people idle this close (metres) may chat together. */
  chatDistance: 1.3,
  chatChance: 0.55,
} as const;

/** What each guest type does while waiting (the first is the most likely). */
export const IDLES: Record<string, IdleAction[]> = {
  student: ['phone', 'look', 'phone', 'yawn'],
  backpacker: ['look', 'look', 'yawn', 'watch'],
  tourist: ['look', 'look', 'wave', 'phone'],
  grandma: ['read', 'look', 'watch'],
  family: ['look', 'chat', 'watch'],
  businessman: ['watch', 'phone', 'phone', 'read'],
  newlyweds: ['chat', 'look', 'chat'],
  vip: ['phone', 'look', 'watch'],
  celebrity: ['wave', 'phone', 'look'],
  royal: ['wave', 'look'],
};
