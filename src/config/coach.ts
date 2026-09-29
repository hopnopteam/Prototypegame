import type { IconName } from '../ui/icons';

/**
 * The coach: a short walkthrough and one lesson per mechanic, one short line each (§11: no walls of text).
 * Lines appear right where the action is (a label over the spot, or by the button), never as a banner.
 * Nothing moves on by itself: each step waits until the player has actually done it, says "Nice!", and
 * takes a breath before the next one. A lesson whose moment passes (the train leaves, a guest is served by
 * someone else) hides and comes back the next time; once a job is automated its lesson is retired.
 */
export interface CoachLineDef {
  id: string;
  icon: IconName;
  text: string;
}

export const COACH_STEPS: CoachLineDef[] = [
  { id: 'walk', icon: 'hand', text: 'Drag anywhere to walk' },
  { id: 'checkin', icon: 'ticket', text: 'Stand here to check in' },
  { id: 'cash', icon: 'cash', text: 'Walk over cash to collect' },
  { id: 'tile', icon: 'bed', text: 'Stand here to build' },
];

export const COACH_HINTS: CoachLineDef[] = [
  { id: 'request', icon: 'tea', text: 'Bring what the guest asks for' },
  { id: 'request_fetch', icon: 'tea', text: 'Pick it up here' },
  { id: 'request_deliver', icon: 'heart', text: 'Now bring it to the guest' },
  { id: 'dirty', icon: 'broom', text: 'Walk over the mess to clean' },
  { id: 'station', icon: 'ticket', text: 'Board the guests before the train leaves' },
  { id: 'hire', icon: 'person', text: 'Hire help: they do the chores' },
  { id: 'couple', icon: 'carriage', text: 'Buy a carriage, then choose which' },
  { id: 'refurb', icon: 'paint', text: 'Refurbish: nicer cars earn more' },
  { id: 'workshop', icon: 'megaphone', text: 'Station shop: dress up the train, bring more guests' },
  { id: 'washroom', icon: 'towel', text: 'Towels and rolls come from here' },
  { id: 'map', icon: 'dash', text: 'Tap a carriage to dash there' },
  { id: 'miles', icon: 'miles', text: 'Spend Rail Miles on yourself' },
];

/** While the walkthrough waits for enough cash to build, the coach says what the arrow is pointing at. */
export const COACH_GUIDANCE_LINES: Record<string, CoachLineDef> = {
  desk: { id: 'g_desk', icon: 'ticket', text: 'Check in the next guest' },
  cash: { id: 'g_cash', icon: 'cash', text: 'Collect your cash' },
  clean: { id: 'g_clean', icon: 'broom', text: 'Walk over the mess to clean' },
  fetch: { id: 'g_fetch', icon: 'tea', text: 'Grab what the guest wants' },
  deliver: { id: 'g_deliver', icon: 'heart', text: 'Bring it to the guest' },
  board: { id: 'g_board', icon: 'ticket', text: 'Board the passengers' },
  luggage: { id: 'g_luggage', icon: 'luggage', text: 'Load their luggage' },
};

/**
 * The intro a brand-new player sees after pressing Play: three camera beats with one caption each, then the
 * HUD appears and the train pulls out. Skippable. `focus` picks the shot; `zoom` > 1 is wider.
 */
export interface IntroBeat {
  focus: 'locomotive' | 'lobby' | 'desk';
  seconds: number;
  zoom: number;
  kicker?: string;
  text: string;
}

export const INTRO_BEATS: IntroBeat[] = [
  { focus: 'locomotive', seconds: 2.6, zoom: 1.4, kicker: 'Millbrook · 6:00 am', text: 'Your first shift on the Countryside Local' },
  { focus: 'lobby', seconds: 2.3, zoom: 1.05, text: 'One tired old carriage…' },
  { focus: 'desk', seconds: 2.3, zoom: 0.92, text: '…and a guest at the desk. Let’s get to work!' },
];

/** Seconds between one step being done and the next line appearing (a breath, and the "Nice!"). */
export const COACH_REST_SECONDS = 2.2;
/** Lessons about optional conveniences (the train map, Rail Miles) retire after this long on screen. */
export const COACH_OPTIONAL_SECONDS = 8;
/** The walk gesture only appears if the player has not moved for this long. */
export const COACH_GESTURE_DELAY = 1.2;
