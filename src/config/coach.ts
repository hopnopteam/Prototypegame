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
  /** Session 32: the second passenger's steps show no words, only the arrow and the ring on the floor. */
  silent?: boolean;
}

/**
 * The first-passengers tutorial (session 32, owner: "the player understands the main loop before anything else…
 * 2 to 4 words max… no pop-ups, no Next buttons"): the first passenger is walked through the whole loop step by
 * step (ticket, cash, open the carriage, check in, to their room, bring what they ask for, collect the tip, then a
 * small "Nice!"); the second passenger's steps have the arrow and the ring only. Each step ends when the player does
 * it. Once both are done the tutorial is over for good (each step is a saved flag) and upgrades appear.
 */
export const COACH_STEPS: CoachLineDef[] = [
  { id: 'walk', icon: 'hand', text: 'Drag to walk' },
  { id: 'tickets', icon: 'ticket', text: 'Issue ticket' },
  { id: 'cash', icon: 'cash', text: 'Collect cash' },
  { id: 'tile', icon: 'carriage', text: 'Open carriage' },
  { id: 'key', icon: 'key', text: 'Check in' },
  { id: 'room', icon: 'bed', text: 'Take to room' },
  // The words follow the request ("Bring blanket", "Bring tea"); the icon is the item's own (config/itemIcons.ts).
  { id: 'serve', icon: 'tea', text: 'Bring it' },
  { id: 'tip', icon: 'cash', text: 'Collect cash' },
  { id: 'key2', icon: 'key', text: '', silent: true },
  { id: 'serve2', icon: 'tea', text: '', silent: true },
  { id: 'tip2', icon: 'cash', text: '', silent: true },
];

/** How a request reads in the tutorial's "Bring …" line. */
export const BRING_WORD: Partial<Record<string, string>> = {
  tea: 'tea', coffee: 'coffee', champagne: 'champagne', blanket: 'blanket', pillow: 'pillow', towel: 'towel',
  newspaper: 'paper', breakfast: 'breakfast', snack: 'snacks',
};

export const COACH_HINTS: CoachLineDef[] = [
  { id: 'request', icon: 'tea', text: 'Serve' },
  { id: 'request_fetch', icon: 'tea', text: 'Pick up' },
  { id: 'request_deliver', icon: 'heart', text: 'Deliver' },
  { id: 'dirty', icon: 'broom', text: 'Tidy up' },
  // Session 24, the night shift: shoes left out at lights out.
  { id: 'shoes', icon: 'shoe', text: 'Shine shoes' },
  { id: 'station', icon: 'ticket', text: 'All aboard' },
  // Session 29: the station bell calls the latecomers.
  { id: 'bell', icon: 'bell', text: 'Ring the bell' },
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
  desk: { id: 'g_desk', icon: 'key', text: 'Hand keys' },
  cash: { id: 'g_cash', icon: 'cash', text: 'Grab it' },
  clean: { id: 'g_clean', icon: 'broom', text: 'Tidy up' },
  shine: { id: 'g_shine', icon: 'shoe', text: 'Shine shoes' },
  bell: { id: 'g_bell', icon: 'bell', text: 'Ring the bell' },
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
  { focus: 'lobby', seconds: 2.4, zoom: 1.2, text: 'One tired old carriage…' },
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
