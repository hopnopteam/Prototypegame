import type { IconName } from '../ui/icons';

/**
 * The press content pack: the in-universe world that notices your train. Everything here is data, so new
 * routes, seasons and brand events can bring their own rivals, headlines, interviews and awards.
 *
 * Headline text takes {tokens}: {train} (the player's name for the train), {station}, {rival}, {n},
 * {livery}, {tier}, {carriage}, {rank}, {quote}, {award}, {story}.
 */

/** How a rival owner's portrait is drawn (a quick caricature on the Gazette page). */
export interface OwnerLook {
  skin: string;
  hair: string;
  hat: 'tophat' | 'bun' | 'tam' | 'tiara' | 'goggles' | 'bowler' | 'feather';
  face: 'moustache' | 'lorgnette' | 'beard' | 'pearls' | 'scarf' | 'monocle' | 'lashes';
}

/**
 * The owner of a rival train: a whimsical villain who looks down on your little sleeper. They taunt you in
 * the Gazette's Rival Watch when their train becomes your next target, and grumble when you pass them.
 */
export interface RivalOwner {
  name: string;
  /** How the Gazette styles them. */
  title: string;
  look: OwnerLook;
  /** The taunt: a quoted headline and one short paragraph ({train} is your train). */
  taunt: { headline: string; body: string };
  /** What they splutter once you pass them. */
  humbled: string;
  /** Session 24: what they crow when you miss one of their dares ({train} is your train). */
  gloat: string;
  /** How many carriages their train has in the Gazette photo (always more than yours, at first). */
  carriages: number;
}

/**
 * What you take from a rival when you overtake them (session 18, owner: "no motivation to keep upgrading"):
 * something of theirs that becomes yours for good (a permanent perk), a purse, and their pennant, hoisted on
 * your locomotive. Shown on Rival Watch and in the league, so every star you earn is a step toward it.
 */
export interface RivalSpoils {
  /** What changes hands, in a few words ("Their coal contract"). */
  what: string;
  perk: { kind: PerkKind; amount: number; label: string };
  /** Cash for each carriage of yours, paid on the spot. */
  cashPerCarriage: number;
  gems?: number;
}

export interface Rival {
  name: string;
  /** Reputation (route stars) needed to overtake them. */
  reputation: number;
  /** One line of colour for the league table. */
  blurb: string;
  livery: string;
  trim: string;
  owner: RivalOwner;
  spoils: RivalSpoils;
}

