import type { IconName } from '../ui/icons';

/**
 * The coach: a short walkthrough and one cue per mechanic (§11, session 11: show, don't tell). The guide
 * arrow and the glowing spot are the instruction; a cue adds an icon and at most three words, which fold
 * away after a few seconds (Ui.ts), leaving just the icon. Nothing moves on by itself: each step waits
 * until the player has done it, gets a tick, and takes a breath before the next. A lesson whose moment
 * passes hides and comes back the next time; once a job is automated its lesson is retired.
 */
export interface CoachLineDef {
  id: string;
  icon: IconName;
  text: string;
}

export const COACH_STEPS: CoachLineDef[] = [
  { id: 'walk', icon: 'hand', text: 'Drag to walk' },
  // Session 19: the game opens outside on the platform; the first ticket is collected at the door.
  { id: 'tickets', icon: 'ticket', text: 'Collect tickets' },
  { id: 'checkin', icon: 'ticket', text: 'Check in' },
  { id: 'cash', icon: 'cash', text: 'Grab it' },
  { id: 'tile', icon: 'bed', text: 'Build' },
];

export const COACH_HINTS: CoachLineDef[] = [
  { id: 'request', icon: 'tea', text: 'Serve' },
  { id: 'request_fetch', icon: 'tea', text: 'Pick up' },
  { id: 'request_deliver', icon: 'heart', text: 'Deliver' },
  { id: 'dirty', icon: 'broom', text: 'Tidy up' },
  // Session 22, turning a room around: used bedding to the linen cupboard, a fresh set from it, make the bed.
  { id: 'dirty_laundry', icon: 'laundry', text: 'Laundry' },
  { id: 'dirty_linen', icon: 'bedding', text: 'Fresh sheets' },
  { id: 'dirty_make', icon: 'bedding', text: 'Make bed' },
  { id: 'station', icon: 'ticket', text: 'All aboard' },
  { id: 'hire', icon: 'person', text: 'Hire help' },
  { id: 'couple', icon: 'carriage', text: 'New carriage' },
  { id: 'refurb', icon: 'paint', text: 'Upgrade' },
  { id: 'class', icon: 'crown', text: 'Upgrade class' },
  { id: 'turndown', icon: 'turndown', text: 'Turn down' },
  { id: 'workshop', icon: 'megaphone', text: 'Station shop' },
  { id: 'washroom', icon: 'towel', text: 'Restock' },
  // Session 20: the venue carriages, each taught the first time a guest waits there.
  { id: 'cafe', icon: 'latte', text: 'Brew coffee' },
  { id: 'dining', icon: 'meal', text: 'Serve dinner' },
  { id: 'clear', icon: 'broom', text: 'Clear table' },
  { id: 'bar', icon: 'cocktail', text: 'Mix drinks' },
  { id: 'dome', icon: 'binoculars', text: 'Show in' },
  { id: 'cinema', icon: 'film', text: 'Start the film' },
  { id: 'map', icon: 'dash', text: 'Tap to dash' },
  { id: 'miles', icon: 'miles', text: 'Upgrades' },
];

/** While the walkthrough waits for enough cash to build, the coach names what the arrow points at. */
export const COACH_GUIDANCE_LINES: Record<string, CoachLineDef> = {
  desk: { id: 'g_desk', icon: 'ticket', text: 'Check in' },
  cash: { id: 'g_cash', icon: 'cash', text: 'Grab it' },
  clean: { id: 'g_clean', icon: 'broom', text: 'Tidy up' },
  fetch: { id: 'g_fetch', icon: 'tea', text: 'Pick up' },
  deliver: { id: 'g_deliver', icon: 'heart', text: 'Deliver' },
  board: { id: 'g_board', icon: 'ticket', text: 'All aboard' },
  luggage: { id: 'g_luggage', icon: 'luggage', text: 'Load bags' },
};

/**
 * The intro a brand-new player sees after pressing Play: three camera beats with one caption each, then the
 * HUD appears and the train pulls out. Skippable. `focus` picks the shot; `zoom` > 1 is wider.
 */
export interface IntroBeat {
  focus: 'locomotive' | 'lobby' | 'conductor';
  seconds: number;
  zoom: number;
  kicker?: string;
  text: string;
}

export const INTRO_BEATS: IntroBeat[] = [
  { focus: 'locomotive', seconds: 2.6, zoom: 1.4, kicker: 'Millbrook · 11:40 pm', text: 'The night train is boarding' },
  { focus: 'lobby', seconds: 2.3, zoom: 1.05, text: 'One tired old carriage…' },
  { focus: 'conductor', seconds: 2.3, zoom: 0.92, text: '…and passengers waiting!' },
];

/** Seconds between one step being done and the next cue appearing (a breath, and the tick). */
export const COACH_REST_SECONDS = 2.2;
/**
 * After the walkthrough, a longer breath between one lesson and the next (session 15, owner: "not everything
 * all at once"): the player gets to enjoy what they just learnt before the next thing is pointed out.
 */
export const COACH_LESSON_GAP_SECONDS = 9;
/** Lessons about optional conveniences (the train map, Rail Miles) retire after this long on screen. */
export const COACH_OPTIONAL_SECONDS = 8;
/** The walk gesture only appears if the player has not moved for this long. */
export const COACH_GESTURE_DELAY = 1.2;
