import { describe, expect, it } from 'vitest';
import { CEREMONIES, DEBUT_INTERVIEW, HEADLINES, INTERVIEWS, RIVALS } from '../src/config/press';
import { ECONOMY } from '../src/config/economy';
import { awardProgress, cleanTrainName, fillTemplate, leagueStanding, raceProgress, rivalsPassed } from '../src/sim/press';
import { dareTarget, nextDare } from '../src/sim/press';
import { RIVAL_DARES } from '../src/config/press';

describe('press', () => {
  it('fills headline tokens and drops unknown ones', () => {
    expect(fillTemplate('{train} overtakes {rival}{oops}', { train: 'The Night Owl', rival: 'Puffing Billy' })).toBe('The Night Owl overtakes Puffing Billy');
  });

  it('starts at the bottom of the league and ends at number one', () => {
    const bottom = leagueStanding(0, RIVALS);
    expect(bottom.rank).toBe(RIVALS.length + 1);
    expect(bottom.next?.name).toBe('Puffing Billy');
    const top = leagueStanding(10_000, RIVALS);
    expect(top.rank).toBe(1);
    expect(top.next).toBeNull();
  });

  it('reports every rival passed in one jump, in order', () => {
    const passed = rivalsPassed(20, 300, RIVALS).map((r) => r.name);
    expect(passed).toEqual(['Puffing Billy', 'Midnight Mail', 'Highland Rambler']);
    expect(rivalsPassed(300, 300, RIVALS)).toEqual([]);
  });

  it('measures the race to the next rival from the one below', () => {
    const [first, second] = RIVALS;
    expect(raceProgress(0, RIVALS)).toMatchObject({ next: first, from: 0, to: first.reputation, fraction: 0 });
    const mid = raceProgress((first.reputation + second.reputation) / 2, RIVALS);
    expect(mid.next).toBe(second);
    expect(mid.from).toBe(first.reputation);
    expect(mid.fraction).toBeCloseTo(0.5);
    const top = raceProgress(10_000, RIVALS);
    expect(top.next).toBeNull();
    expect(top.fraction).toBe(1);
    expect(top.rank).toBe(1);
  });

  it('gives every rival spoils worth chasing', () => {
    for (const rival of RIVALS) {
      expect(rival.spoils.perk.amount).toBeGreaterThan(0);
      expect(rival.spoils.cashPerCarriage).toBeGreaterThan(0);
      expect(rival.spoils.what.split(' ').length).toBeLessThanOrEqual(5);
    }
  });

  it('can reach number one within route 1', () => {
    const maxStars = ECONOMY.progression.levelThresholds[ECONOMY.progression.levelThresholds.length - 1];
    expect(Math.max(...RIVALS.map((r) => r.reputation))).toBeLessThanOrEqual(maxStars);
  });

  it('judges awards on how you played', () => {
    const spotless = CEREMONIES[0].awards.find((a) => a.stat === 'perfectStops')!;
    expect(awardProgress(spotless, { guests: 0, perfectStops: spotless.target - 1, requests: 0 }, 5).won).toBe(false);
    expect(awardProgress(spotless, { guests: 0, perfectStops: spotless.target, requests: 0 }, 5).won).toBe(true);
    const top = CEREMONIES[1].awards.find((a) => a.stat === 'rankOne')!;
    expect(awardProgress(top, { guests: 0, perfectStops: 0, requests: 0 }, 2).won).toBe(false);
    expect(awardProgress(top, { guests: 0, perfectStops: 0, requests: 0 }, 1).won).toBe(true);
  });

  it('keeps train names short and safe', () => {
    expect(cleanTrainName('  The   <b>Owl</b>  ', 22, 'Default')).toBe('The bOwl/b');
    expect(cleanTrainName('   ', 22, 'Default')).toBe('Default');
    expect(cleanTrainName('A'.repeat(40), 22, 'Default')).toHaveLength(22);
  });

  it('opens with the Gazette interview after the first stop, then Rails Tonight', () => {
    const debut = INTERVIEWS.find((i) => i.level === DEBUT_INTERVIEW);
    expect(debut?.show).toBe('gazette');
    expect(INTERVIEWS.filter((i) => i.level > DEBUT_INTERVIEW).every((i) => i.show === 'tv')).toBe(true);
  });

  it('gives every rival an owner who taunts, grumbles and outnumbers a new train', () => {
    for (const rival of RIVALS) {
      expect(rival.owner.taunt.headline.length, rival.name).toBeGreaterThan(0);
      expect(rival.owner.taunt.body.length, rival.name).toBeLessThanOrEqual(140);
      expect(rival.owner.humbled.length, rival.name).toBeLessThanOrEqual(50);
      expect(rival.owner.carriages, rival.name).toBeGreaterThan(1);
    }
    // Each rival up the table has at least as grand a train as the one below.
    const byRep = [...RIVALS].sort((a, b) => a.reputation - b.reputation);
    for (let i = 1; i < byRep.length; i++) expect(byRep[i].owner.carriages).toBeGreaterThanOrEqual(byRep[i - 1].owner.carriages);
  });

  it('has a headline for every trigger and an answer for every interview', () => {
    for (const [trigger, list] of Object.entries(HEADLINES)) expect(list.length, trigger).toBeGreaterThan(0);
    for (const interview of INTERVIEWS) expect(interview.answers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the rival\'s dare (session 24)', () => {
  it('grows the target with the train and never asks for nothing', () => {
    expect(dareTarget(3, 2, 1)).toBe(5);
    expect(dareTarget(3, 2, 4)).toBe(11);
    expect(dareTarget(0, 0, 3)).toBe(1);
  });

  it('takes the dares in turn, skipping any that cannot be met yet', () => {
    const list = ['a', 'b', 'c'];
    expect(nextDare(list, 0, () => true)).toBe('a');
    expect(nextDare(list, 4, () => true)).toBe('b');
    expect(nextDare(list, 1, (x) => x !== 'b')).toBe('c');
    expect(nextDare(list, 0, () => false)).toBeNull();
  });

  it('every rival can gloat and every dare is complete', () => {
    for (const rival of RIVALS) expect(rival.owner.gloat.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const dare of RIVAL_DARES) {
      expect(ids.has(dare.id)).toBe(false);
      ids.add(dare.id);
      expect(dare.stops).toBeGreaterThanOrEqual(1);
      expect(dare.dare).toContain('{station}');
      expect(dareTarget(dare.base, dare.perCarriage, 1)).toBeGreaterThanOrEqual(1);
    }
  });
});
