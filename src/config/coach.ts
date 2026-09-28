import type { IconName } from '../ui/icons';

/**
 * The coach: a tiny walkthrough and one-time hints, one short line each (§11: no walls of text). The first
 * four teach the loop in order; hints appear the first time a new mechanic shows up, then never again.
 */
export interface CoachLineDef {
  id: string;
  icon: IconName;
  text: string;
}

export const COACH_STEPS: CoachLineDef[] = [
  { id: 'walk', icon: 'dash', text: 'Drag anywhere to walk' },
  { id: 'checkin', icon: 'ticket', text: 'Stand by the desk to check the guest in' },
  { id: 'cash', icon: 'cash', text: 'Walk over the cash to scoop it up' },
  { id: 'tile', icon: 'bed', text: 'Stand on the tile to build Cabin 2' },
];

export const COACH_HINTS: CoachLineDef[] = [
  { id: 'request', icon: 'tea', text: 'A guest wants something: grab it from the counter' },
  { id: 'dirty', icon: 'broom', text: 'Guests leave a mess: walk over the spots to clean' },
  { id: 'station', icon: 'clock', text: 'Station! Board everyone and load their bags' },
  { id: 'hire', icon: 'person', text: 'Hire staff and they do the chores for you' },
  { id: 'couple', icon: 'carriage', text: 'Buy the next carriage at the back of the train' },
  { id: 'refurb', icon: 'paint', text: 'Refurbish: a nicer carriage earns more' },
  { id: 'washroom', icon: 'towel', text: 'Washrooms need towels and rolls from the Supply Car' },
  { id: 'map', icon: 'dash', text: 'Tap a carriage on the train map to dash there' },
  { id: 'gazette', icon: 'news', text: 'You made the papers! Tap the newspaper to read' },
  { id: 'miles', icon: 'miles', text: 'Spend Rail Miles on yourself: tap the miles button' },
];

/** Seconds a hint stays up (at least the minimum, even if it resolves at once). */
export const COACH_HINT_SECONDS = 6;
export const COACH_HINT_MIN_SECONDS = 2.5;
