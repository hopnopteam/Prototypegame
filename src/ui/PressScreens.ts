import { CEREMONIES, RIVALS, TRAIN_NAME_MAX, type CeremonyDef, type InterviewDef } from '../config/press';
import { formatNumber } from '../core/math';
import type { CeremonyResult } from '../gameplay/Press';
import type { NewsItem } from '../save/SaveData';
import { awardProgress } from '../sim/press';
import { h, icon } from './dom';
import type { Screens } from './Screens';
import type { Ui } from './Ui';

/**
 * The press sheets: naming your train, the Rail Gazette, Rails Tonight interviews and the Golden Whistle
 * Awards. Styled as railway ephemera: newsprint, a TV studio card, a gilt awards programme.
 */
export class PressScreens {
  constructor(private readonly screens: Screens, private readonly ui: Ui) {}

  private get game() {
    return this.ui.game;
  }

  naming(suggestions: string[], onDone: (name: string) => void): void {
    const input = h('input.name-input', { type: 'text', maxlength: String(TRAIN_NAME_MAX), value: suggestions[0] ?? '', 'aria-label': 'Train name', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const chips = h('div.name-chips', {}, ...suggestions.map((name) => h('button.name-chip', {
      onclick: () => {
        input.value = name;
        this.game.audio.play('click');
      },
    }, name)));
    let close: () => void = () => undefined;
    const done = (): void => {
      close();
      onDone(input.value);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done();
    });
    close = this.screens.sheet('Name your train', 'news', [
      h('p.lead', { text: 'The Rail Gazette wants to write about you. What is she called?' }),
      input,
      chips,
      h('button.btn.primary', { 'data-default': '', onclick: done }, 'Paint it on'),
    ], { closable: false, center: true, className: 'naming' });
  }

  interview(def: InterviewDef, trainName: string, onAnswer: (index: number) => void): void {
    let close: () => void = () => undefined;
    const answers = def.answers.map((answer, i) => h('button.answer', {
      'data-default': i === 0 ? '' : undefined,
      onclick: () => {
        close();
        onAnswer(i);
      },
    }, h('span.say', { text: `“${answer.text}”` }), h('span.perk', {}, icon(perkIcon(answer.perk.kind), 16), answer.perk.label)));
    close = this.screens.sheet('Rails Tonight', 'mic', [
      h('div.tv', {},
        h('div.onair', { text: 'On air' }),
        h('div.host', {}, icon('mic', 30), h('div', {}, h('b', { text: 'Penny Quill' }), h('span', { text: `with the conductor of ${trainName}` }))),
        h('p.question', { text: `“${def.question}”` }),
      ),
      h('div.section-title', { text: 'Your answer (every answer helps, for good)' }),
      ...answers,
    ], { closable: false, center: true, className: 'interview' });
  }

  ceremony(def: CeremonyDef, results: CeremonyResult[], trainName: string, onDone: () => void): void {
    let close: () => void = () => undefined;
    const rows = results.map((r, i) => h(`div.award${r.won ? '.won' : ''}` as 'div', { style: { animationDelay: `${0.5 + i * 0.7}s` } },
      h('div.medal', {}, icon('trophy', 34)),
      h('div.info', {},
        h('b', { text: r.award.name }),
        r.won
          ? h('span', { text: `Winner: ${trainName}` })
          : h('span', { text: `Nominated. ${r.award.hint}${r.need > 1 ? ` (${r.have}/${r.need})` : ''}` }),
      ),
      r.fresh ? h('div.prize', {}, icon('gem', 16), String(r.award.reward.gems), icon('miles', 16), String(r.award.reward.railMiles)) : null,
    ));
    const wins = results.filter((r) => r.won).length;
    close = this.screens.sheet(def.title, 'trophy', [
      h('p.lead', { text: wins > 0 ? 'And the Golden Whistle goes to…' : 'A night to remember. Next time, the Whistle is yours.' }),
      ...rows,
      h('button.btn.primary', { 'data-default': '', onclick: () => { close(); onDone(); } }, 'Collect'),
    ], { closable: false, center: true, className: 'ceremony' });
    this.game.audio.play('fanfare');
  }

  gazette(): void {
    const g = this.game;
    const press = g.press;
    press.markRead();
    const items = g.data.press.items;
    const parts: (Node | null)[] = [];
    parts.push(h('div.masthead', {},
      h('div.paper-name', { text: 'The Rail Gazette' }),
      h('div.edition', { text: `Countryside edition · No. ${Math.max(1, g.data.press.nextId - 1)}` }),
    ));
    const lead = items[0];
    if (!lead) {
      parts.push(h('p.empty', { text: 'Nobody has written about your train yet. Make your first station stop and the press will come.' }));
    } else {
      parts.push(this.story(lead, true));
    }

    // The league table: who is ahead, and who to overtake next.
    const standing = press.standing;
    const reputation = g.data.route.stars;
    const table = [...RIVALS.map((r) => ({ name: r.name, rep: r.reputation, blurb: r.blurb, you: false, livery: r.livery })),
      { name: press.trainName, rep: reputation, blurb: 'That’s you.', you: true, livery: '' }]
      .sort((a, b) => b.rep - a.rep || (a.you ? -1 : 1));
    parts.push(h('div.section-title', { text: 'Countryside League' }));
    if (standing.next) parts.push(h('p.target', {}, icon('trophy', 18), `Overtake ${standing.next.name}: ${formatNumber(standing.next.reputation - reputation)} stars to go`));
    else parts.push(h('p.target', {}, icon('trophy', 18), 'Number one on the line!'));
    parts.push(h('ol.league', {}, ...table.map((row, i) => h(`li${row.you ? '.you' : ''}` as 'li', {},
      h('span.rank', { text: String(i + 1) }),
      h('span.swatch', { style: { background: row.you ? g.currentLivery().body : row.livery } }),
      h('span.name', {}, h('b', { text: row.name }), h('small', { text: row.blurb })),
      h('span.rep', {}, icon('star', 14), formatNumber(row.rep)),
    ))));

    // The Golden Whistle: trophies won, and what the next ceremony will judge.
    parts.push(h('div.section-title', { text: 'Golden Whistle' }));
    const won = g.data.press.awards;
    const allAwards = CEREMONIES.flatMap((c) => c.awards);
    if (won.length > 0) parts.push(h('div.trophies', {}, ...allAwards.filter((a) => won.includes(a.id)).map((a) => h('span.trophy', {}, icon('trophy', 22), a.name))));
    const next = CEREMONIES.find((c) => !g.data.press.ceremonies.includes(c.level));
    if (next) {
      const stats = g.data.press.stats;
      parts.push(h('p.small', { text: `Next ceremony at route level ${next.level}. The judges are watching:` }));
      for (const award of next.awards) {
        const p = awardProgress(award, stats, standing.rank);
        const pct = Math.round(Math.min(1, p.have / Math.max(1, p.need)) * 100);
        parts.push(h('div.quest', {},
          icon('trophy', 26),
          h('div.info', {}, `${award.name}: ${award.hint}`, h('div.bar', {}, h('i', { style: { width: `${pct}%` } }))),
        ));
      }
    }

    if (items.length > 1) {
      parts.push(h('div.section-title', { text: 'Earlier' }));
      for (const item of items.slice(1)) parts.push(this.story(item, false));
    }
    this.screens.sheet('Rail Gazette', 'news', parts, { className: 'gazette' });
  }

  private story(item: NewsItem, lead: boolean): HTMLElement {
    if (!lead) return h('div.story.news', {}, h('b', { text: item.headline }), h('p', { text: item.body }));
    const photo = h('canvas.photo', { width: 600, height: 260 });
    drawTrainPhoto(photo, item);
    return h('article.lead-story', {}, photo, h('h3', { text: item.headline }), h('p', { text: item.body }));
  }
}

function perkIcon(kind: string): 'cash' | 'ticket' | 'bolt' {
  return kind === 'tipBonus' ? 'cash' : kind === 'fareBonus' ? 'ticket' : 'bolt';
}

/**
 * The paper's photo: your train as it looked that day (its livery and how many carriages it had), crossing
 * the countryside, printed in soft newsprint tones.
 */
export function drawTrainPhoto(canvas: HTMLCanvasElement, item: Pick<NewsItem, 'livery' | 'trim' | 'carriages' | 'id'>): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const hgt = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, hgt);
  sky.addColorStop(0, '#E9DFC9');
  sky.addColorStop(1, '#F4ECDB');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hgt);
  // Hills, fields, a tree line: every photo is a little different.
  const seed = item.id * 1.7;
  const layers: [number, string][] = [[0.52, '#CFD3B0'], [0.62, '#B9C497'], [0.74, '#A9B886']];
  layers.forEach(([y, color], i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, hgt * y + Math.sin(x / (60 + i * 20) + seed + i) * (10 - i * 2));
    ctx.lineTo(w, hgt);
    ctx.fill();
  });
  ctx.fillStyle = '#8FA274';
  for (let i = 0; i < 7; i++) {
    const x = ((i * 97 + item.id * 53) % w);
    ctx.beginPath();
    ctx.arc(x, hgt * 0.6, 14 + (i % 3) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Track.
  const railY = hgt * 0.8;
  ctx.fillStyle = '#9C8E7C';
  ctx.fillRect(0, railY + 16, w, 5);
  // The train, right to left: locomotive then carriages.
  const n = Math.max(1, Math.min(6, item.carriages));
  const carW = Math.min(92, (w - 150) / n);
  let x = w - 30 - 110;
  const body = item.livery;
  // Locomotive: boiler, cab, chimney with a puff of steam.
  ctx.fillStyle = body;
  ctx.fillRect(x + 20, railY - 36, 70, 36);
  ctx.fillRect(x, railY - 56, 34, 56);
  ctx.fillStyle = item.trim;
  ctx.fillRect(x + 4, railY - 48, 26, 12);
  ctx.fillStyle = '#2E2D34';
  ctx.fillRect(x + 72, railY - 58, 12, 22);
  ctx.fillStyle = '#FFFFFFCC';
  for (const [dx, dy, r] of [[78, -70, 10], [66, -86, 14], [48, -100, 18]] as const) {
    ctx.beginPath();
    ctx.arc(x + dx, railY + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2E2D34';
  for (const dx of [10, 40, 70]) {
    ctx.beginPath();
    ctx.arc(x + dx, railY + 8, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < n; i++) {
    x -= carW + 6;
    ctx.fillStyle = body;
    ctx.fillRect(x, railY - 44, carW, 44);
    ctx.fillStyle = item.trim;
    ctx.fillRect(x, railY - 10, carW, 4);
    ctx.fillStyle = '#FBEBC0';
    const windows = Math.max(2, Math.floor(carW / 22));
    for (let k = 0; k < windows; k++) ctx.fillRect(x + 6 + k * ((carW - 12) / windows), railY - 34, (carW - 12) / windows - 6, 14);
    ctx.fillStyle = '#2E2D34';
    for (const dx of [12, carW - 12]) {
      ctx.beginPath();
      ctx.arc(x + dx, railY + 6, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Newsprint: a light sepia wash and a fine halftone.
  ctx.fillStyle = 'rgba(120, 96, 64, 0.12)';
  ctx.fillRect(0, 0, w, hgt);
  ctx.fillStyle = 'rgba(42, 36, 51, 0.06)';
  for (let yy = 0; yy < hgt; yy += 4) for (let xx = (yy / 4) % 2 ? 2 : 0; xx < w; xx += 4) ctx.fillRect(xx, yy, 1.2, 1.2);
}
