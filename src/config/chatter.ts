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
  slowService: { icon: 'clock' },
  waitingLong: { icon: 'clock' },
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
