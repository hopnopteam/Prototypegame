import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ready, courseRun } from './helpers';
import { buildCourse, continuityIssues, insidePolygon, seamOpening, validateChunk } from '../src/sim/Course';
import { WORLDS } from '../src/content/worlds';
import { SIM_HZ } from '../src/econ/balance';
import type { PilotInput } from '../src/sim/Input';

beforeAll(async () => { await ready; });

const chunks = WORLDS[1].chunks;

describe('chunks', () => {
  it.each(chunks.map((c) => [c.id, c] as const))('%s is valid', (_id, chunk) => {
    expect(validateChunk(chunk)).toEqual([]);
  });

  it('every chunk joins the next one', () => {
    for (let i = 0; i + 1 < chunks.length; i++) expect(continuityIssues(chunks[i], chunks[i + 1])).toEqual([]);
  });

  it('the first chunk is closed at the bottom and every top is open', () => {
    expect(seamOpening(chunks[0], 'bottom')).toEqual([]);
    for (const c of chunks) expect(seamOpening(c, 'top').length).toBeGreaterThan(0);
  });

  it('the course starts on the launch ledge and exits at the top', () => {
    const course = buildCourse(1, chunks);
    expect(course.start.ledge).toBe('w1_01.L0');
    expect(course.top).toBe(63);
    expect(course.ledges.map((l) => l.id)).toContain('w1_03.C');
  });

  it('every chunk file in content/chunks is listed in its world', () => {
    const dir = join(__dirname, '../src/content/chunks');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: string };
      expect(chunks.map((c) => c.id)).toContain(data.id);
    }
  });
});

describe('no tunnelling', () => {
  it('a minute of wild flying never puts the suit inside rock', () => {
    const run = courseRun({ thrustG: 1.6 }, { noHeat: true, infiniteBattery: true, invulnerable: true });
    const course = run.course;
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    let input: PilotInput = { hold: true, tilt: 0 };
    for (let i = 0; i < 60 * SIM_HZ && !run.done; i++) {
      if (i % 30 === 0) input = { hold: rand() < 0.62, tilt: rand() * 2 - 1 };
      run.step(input);
      run.events.length = 0;
      if (i % 10 !== 0) continue;
      const com = run.suit.body.worldCom();
      for (const chunk of course.chunks) {
        for (const poly of chunk.data.terrain) {
          expect(insidePolygon(poly.points, com.x - chunk.x0, com.y - chunk.y0)).toBe(false);
        }
      }
    }
    run.dispose();
  });
});