/** The Countryside League. The player starts at the bottom; overtaking the Orient Belle makes you #1. */
export const RIVALS: Rival[] = [
  {
    name: 'Puffing Billy', reputation: 25, blurb: 'Mostly steam, some train.', livery: '#8C7A6B', trim: '#3A3440',
    owner: {
      name: 'Sir Reginald Soot', title: 'coal baron', carriages: 3,
      look: { skin: '#F0C8A8', hair: '#6B6B6B', hat: 'tophat', face: 'moustache' },
      taunt: { headline: '“One Carriage? How Adorable.”', body: 'Sir Reginald Soot of the Puffing Billy chuckles into his waistcoat. “My coal bunker is bigger than {train}.”' },
      humbled: 'Beginner\'s luck! My chimney was sulking.',
      gloat: 'Ha! {train} runs on hope and hot air.',
    },
    spoils: { what: 'Their coal contract', perk: { kind: 'speedBonus', amount: 0.03, label: 'Walk +3%' }, cashPerCarriage: 10 },
  },
  {
    name: 'Midnight Mail', reputation: 100, blurb: 'Carries letters. Occasionally people.', livery: '#4A4E69', trim: '#C9A45C',
    owner: {
      name: 'Lady Mildred Postlethwaite', title: 'postmistress general', carriages: 4,
      look: { skin: '#F4D3BC', hair: '#B7B0C8', hat: 'bun', face: 'lorgnette' },
      taunt: { headline: '“Letters Travel Better Than Their Guests!”', body: '“We deliver on time. {train} delivers… eventually,” sniffs Lady Mildred of the Midnight Mail.' },
      humbled: 'Return to sender! This is most irregular.',
      gloat: 'Missed it! Rather like {train} misses its stations.',
    },
    spoils: { what: 'The mail contract', perk: { kind: 'fareBonus', amount: 0.02, label: 'Fares +2%' }, cashPerCarriage: 12 },
  },
  {
    name: 'Highland Rambler', reputation: 200, blurb: 'Tartan seats, strong opinions.', livery: '#5E7F5A', trim: '#B8483E',
    owner: {
      name: 'The McTavish', title: 'laird of the Rambler', carriages: 5,
      look: { skin: '#E9B89A', hair: '#C2562E', hat: 'tam', face: 'beard' },
      taunt: { headline: '“A Wee Train for Wee People.”', body: '“Our tartan seats have seen more miles than their paint,” booms The McTavish from the Highland Rambler.' },
      humbled: 'Och! My bagpipes will hear of this.',
      gloat: 'Och, told ye! {train} couldnae manage it.',
    },
    spoils: { what: 'Their tartan blankets', perk: { kind: 'tipBonus', amount: 0.03, label: 'Tips +3%' }, cashPerCarriage: 15, gems: 5 },
  },
  {
    name: 'Duchess of Dover', reputation: 330, blurb: 'Serves tea at exactly 4 o\'clock.', livery: '#8E6A8C', trim: '#EAD9A8',
    owner: {
      name: 'Duchess Wilhelmina', title: 'of Dover, and of tea', carriages: 5,
      look: { skin: '#F6DCC8', hair: '#E8E2D6', hat: 'tiara', face: 'pearls' },
      taunt: { headline: '“Tea at Four. Sharp. Unlike Some.”', body: '“One simply cannot sleep on a train that pours at five past,” says the Duchess, stroking her poodle.' },
      humbled: 'Five past four! The poodle is inconsolable.',
      gloat: 'Not quite, dear. The poodle did better.',
    },
    spoils: { what: 'Her four o\'clock tea', perk: { kind: 'tipBonus', amount: 0.03, label: 'Tips +3%' }, cashPerCarriage: 20, gems: 5 },
  },
  {
    name: 'The Silver Arrow', reputation: 480, blurb: 'Fast, shiny, a little smug.', livery: '#9AA3AD', trim: '#2E2D34',
    owner: {
      name: 'Baron von Zoom', title: 'fastest man on rails', carriages: 6,
      look: { skin: '#EFCFB4', hair: '#E3C16F', hat: 'goggles', face: 'scarf' },
      taunt: { headline: '“Speed Is Luxury, Darling.”', body: 'Baron von Zoom polishes his goggles. “By the time {train} pours the tea, we have arrived.”' },
      humbled: 'Impossible! I was… letting them win.',
      gloat: 'Too slow, darling! Far too slow.',
    },
    spoils: { what: 'Their racing timetable', perk: { kind: 'speedBonus', amount: 0.03, label: 'Walk +3%' }, cashPerCarriage: 25, gems: 8 },
  },
  {
    name: 'The Blue Pullman', reputation: 640, blurb: 'Old money on new rails.', livery: '#34507A', trim: '#D9B45A',
    owner: {
      name: 'Cornelius Gold III', title: 'old money', carriages: 7,
      look: { skin: '#F2D0B6', hair: '#3B3A40', hat: 'bowler', face: 'monocle' },
      taunt: { headline: '“New Money Smells of Paint.”', body: '“Our carpets are older than their conductor,” sniffs Cornelius Gold III of the Blue Pullman.' },
      humbled: 'My monocle fell in my soup.',
      gloat: 'As expected. New money, old excuses.',
    },
    spoils: { what: 'Their old-money regulars', perk: { kind: 'fareBonus', amount: 0.03, label: 'Fares +3%' }, cashPerCarriage: 30, gems: 8 },
  },
  {
    name: 'Orient Belle', reputation: 820, blurb: 'Five-time Golden Whistle winner.', livery: '#7A2E3A', trim: '#E2B653',
    owner: {
      name: 'Madame Valentina Noir', title: 'five-time champion', carriages: 8,
      look: { skin: '#F1CDB5', hair: '#1F1B24', hat: 'feather', face: 'lashes' },
      taunt: { headline: '“Five Golden Whistles. They Have… a Whistle.”', body: '“Number one is a lonely place, darling. Let\'s keep it that way,” purrs Madame Noir of the Orient Belle.' },
      humbled: 'Enjoy it, darling. While it lasts.',
      gloat: 'Pity, darling. Do try again.',
    },
    spoils: { what: 'The Golden Whistle route', perk: { kind: 'fareBonus', amount: 0.05, label: 'Fares +5%' }, cashPerCarriage: 40, gems: 15 },
  },
];

/**
 * The rival's dare (session 24, owner: "a named rival… a challenge per edition with visible progress… never a
 * penalty"): in the calm after a departure the rival you are chasing dares you on the news strip, a small chip
 * in the right rail tracks it (their face, the dare's icon, a ring that fills), and in the calm after the
 * deadline station the paper settles it: a front page and the reward if you made it, their gloat and the next
 * dare if not (nothing is taken). Counted from the moment it is dared; staff work counts too.
 */
export type DareMetric = 'board' | 'requests' | 'tidy' | 'shoes' | 'perfect' | 'keys';

