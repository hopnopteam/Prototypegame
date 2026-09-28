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

export type PressTrigger =
  | 'named' | 'firstCoupling' | 'coupling' | 'firstHire' | 'refurb1' | 'refurb2' | 'refurb3' | 'livery'
  | 'overtake' | 'perfectStreak' | 'longQueue' | 'guests25' | 'guests100' | 'guests250' | 'story'
  | 'award' | 'nominated' | 'interview' | 'weekly' | 'champion';

export interface HeadlineDef {
  headline: string;
  body: string;
}

/** One or more variants per trigger; a variant is picked by how many times the trigger has fired. */
export const HEADLINES: Record<PressTrigger, HeadlineDef[]> = {
  named: [{ headline: 'A Sleeper Train for the Countryside Line?', body: '{train} rattles out of Millbrook with one rusty carriage, three iron cots and a very determined conductor. "Rusty but charming," says a passenger.' }],
  firstCoupling: [{ headline: '{train} Grows a Second Carriage', body: 'The {carriage} rolled in with a clunk heard two fields away. Passengers report "actual washrooms".' }],
  coupling: [
    { headline: '{train} Is Getting Longer', body: 'A {carriage} joins the train. Station masters are measuring their platforms.' },
    { headline: 'Now {n} Carriages Long', body: 'The {carriage} couples on. "She used to be one rusty carriage," a porter recalls.' },
  ],
  firstHire: [{ headline: 'Help Wanted? Help Hired!', body: '{train} takes on its first member of staff. The conductor was spotted sitting down for the first time in weeks.' }],
  refurb1: [{ headline: 'A Lick of Paint for {train}', body: 'The {carriage} is freshly painted. Early reviews: "It no longer smells of coal."' }],
  refurb2: [{ headline: 'Carpets! On {train}!', body: 'The {carriage} goes cosy: carpets, curtains, proper lamps. Fares are up and nobody minds.' }],
  refurb3: [{ headline: 'Velvet and Brass: {train} Goes Luxury', body: 'The {carriage} is refitted in walnut and brass. The Orient Belle is said to be "not worried". She is worried.' }],
  livery: [{ headline: '{train} Unveils {livery} Livery', body: 'A new paint job to match a growing name. Trainspotters along the line have started waving.' }],
  overtake: [
    { headline: '{train} Overtakes {rival}', body: 'The Countryside League has a new number {rank}. {rival} could not be reached for comment.' },
    { headline: 'Up to Number {rank}!', body: '{train} passes {rival} in the league table. Bookmakers are shortening the odds.' },
  ],
  perfectStreak: [
    { headline: 'Clockwork at {station}', body: 'Three perfect stops in a row: every passenger aboard, every bag loaded. Swiss railways are taking notes.' },
    { headline: 'Another Perfect Stop', body: '{station} passengers praise "the smoothest boarding on the line".' },
  ],
  longQueue: [
    { headline: 'Queues at {station}', body: '{n} passengers are waiting for {train}. "Worth the wait," says one. More cabins, perhaps?' },
  ],
  guests25: [{ headline: '25 Passengers and Counting', body: '{train} has carried its twenty-fifth guest. A small cake was served. The cake was also rusty.' }],
  guests100: [{ headline: 'One Hundred Happy Sleepers', body: '{train} passes a hundred passengers. "I slept like a log," said a man who is, professionally, a lumberjack.' }],
  guests250: [{ headline: 'The Talk of the Countryside', body: '250 guests and rising. {train} is now the most-booked sleeper west of Millbrook.' }],
  story: [{ headline: '{story}', body: 'A regular passenger\'s journey comes to a happy end aboard {train}.' }],
  award: [{ headline: 'Golden Whistle: {award}!', body: '{train} takes home the Golden Whistle for {award}. The conductor thanked "my staff, my passengers, and my feet".' }],
  nominated: [{ headline: '{train} Up for a Golden Whistle', body: 'The Golden Whistle Awards nominate {train} for Best Newcomer. The ceremony is at route level 5.' }],
  interview: [{ headline: '"{quote}"', body: 'The conductor of {train}, speaking to Rails Tonight.' }],
  weekly: [{ headline: 'The Week on the Line', body: '{train} carried {n} passengers this week and sits at number {rank} in the Countryside League.' }],
  champion: [{ headline: 'Number One!', body: '{train} tops the Countryside League. From one rusty carriage to the best sleeper on the line.' }],
};

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
/** A weekly edition after every this many station stops. */
export const WEEKLY_EVERY_STOPS = 4;
/** Keep this many past stories in the paper. */
export const PRESS_ARCHIVE = 24;
/** Only this many passengers left waiting make the news. */
export const LONG_QUEUE_MIN = 3;
