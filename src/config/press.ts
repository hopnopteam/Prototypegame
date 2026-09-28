/**
 * The press content pack: the in-universe world that notices your train. Everything here is data, so new
 * routes, seasons and brand events can bring their own rivals, headlines, interviews and awards.
 *
 * Headline text takes {tokens}: {train} (the player's name for the train), {station}, {rival}, {n},
 * {livery}, {tier}, {carriage}, {rank}, {quote}, {award}, {story}.
 */

export interface Rival {
  name: string;
  /** Reputation (route stars) needed to overtake them. */
  reputation: number;
  /** One line of colour for the league table. */
  blurb: string;
  livery: string;
}

/** The Countryside League. The player starts at the bottom; overtaking the Orient Belle makes you #1. */
export const RIVALS: Rival[] = [
  { name: 'Puffing Billy', reputation: 30, blurb: 'Mostly steam, some train.', livery: '#8C7A6B' },
  { name: 'Midnight Mail', reputation: 140, blurb: 'Carries letters. Occasionally people.', livery: '#4A4E69' },
  { name: 'Highland Rambler', reputation: 290, blurb: 'Tartan seats, strong opinions.', livery: '#5E7F5A' },
  { name: 'Duchess of Dover', reputation: 470, blurb: 'Serves tea at exactly 4 o\'clock.', livery: '#8E6A8C' },
  { name: 'The Silver Arrow', reputation: 690, blurb: 'Fast, shiny, a little smug.', livery: '#9AA3AD' },
  { name: 'The Blue Pullman', reputation: 940, blurb: 'Old money on new rails.', livery: '#34507A' },
  { name: 'Orient Belle', reputation: 1240, blurb: 'Five-time Golden Whistle winner.', livery: '#7A2E3A' },
];

/** Offered on the naming card; the player can type their own. */
export const TRAIN_NAME_SUGGESTIONS = ['The Night Owl', 'Silver Swallow', 'Moonlight Limited', 'The Dandelion', 'Lucky Clover', 'The Starling'];
export const TRAIN_NAME_MAX = 22;
/** Used until the player names the train (and if they leave the field empty). */
export const DEFAULT_TRAIN_NAME = 'The Night Express';

/**
 * Only big, visible moments make the front page (and each one pays): naming the train, every new carriage,
 * a luxury refit, a new livery, breaking into the top three, topping the league, a hundred passengers.
 */
export type PressTrigger = 'named' | 'coupling' | 'refurb3' | 'livery' | 'topThree' | 'champion' | 'guests100' | 'story';

export interface HeadlineDef {
  headline: string;
  body: string;
}

/** One or more variants per trigger; a variant is picked by how many times the trigger has fired. */
export const HEADLINES: Record<PressTrigger, HeadlineDef[]> = {
  named: [{ headline: 'A New Sleeper for the Countryside!', body: '{train} rattles out of Millbrook with one old carriage and a very determined conductor.' }],
  coupling: [
    { headline: '{train} Grows a Carriage!', body: 'The {carriage} rolled in with a clunk heard two fields away.' },
    { headline: '{train} Is Getting Longer!', body: 'A {carriage} joins the train. Station masters are measuring their platforms.' },
    { headline: 'Now {n} Carriages Long!', body: 'The {carriage} couples on. "She used to be one old carriage," a porter recalls.' },
  ],
  refurb3: [{ headline: 'Velvet and Brass!', body: 'The {carriage} is refitted in walnut and brass. The Orient Belle is said to be "not worried". She is worried.' }],
  livery: [{ headline: '{train} Unveils a New Look!', body: 'Fresh {livery} paint to match a growing name. Trainspotters have started waving.' }],
  topThree: [{ headline: 'Into the Top Three!', body: '{train} passes {rival} and joins the best sleepers on the line.' }],
  champion: [{ headline: 'Number One!', body: '{train} tops the Countryside League. From one old carriage to the best sleeper on the line.' }],
  guests100: [{ headline: 'One Hundred Happy Sleepers!', body: '"I slept like a log," said a man who is, professionally, a lumberjack.' }],
  story: [{ headline: '{story}', body: 'A regular passenger\'s journey comes to a happy end aboard {train}.' }],
};

/** What each front page pays when you read it (cash scales with the train's length). */
export const FRONT_PAGE_REWARDS: Record<PressTrigger, { gems?: number; railMiles?: number; cashPerCarriage?: number }> = {
  named: { gems: 5 },
  coupling: { cashPerCarriage: 30 },
  refurb3: { gems: 10 },
  livery: { railMiles: 2 },
  topThree: { gems: 10 },
  champion: { gems: 25 },
  guests100: { gems: 10 },
  story: { railMiles: 2 },
};