export interface RivalDare {
  id: string;
  metric: DareMetric;
  icon: IconName;
  /** The dare in the rival's words ({n} the target, {station} the last station of it). */
  dare: string;
  /** The target: base plus this many per carriage of yours (rounded), so it grows with the train. */
  base: number;
  perCarriage: number;
  /** Stations it runs over (it is settled as the train leaves the last). */
  stops: number;
}

export const RIVAL_DARES: RivalDare[] = [
  { id: 'tickets', metric: 'board', icon: 'ticket', dare: 'Bet you can\'t sell {n} tickets by {station}.', base: 3, perCarriage: 2, stops: 2 },
  { id: 'requests', metric: 'requests', icon: 'tea', dare: '{n} requests served by {station}? Never.', base: 3, perCarriage: 2, stops: 1 },
  { id: 'shoes', metric: 'shoes', icon: 'shoe', dare: 'My boots outshine yours. Polish {n} pairs by {station}!', base: 2, perCarriage: 1, stops: 1 },
  { id: 'tidy', metric: 'tidy', icon: 'broom', dare: 'Tidy {n} rooms by {station}? Ha!', base: 2, perCarriage: 1, stops: 2 },
  { id: 'keys', metric: 'keys', icon: 'key', dare: 'Hand out {n} keys by {station}. I dare you.', base: 3, perCarriage: 2, stops: 2 },
  { id: 'perfect', metric: 'perfect', icon: 'chest', dare: 'Two perfect stops by {station}? Not you.', base: 2, perCarriage: 0, stops: 2 },
];

/** What a dare met pays (on the strip, at once): cash per carriage of yours, and a few stars. */
export const DARE_REWARD = { cashPerCarriage: 25, stars: 4 };
/** The front page when a dare is met ({train}, {rival} the owner). */
export const DARE_WON_HEADLINE = '{train} Takes {rival}\'s Dare!';

/** Offered on the naming card; the player can type their own. */
export const TRAIN_NAME_SUGGESTIONS = ['The Night Owl', 'Silver Swallow', 'Moonlight Limited', 'The Dandelion', 'Lucky Clover', 'The Starling'];
export const TRAIN_NAME_MAX = 22;
/** Used until the player names the train (and if they leave the field empty). */
export const DEFAULT_TRAIN_NAME = 'The Night Express';

/**
 * Only big, visible moments make the front page (and each one pays): naming the train, every new carriage,
 * a luxury refit, a carriage reaching First Class or the Royal Suite, a new livery, breaking into the top
 * three, topping the league, a hundred passengers.
 */
export type PressTrigger = 'named' | 'coupling' | 'refurb3' | 'firstClass' | 'royal' | 'livery' | 'topThree' | 'champion' | 'guests100' | 'story'
  // Session 20: a venue opens, the first Happy Hour, a race to a station won.
  | 'venue' | 'happyHour';

/**
 * How the press is paced (session 14, owner: "the interview, the Gazette… come very quickly all at once"):
 * one card per breather after a departure, a leg of the journey apart, the biggest news first.
 */
export const PRESS_PACING = {
  /** After a departure, this many seconds are the calm beat when a press card may come (one per breather). */
  calmSeconds: 25,
  /** Seconds of play between press cards (about one leg of the journey). */
  gapSeconds: 150,
  /** Seconds of quiet after any other sheet (a level-up, a chooser) before a press card. */
  afterSheetSeconds: 6,
  /** Front pages waiting at most; beyond this the least important pays out with a toast instead. */
  maxWaitingFrontPages: 2,
  /** How much each kind of news matters when several wait for the same breather. */
  newsWeight: { named: 10, royal: 9, champion: 9, firstClass: 8, topThree: 7, coupling: 6, venue: 6, story: 5, refurb3: 5, livery: 4, guests100: 4, happyHour: 3 } as Record<PressTrigger, number>,
};

export interface HeadlineDef {
  headline: string;
  body: string;
}

