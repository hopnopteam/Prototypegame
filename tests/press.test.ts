import { describe, expect, it } from 'vitest';
import { CEREMONIES, HEADLINES, INTERVIEWS, RIVALS } from '../src/config/press';
import { ECONOMY } from '../src/config/economy';
import { awardProgress, cleanTrainName, fillTemplate, leagueStanding, rivalsPassed } from '../src/sim/press';

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

  it('has a headline for every trigger and an answer for every interview', () => {
    for (const [trigger, list] of Object.entries(HEADLINES)) expect(list.length, trigger).toBeGreaterThan(0);
    for (const interview of INTERVIEWS) expect(interview.answers.length).toBeGreaterThanOrEqual(2);
  });
});
