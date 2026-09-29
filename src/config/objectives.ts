import type { IconName } from '../ui/icons';

/**
 * The objective chain: one goal at a time across route 1, shown in the banner under the top bar. It walks
 * the player through every mechanic in the order the game introduces them, each goal paying a small
 * reward, so there is always a clear "next thing" and every mechanic gets its moment. Pure data: add,
 * remove or reorder freely (progress is saved by index and id).
 *
 * `event` is what counts: a check-in, a clean, a request, a stop... counted from when the goal appears. Goals
 * about what you own count everything bought so far: `unlock` (`filter`: a tile kind such as cabin or
 * comfort, or a kind and role such as hire:porter), `refurb` (`filter` is a tier), `coupling` (carriages
 * added) and `station` (station upgrades). `level` goals track the route level.
 */
export type ObjectiveEvent =
  | 'checkIn' | 'collect' | 'unlock' | 'clean' | 'request' | 'board' | 'luggage' | 'perfectStop'
  | 'restock' | 'coupling' | 'refurb' | 'level' | 'conductor' | 'rush' | 'station';

export interface ObjectiveDef {
  id: string;
  text: string;
  icon: IconName;
  event: ObjectiveEvent;
  target: number;
  filter?: string;
  /** Rush objectives count a streak of at least this length. */
  streak?: number;
  reward: { cash?: number; gems?: number; railMiles?: number };
  stars?: number;
}