/** One or more variants per trigger; a variant is picked by how many times the trigger has fired. */
export const HEADLINES: Record<PressTrigger, HeadlineDef[]> = {
  named: [{ headline: 'A New Sleeper for the Countryside!', body: '{train} rattles out of Millbrook with one old carriage and a very determined conductor. “{quote}”' }],
  coupling: [
    { headline: '{train} Grows a Carriage!', body: 'The {carriage} rolled in with a clunk heard two fields away.' },
    { headline: '{train} Is Getting Longer!', body: 'A {carriage} joins the train. Station masters are measuring their platforms.' },
    { headline: 'Now {n} Carriages Long!', body: 'The {carriage} couples on. "She used to be one old carriage," a porter recalls.' },
  ],
  refurb3: [{ headline: 'Velvet and Brass!', body: 'The {carriage} is refitted in walnut and brass. The Orient Belle is said to be "not worried". She is worried.' }],
  firstClass: [
    { headline: 'First Class Aboard!', body: 'The {carriage} reopens in royal blue and gold: velvet, a piano and champagne on ice. Bookings are up. So are eyebrows.' },
    { headline: 'More First Class!', body: 'Another carriage of velvet and gold on {train}. The waiting list now has a waiting list.' },
  ],
  royal: [
    { headline: 'A Royal Suite on the Rails!', body: 'The {carriage} is now a four-poster palace on wheels, butler included. A duchess was seen practising her wave.' },
    { headline: 'Fit for a King. Two Kings!', body: 'A second Royal Suite joins {train}. The crown jewels are said to be "considering it".' },
  ],
  livery: [{ headline: '{train} Unveils a New Look!', body: 'Fresh {livery} paint to match a growing name. Trainspotters have started waving.' }],
  topThree: [{ headline: 'Into the Top Three!', body: '{train} passes {rival} and joins the best sleepers on the line. “{quote}” says their owner.' }],
  champion: [{ headline: 'Number One!', body: '{train} tops the Countryside League. From one old carriage to the best sleeper on the line. “{quote}”' }],
  guests100: [{ headline: 'One Hundred Happy Sleepers!', body: '"I slept like a log," said a man who is, professionally, a lumberjack.' }],
  story: [{ headline: '{story}', body: 'A regular passenger\'s journey comes to a happy end aboard {train}.' }],
  // Session 20: news on the strip (no card), each a few words.
  venue: [{ headline: '{venue} Now Open!', body: '{train} opens its {venue}. The queue starts at once.' }],
  happyHour: [{ headline: 'Happy Hour Aboard!', body: 'The bar lounge of {train} is in full swing.' }],
};

/** What each front page pays when you read it (cash scales with the train's length). */
export const FRONT_PAGE_REWARDS: Record<PressTrigger, { gems?: number; railMiles?: number; cashPerCarriage?: number }> = {
  venue: { cashPerCarriage: 20 },
  happyHour: { gems: 2 },
  named: { gems: 5 },
  coupling: { cashPerCarriage: 30 },
  refurb3: { gems: 10 },
  firstClass: { gems: 12 },
  royal: { gems: 20, railMiles: 3 },
  livery: { railMiles: 2 },
  topThree: { gems: 10 },
  champion: { gems: 25 },
  guests100: { gems: 10 },
  story: { railMiles: 2 },
};

/** The debut interview's level key (it comes with the naming, after the first stop). */
export const DEBUT_INTERVIEW = 0;

/** A rival at or above this rank is front-page news when you pass them. */
export const TOP_RANK_NEWS = 3;

export type PerkKind = 'tipBonus' | 'fareBonus' | 'speedBonus';

export interface InterviewAnswer {
  text: string;
  perk: { kind: PerkKind; amount: number; label: string };
}

export interface InterviewDef {
  /** Route level that brings it; 0 is the debut, right after the first station stop (with the naming). */
  level: number;
  /** The Rail Gazette sends a reporter; Rails Tonight is on the telly. */
  show: 'gazette' | 'tv';
  question: string;
  answers: InterviewAnswer[];
}

/** Who asks the questions. */
export const INTERVIEW_HOSTS: Record<InterviewDef['show'], { title: string; host: string; badge: string }> = {
  gazette: { title: 'The Rail Gazette', host: 'Percy Inkwell', badge: 'Interview' },
  tv: { title: 'Rails Tonight', host: 'Penny Quill', badge: 'On air' },
};

/** Interviews: the debut after the first stop, then Rails Tonight after these route levels. Every answer is good. */
export const INTERVIEWS: InterviewDef[] = [
  {
    level: 0,
    show: 'gazette',
    question: 'A new sleeper on the country line! What makes a good night train?',
    answers: [
      { text: 'Tea, served before you ask.', perk: { kind: 'tipBonus', amount: 0.06, label: 'Tips +6%' } },
      { text: 'Fair fares for a fine bed.', perk: { kind: 'fareBonus', amount: 0.05, label: 'Fares +5%' } },
      { text: 'A conductor who never stops moving.', perk: { kind: 'speedBonus', amount: 0.05, label: 'Walk +5%' } },
    ],
  },
  {
    level: 4,
    show: 'tv',
    question: 'The Orient Belle calls you "a local line with ideas". Your reply?',
    answers: [
      { text: 'See you at the Golden Whistles.', perk: { kind: 'fareBonus', amount: 0.06, label: 'Fares +6%' } },
      { text: 'Our passengers would disagree.', perk: { kind: 'tipBonus', amount: 0.08, label: 'Tips +8%' } },
      { text: 'Local, and proud of it.', perk: { kind: 'speedBonus', amount: 0.06, label: 'Walk +6%' } },
    ],
  },
  {
    level: 6,
    show: 'tv',
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