/** A rival at or above this rank is front-page news when you pass them. */
export const TOP_RANK_NEWS = 3;

export type PerkKind = 'tipBonus' | 'fareBonus' | 'speedBonus';

export interface InterviewAnswer {
  text: string;
  perk: { kind: PerkKind; amount: number; label: string };
}

export interface InterviewDef {
  level: number;
  question: string;
  answers: InterviewAnswer[];
}

/** Rails Tonight: a TV interview after these route levels. Every answer is a good answer. */
export const INTERVIEWS: InterviewDef[] = [
  {
    level: 2,
    question: 'A new sleeper on the country line! What makes a good night train?',
    answers: [
      { text: 'Tea, served before you ask.', perk: { kind: 'tipBonus', amount: 0.06, label: 'Tips +6%' } },
      { text: 'Fair fares for a fine bed.', perk: { kind: 'fareBonus', amount: 0.05, label: 'Fares +5%' } },
      { text: 'A conductor who never stops moving.', perk: { kind: 'speedBonus', amount: 0.05, label: 'Walk +5%' } },
    ],
  },
  {
    level: 4,
    question: 'The Orient Belle calls you "a local line with ideas". Your reply?',
    answers: [
      { text: 'See you at the Golden Whistles.', perk: { kind: 'fareBonus', amount: 0.06, label: 'Fares +6%' } },
      { text: 'Our passengers would disagree.', perk: { kind: 'tipBonus', amount: 0.08, label: 'Tips +8%' } },
      { text: 'Local, and proud of it.', perk: { kind: 'speedBonus', amount: 0.06, label: 'Walk +6%' } },
    ],
  },
  {
    level: 6,
    question: 'From one rusty carriage to this. What\'s next?',
    answers: [
      { text: 'More carriages. Always more.', perk: { kind: 'fareBonus', amount: 0.08, label: 'Fares +8%' } },
      { text: 'A royal passenger, one day.', perk: { kind: 'tipBonus', amount: 0.1, label: 'Tips +10%' } },
      { text: 'Number one in the league.', perk: { kind: 'speedBonus', amount: 0.08, label: 'Walk +8%' } },
    ],
  },
];

export type AwardStat = 'always' | 'perfectStops' | 'requests' | 'guests' | 'rankOne';

export interface AwardDef {
  id: string;
  name: string;
  /** Shown while you still need it: what earns it. */
  hint: string;
  stat: AwardStat;
  target: number;
  reward: { gems: number; railMiles: number };
}

export interface CeremonyDef {
  level: number;
  title: string;
  awards: AwardDef[];
}

/**
 * The Golden Whistle Awards: a ceremony at these route levels. Each award is judged on how you actually
 * played, so the show reflects your train; anything you miss is simply "nominated, next year".
 */
export const CEREMONIES: CeremonyDef[] = [
  {
    level: 5,
    title: 'The Golden Whistle Awards',
    awards: [
      { id: 'newcomer', name: 'Best Newcomer', hint: 'Just keep going.', stat: 'always', target: 0, reward: { gems: 20, railMiles: 4 } },
      { id: 'spotless', name: 'Spotless Service', hint: 'Make 6 perfect station stops.', stat: 'perfectStops', target: 6, reward: { gems: 15, railMiles: 3 } },
      { id: 'welcome', name: 'Warmest Welcome', hint: 'Bring guests 40 things they asked for.', stat: 'requests', target: 40, reward: { gems: 15, railMiles: 3 } },
    ],
  },
  {
    level: 8,
    title: 'Golden Whistle: Grand Final',
    awards: [
      { id: 'popular', name: 'People\'s Favourite', hint: 'Carry 250 guests.', stat: 'guests', target: 250, reward: { gems: 25, railMiles: 5 } },
      { id: 'sleeper', name: 'Sleeper Train of the Year', hint: 'Top the Countryside League.', stat: 'rankOne', target: 0, reward: { gems: 40, railMiles: 8 } },
    ],
  },
];

/** Route level at which the nomination is announced (a promise the player can see coming). */
export const NOMINATION_LEVEL = 3;
/** Keep the last few stories (the newest one's photo shows the train as it looked that day). */
export const PRESS_ARCHIVE = 3;
