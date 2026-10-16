import { CONDUCTOR_LOOK, type CharacterView } from '../world/CharacterView';
import { log } from '../core/log';
import type { Game } from './Game';

/** How often the checks run (seconds) and how close two standing characters may be before it warns (metres). */
const CHECK_SECONDS = 1;
const SAME_SPOT = 0.04;
/** The same warning is logged again after this long at the earliest (seconds). */
const REPEAT_SECONDS = 10;

/**
 * Session 32's safety net for the character swap (owner: "a debug mode that warns if anything goes wrong"): with
 * `?debug=1` it checks every second that the player is the conductor, no two characters stand on the same spot or
 * sleep in the same bed, no character, mesh or material is shared between two people, every drawn part has an owner,
 * and the guest pool's active plus pooled count holds steady. Warnings go to the console and the small panel shows
 * the counts and the GPU.
 */
export class CharacterDebug {
  private timer = 0;
  private readonly said = new Map<string, number>();
  private time = 0;
  private readonly panel: HTMLDivElement;
  private readonly gpu: string;
  private poolTotal = -1;

  constructor(private readonly g: Game, root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'char-debug';
    root.appendChild(this.panel);
    this.gpu = gpuName(g.stage.renderer.getContext());
    log.info('Debug', `characters drawn by the pull batch; GPU ${this.gpu}`);
  }

  update(dt: number): void {
    this.time += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CHECK_SECONDS;
    const g = this.g;
    const people: { who: string; view: CharacterView }[] = [{ who: 'player', view: g.player.view }];
    g.staff.members.forEach((m, i) => people.push({ who: `${m.role} ${i}`, view: m.view }));
    for (const guest of g.guests.list) {
      people.push({ who: `guest ${guest.archetype.id} (${guest.state}${guest.spot ? ` ${guest.spot}` : ""})`, view: guest.view });
      if (guest.child) people.push({ who: `child of ${guest.archetype.id}`, view: guest.child });
    }

    // The player is always the conductor.
    // (The uniform follows the wardrobe; the face, the hair and the moustache are the conductor's own.)
    const look = g.player.view.look;
    if (look.skin !== CONDUCTOR_LOOK.skin || look.hair !== CONDUCTOR_LOOK.hair || !look.moustache) this.warn('player', 'the player is not the conductor');
    if (people.some((p, i) => i > 0 && p.view === g.player.view)) this.warn('player-shared', "someone else is drawn with the player's character");

    // Nothing shared between two people: the character, its meshes, its materials.
    const roots = new Set<unknown>();
    const meshes = new Set<unknown>();
    for (const p of people) {
      if (roots.has(p.view)) this.warn(`dup:${p.who}`, `${p.who} shares a character with someone else`);
      roots.add(p.view);
      p.view.root.traverse((o) => {
        const mesh = o as { isMesh?: boolean; userData: { shared?: boolean } };
        if (!mesh.isMesh || mesh.userData.shared) return;
        if (meshes.has(o)) this.warn(`mesh:${p.who}`, `${p.who} shares a mesh with someone else`);
        meshes.add(o);
      });
    }

    // Two people on one spot (standing, in view) or in one bed.
    const standing = people.filter((p) => p.view.root.visible && p.view.root.parent);
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i].view.root.position;
        const b = standing[j].view.root.position;
        if (Math.abs(a.x - b.x) < SAME_SPOT && Math.abs(a.z - b.z) < SAME_SPOT && Math.abs(a.y - b.y) < SAME_SPOT) {
          this.warn(`spot:${standing[i].who}:${standing[j].who}`, `${standing[i].who} and ${standing[j].who} stand on the same spot`);
        }
      }
    }
    const beds = new Map<unknown, string>();
    for (const guest of g.guests.list) {
      if (!guest.cabin || !guest.inCabin) continue;
      const other = beds.get(guest.cabin);
      if (other) this.warn(`bed:${other}`, `${other} and guest ${guest.archetype.id} are in the same room`);
      beds.set(guest.cabin, `guest ${guest.archetype.id}`);
      if (guest.cabin.guest !== guest) this.warn(`room:${guest.archetype.id}`, `guest ${guest.archetype.id} is in a room booked to someone else`);
    }

    // Every part the batch draws has an owner; no slot used twice.
    for (const problem of g.characters.audit()) this.warn(`batch:${problem}`, problem);

    // The pool: active plus pooled stays constant.
    const pool = g.guests.views;
    const total = pool.active.size + pool.pooled;
    if (this.poolTotal >= 0 && total !== this.poolTotal) this.warn('pool', `guest pool changed size: ${this.poolTotal} → ${total}`);
    this.poolTotal = total;

    const stats = g.characters.stats();
    this.panel.textContent = `${this.gpu}\npeople ${people.length} · parts ${stats.parts}\npool active ${pool.active.size} · pooled ${pool.pooled} · total ${total}`;
  }

  private warn(key: string, message: string): void {
    const last = this.said.get(key);
    if (last !== undefined && this.time - last < REPEAT_SECONDS) return;
    this.said.set(key, this.time);
    log.warn('Characters', message);
  }
}

/** The GPU's name where the browser shares it (the swap bug was tied to some Android GPUs). */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(name);
}
