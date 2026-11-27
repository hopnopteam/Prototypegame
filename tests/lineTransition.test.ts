import { describe, expect, it } from 'vitest';
import { LIVERIES } from '../src/world/palette';
import { AFTER_RELOAD, BEFORE_RELOAD, COUNTRYSIDE_TO_RIVIERA, RIVIERA_TO_WINTER, TRANSITIONS, type TransitionBeat } from '../src/config/lineTransition';
import { ROUTES } from '../src/config/routes';
import { createDefaultSave, mergeDefaults, type SaveData } from '../src/save/SaveData';
import { carryOver } from '../src/sim/carryOver';
import { arrivalOnBoot, canSkip, filePostcard, finishArrival, linePostcardId, markArrival, payChest } from '../src/sim/lineTransition';

const CHEST = COUNTRYSIDE_TO_RIVIERA.chest;

/** A finished Countryside save, as the grand station leaves it. */
function finished(): SaveData {
  const s = createDefaultSave(1000, 'test');
  s.route.id = 'countryside';
  s.route.level = 8;
  s.route.carriages = ['lobby', 'cafe', 'sleeper', 'bathroom', 'bar', 'dining', 'familySleeper', 'cinema'];
  s.wallet = { cash: 4321, gems: 55, railMiles: 21 };
  s.profile.flags.grand_countryside = true;
  return s;
}

/** What the tunnel writes: the carry-over with the arrival marked. */
function written(from: SaveData): SaveData {
  return markArrival(carryOver(from, 'riviera', 2000).data, 'countryside', 'riviera');
}

/** Storage round trip (what a relaunch reads back). */
const relaunch = (s: SaveData): SaveData => mergeDefaults(JSON.parse(JSON.stringify(s)), createDefaultSave(0, 'x'));

describe('The Grand Departure: the template', () => {
  it('every playable route but the last has a transition, and each names its next line', () => {
    for (let i = 0; i < ROUTES.length; i++) {
      const t = ROUTES[i].transition;
      expect(t, ROUTES[i].id).toBeTruthy();
      if (i + 1 < ROUTES.length) expect(t!.to).toBe(ROUTES[i + 1].id);
    }
    expect(RIVIERA_TO_WINTER.to).toBe('winter');
    expect(Object.keys(TRANSITIONS)).toEqual(['countryside', 'riviera']);
  });

  it('every beat has its words, and the beats split at the reload', () => {
    expect([...BEFORE_RELOAD, ...AFTER_RELOAD]).toEqual(['hero', 'frontPage', 'offer', 'lever', 'depot', 'tunnel', 'burst', 'arrival', 'chest', 'postcard']);
    for (const t of Object.values(TRANSITIONS)) {
      for (const beat of ['hero', 'lever', 'depot', 'tunnel', 'burst', 'arrival', 'chest', 'postcard'] as TransitionBeat[]) expect(t.captions[beat], `${t.to} ${beat}`).toBeTruthy();
      expect(t.chest.gems).toBeGreaterThan(0);
      // Owner ("go with what's best for retention"): enough to paint the new train in the Paint Shop straight away (the
      // cheapest premium livery), never a pile that makes gems meaningless.
      const cheapest = Math.min(...LIVERIES.filter((l) => l.gems).map((l) => l.gems!));
      expect(t.chest.gems).toBeGreaterThanOrEqual(cheapest);
      expect(t.chest.gems).toBeLessThanOrEqual(200);
    }
  });

  it('skipping: the hero shot and the lever always play the first time; a replay may skip anything but the offer', () => {
    expect(canSkip('hero', false, false)).toBe(false);
    expect(canSkip('lever', false, false)).toBe(false);
    expect(canSkip('depot', false, false)).toBe(true);
    expect(canSkip('burst', false, false)).toBe(true);
    expect(canSkip('hero', true, false)).toBe(true);
    expect(canSkip('lever', false, true)).toBe(true);
    expect(canSkip('offer', true, true)).toBe(false);
  });
});

describe('The Grand Departure: save safety (killing the app at every beat)', () => {
  for (const beat of BEFORE_RELOAD) {
    it(`killed at "${beat}" (before the save write): back on the old route, the line still open, nothing paid`, () => {
      const stored = finished();
      const back = relaunch(stored);
      expect(back.route.id).toBe('countryside');
      expect(arrivalOnBoot(back, 'countryside')).toBe('none');
      expect(back.wallet).toEqual({ cash: 4321, gems: 55, railMiles: 21 });
      expect(back.profile.flags.grand_countryside).toBe(true);
      expect(back.lineArrival).toBeNull();
    });
  }

  for (const beat of AFTER_RELOAD) {
    it(`killed at "${beat}" (after the save write): the arrival plays on the new line and pays the chest exactly once`, () => {
      let stored = written(finished());
      // The beats up to this one ran: the chest is paid (and saved) at "chest", the postcard filed at "postcard".
      const reached = AFTER_RELOAD.indexOf(beat);
      if (reached > AFTER_RELOAD.indexOf('chest')) payChest(stored, CHEST);
      if (reached > AFTER_RELOAD.indexOf('postcard')) filePostcard(stored);
      // Killed, relaunched (twice, for good measure), watched or skipped to the end.
      for (let i = 0; i < 2; i++) {
        stored = relaunch(stored);
        expect(stored.route.id).toBe('riviera');
        expect(arrivalOnBoot(stored, 'riviera')).toBe('arrival');
        payChest(stored, CHEST);
      }
      finishArrival(stored, CHEST);
      stored = relaunch(stored);
      expect(arrivalOnBoot(stored, 'riviera')).toBe('none');
      expect(stored.wallet.gems).toBe(55 + CHEST.gems);
      expect(stored.wallet.railMiles).toBe(21 + CHEST.railMiles);
      expect(stored.wallet.cash).toBe(0);
      expect(stored.meta.postcards.filter((p) => p === linePostcardId('countryside'))).toHaveLength(1);
      expect(stored.completedRoutes).toEqual(['countryside']);
    });
  }

  it('a skip lands in the same state as watching to the end', () => {
    const watched = written(finished());
    payChest(watched, CHEST);
    filePostcard(watched);
    finishArrival(watched, CHEST);
    const skipped = written(finished());
    finishArrival(skipped, CHEST);
    expect(skipped).toEqual(watched);
  });

  it('an arrival written for another line is never played on this one', () => {
    const s = written(finished());
    expect(arrivalOnBoot(s, 'countryside')).toBe('none');
  });
});
