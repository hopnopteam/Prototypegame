import type { IconName } from '../ui/icons';

/**
 * The coach: a tiny walkthrough and one-time hints, one short line each (§11: no walls of text). Lines
 * appear right where the action is (a label over the spot, or by the button), never as a banner. The
 * first four teach the loop in order; hints appear the first time a mechanic shows up, then never again.
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
  { id: 'dirty', icon: 'broom', text: 'Walk over the mess to clean' },
  { id: 'station', icon: 'ticket', text: 'Board the guests before the train leaves' },
  { id: 'hire', icon: 'person', text: 'Hire help: they do the chores' },
  { id: 'couple', icon: 'carriage', text: 'Buy a carriage, then choose which' },
  { id: 'refurb', icon: 'paint', text: 'Refurbish: nicer cars earn more' },
  { id: 'washroom', icon: 'towel', text: 'Towels and rolls come from here' },
  { id: 'map', icon: 'dash', text: 'Tap a carriage to dash there' },
  { id: 'miles', icon: 'miles', text: 'Spend Rail Miles on yourself' },
];

/** Seconds a hint stays up (at least the minimum, even if it resolves at once). */
export const COACH_HINT_SECONDS = 5;
export const COACH_HINT_MIN_SECONDS = 2.5;
/** The walk gesture only appears if the player has not moved for this long. */
export const COACH_GESTURE_DELAY = 1.2;