export const OBJECTIVES: ObjectiveDef[] = [
  // The first minutes: the core loop, one verb at a time.
  { id: 'first_checkin', text: 'Check in a guest at the desk', icon: 'ticket', event: 'checkIn', target: 1, reward: { cash: 5 } },
  { id: 'first_cash', text: 'Pick up your cash', icon: 'cash', event: 'collect', target: 1, reward: { cash: 5 } },
  { id: 'build_cabin', text: 'Build a second cabin', icon: 'bed', event: 'unlock', filter: 'cabin', target: 1, reward: { cash: 10 }, stars: 2 },
  { id: 'first_request', text: 'Bring a guest what they ask for', icon: 'tea', event: 'request', target: 1, reward: { cash: 10 } },
  { id: 'first_clean', text: 'Tidy a cabin after its guest leaves', icon: 'broom', event: 'clean', target: 1, reward: { cash: 10 } },
  { id: 'first_board', text: 'Board 2 passengers at the station', icon: 'person', event: 'board', target: 2, reward: { cash: 15 } },
  { id: 'first_luggage', text: 'Load 2 bags onto the rack', icon: 'luggage', event: 'luggage', target: 2, reward: { cash: 15 } },
  { id: 'hire_attendant', text: 'Hire an Attendant to clean for you', icon: 'person', event: 'unlock', filter: 'hire:attendant', target: 1, reward: { cash: 20 }, stars: 2 },
  { id: 'checkins_6', text: 'Check in 6 guests', icon: 'ticket', event: 'checkIn', target: 6, reward: { cash: 25 } },
  { id: 'repair_lobby', text: 'Repair your first carriage', icon: 'paint', event: 'refurb', target: 1, reward: { cash: 25 }, stars: 2 },
  { id: 'perfect_1', text: 'Make a perfect station stop', icon: 'star', event: 'perfectStop', target: 1, reward: { cash: 20, gems: 2 } },
  { id: 'couple_1', text: 'Couple on a new carriage', icon: 'carriage', event: 'coupling', target: 1, reward: { cash: 30 }, stars: 3 },
  { id: 'sleeper_cabin', text: 'Open a cabin in the new carriage', icon: 'bed', event: 'unlock', filter: 'cabin', target: 2, reward: { cash: 20 } },
  { id: 'requests_8', text: 'Bring guests 8 things they ask for', icon: 'tea', event: 'request', target: 8, reward: { cash: 30 } },
  { id: 'rush_3', text: 'Serve 3 in a row for a Rush', icon: 'bolt', event: 'rush', streak: 3, target: 1, reward: { cash: 20 } },
  { id: 'comfort_1', text: 'Buy your cabins a comfort', icon: 'heart', event: 'unlock', filter: 'comfort', target: 1, reward: { cash: 25 } },
  { id: 'level_2', text: 'Reach route level 2', icon: 'star', event: 'level', target: 2, reward: { gems: 5 } },
  { id: 'conductor_1', text: 'Spend Rail Miles on the conductor', icon: 'conductor', event: 'conductor', target: 1, reward: { cash: 30 } },
  // The mid game: the washroom car, the station shop, automation.
  { id: 'couple_2', text: 'Couple on a third carriage', icon: 'carriage', event: 'coupling', target: 2, reward: { cash: 40 }, stars: 3 },
  { id: 'restock_1', text: 'Restock a washroom with towels and rolls', icon: 'towel', event: 'restock', target: 1, reward: { cash: 25 } },
  { id: 'station_shop', text: 'Buy something at the station shop', icon: 'megaphone', event: 'station', target: 1, reward: { cash: 40, gems: 3 } },
  { id: 'board_20', text: 'Board 20 passengers', icon: 'person', event: 'board', target: 20, reward: { cash: 40 } },
  { id: 'comforts_3', text: 'Own 3 comforts', icon: 'heart', event: 'unlock', filter: 'comfort', target: 3, reward: { cash: 50 } },
  { id: 'hire_porter', text: 'Hire a Porter for check-in and bags', icon: 'luggage', event: 'unlock', filter: 'hire:porter', target: 1, reward: { cash: 50 }, stars: 2 },
  { id: 'perfect_3', text: 'Make 3 perfect station stops', icon: 'star', event: 'perfectStop', target: 3, reward: { cash: 40, gems: 3 } },
  { id: 'refurb_3x', text: 'Do up your carriages 3 times', icon: 'paint', event: 'refurb', target: 3, reward: { cash: 60 }, stars: 3 },
  { id: 'level_3', text: 'Reach route level 3', icon: 'star', event: 'level', target: 3, reward: { gems: 8 } },
  { id: 'couple_3', text: 'Couple on a fourth carriage', icon: 'carriage', event: 'coupling', target: 3, reward: { cash: 70 }, stars: 4 },
  { id: 'rush_8', text: 'Build a Rush of 8', icon: 'bolt', event: 'rush', streak: 8, target: 1, reward: { cash: 50 } },
  { id: 'station_3', text: 'Own 3 station upgrades', icon: 'megaphone', event: 'station', target: 3, reward: { cash: 80, gems: 3 } },
  { id: 'cleans_25', text: 'Tidy 25 cabins', icon: 'broom', event: 'clean', target: 25, reward: { cash: 70 } },
  { id: 'train_up', text: 'Train one of your staff', icon: 'plus', event: 'unlock', filter: 'staffUpgrade', target: 1, reward: { cash: 60 } },
  { id: 'level_4', text: 'Reach route level 4', icon: 'star', event: 'level', target: 4, reward: { gems: 10 } },
  // The long game: the full train and the top of the league.
  { id: 'couple_4', text: 'Couple on a fifth carriage', icon: 'carriage', event: 'coupling', target: 4, reward: { cash: 120 }, stars: 5 },
  { id: 'comforts_8', text: 'Own 8 comforts', icon: 'heart', event: 'unlock', filter: 'comfort', target: 8, reward: { cash: 150 } },
  { id: 'checkins_150', text: 'Check in 150 guests', icon: 'ticket', event: 'checkIn', target: 150, reward: { cash: 150, gems: 5 } },
  { id: 'perfect_10', text: 'Make 10 perfect station stops', icon: 'star', event: 'perfectStop', target: 10, reward: { cash: 120, gems: 5 } },
  { id: 'level_5', text: 'Reach route level 5', icon: 'star', event: 'level', target: 5, reward: { gems: 12 } },
  { id: 'luxury', text: 'Make a carriage luxurious', icon: 'paint', event: 'refurb', filter: '3', target: 1, reward: { cash: 200, gems: 5 }, stars: 5 },
  { id: 'level_6', text: 'Reach route level 6', icon: 'star', event: 'level', target: 6, reward: { gems: 15 } },
  { id: 'level_7', text: 'Reach route level 7', icon: 'star', event: 'level', target: 7, reward: { gems: 18 } },
  { id: 'level_8', text: 'Make the Countryside Local famous: level 8', icon: 'trophy', event: 'level', target: 8, reward: { gems: 25, railMiles: 10 } },
];
