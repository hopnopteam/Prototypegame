import type { IconName } from '../ui/icons';

/**
 * How passengers react (§11, session 11: pictures, not sentences). A reaction is an icon in a small speech
 * bubble over the guest: a smile, a heart, a frown, a clock for slow service, a crossed-out towel. The
 * Feedback system decides whether anyone reacts at all (rarely, never two at once, the same kind of
 * reaction at most every so often). Critical ones only start once the soft cues do. Pure data.
 */
export type ChatterSituation =
  | 'boardRundown' | 'boardRepaired' | 'boardCosy' | 'boardLuxury' | 'boardFamous' | 'boardGoodBuzz' | 'boardBadBuzz'
  | 'fastService' | 'slowService' | 'waitingLong' | 'deskWaiting'
  | 'reviewGood' | 'reviewBad'
  | 'missedTrain' | 'noBed' | 'noWashroom' | 'emptyWashroom' | 'rush';

export interface Reaction {
  icon: IconName;
  /** Drawn crossed out (no towels, no washroom). */
  crossed?: boolean;
}

export const REACTIONS: Record<ChatterSituation, Reaction> = {
  // Checking in: the state of the carriage speaks for itself.
  boardRundown: { icon: 'frown' },
  boardRepaired: { icon: 'smile' },
  boardCosy: { icon: 'heart' },
  boardLuxury: { icon: 'star' },
  // Word gets around: the league table and the service lately.
  boardFamous: { icon: 'trophy' },
  boardGoodBuzz: { icon: 'smile' },
  boardBadBuzz: { icon: 'frown' },
  // Requests.
  fastService: { icon: 'bolt' },
  slowService: { icon: 'frown' },
  waitingLong: { icon: 'frown' },
  deskWaiting: { icon: 'ticket' },
  // Getting off: a one-look review.
  reviewGood: { icon: 'heart' },
  reviewBad: { icon: 'frown' },
  // Platform and train status.
  missedTrain: { icon: 'frown' },
  noBed: { icon: 'noroom' },
  noWashroom: { icon: 'bath', crossed: true },
  emptyWashroom: { icon: 'towel', crossed: true },
  rush: { icon: 'bolt' },
};

/**
 * Session 35 (owner: "good reactions from the passengers… emoji or words that give that dopamine rush when they do
 * things right"): what a passenger calls out when the conductor serves them well, a word or two in a bouncy gold
 * float over them. Each pool is used in turn (no game randomness, so the simulation is unchanged); staff work stays
 * quiet. `item` names the thing brought, so the words fit it ("So cosy!" for a blanket).
 */
export const PRAISE = {
  /** Brought within `service.speedySeconds`. */
  speedy: ['Speedy!', 'Super fast!', 'Lightning!', 'Wow, quick!'],
  /** Brought within `service.quickSeconds`: the item's own word, or one of these. */
  quick: ['Lovely!', 'Perfect!', 'Wonderful!', 'Brilliant!', 'Marvellous!'],
  /** Brought in good time (before it was late). */
  onTime: ['Thank you!', 'Cheers!', 'Ta!'],
  item: {
    tea: ['Perfect cuppa!', 'Just right!'],
    coffee: ['Ahh, coffee!', 'Just right!'],
    champagne: ['Cheers!', 'Bubbly!'],
    blanket: ['So cosy!', 'Toasty!'],
    pillow: ['So soft!', 'Comfy!'],
    towel: ['So fluffy!', 'Lovely!'],
    newspaper: ['Splendid!', 'Thank you!'],
    breakfast: ['Delicious!', 'Yum!'],
    turndown: ['Chocolate!', 'How lovely!'],
  } as Record<string, string[]>,
  /** A cabin key handed over at the desk. */
  key: ['Thank you!', 'Lovely!', 'Wonderful!'],
  /** A room tidied by the conductor. */
  tidy: ['Spotless!', 'Sparkling!', 'Gleaming!'],
  /** Shoes polished on the night shift. */
  shoes: ['Shiny!', 'Gleaming!'],
  /** A venue order served by the conductor, by venue. */
  venue: {
    cafe: ['Yum!', 'Delicious!', 'Perfect brew!'],
    dining: ['Delicious!', 'Magnificent!', 'Divine!'],
    bar: ['Cheers!', 'Perfect mix!'],
    dome: ['What a view!', 'Gorgeous!'],
    cinema: ['Bravo!', 'Popcorn time!'],
  } as Record<string, string[]>,
};
