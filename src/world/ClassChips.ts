import * as THREE from 'three';
import type { ClassDef } from '../config/classes';
import { drawIcon, INK } from '../ui/icons';
import { FLOOR_Y } from './CarriageView';
import { WORLD_UI_LAYER } from './CameraRig';
import { CARRIAGE_LENGTH, HALF_WIDTH } from './layout';
import { TILE_FONT } from './sprites';

/** Where a chip floats: over the lake side of its carriage, just above the wall tops. */
const CHIP_X = -(HALF_WIDTH + 0.55);
const CHIP_Y = FLOOR_Y + 1.95;
/** World height of a chip (its width follows the label). */
const CHIP_HEIGHT = 0.46;

const cache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/**
 * A class chip: a pill in the class's colour with its emblem and name, and a pointer down to the carriage.
 * Drawn once per class (and again once the display font has loaded).
 */
function chipTexture(cls: ClassDef): { texture: THREE.CanvasTexture; aspect: number } {
  const key = `${cls.id}:${document.fonts?.check?.(`800 40px ${TILE_FONT}`) ? 'font' : 'fallback'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const h = 104;
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `800 40px ${TILE_FONT}`;
  const textWidth = measure.measureText(cls.chip).width;
  const w = Math.ceil(24 + 52 + 12 + textWidth + 28);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const pillH = 70;
  const r = pillH / 2;
  const x0 = 4;
  const y0 = 4;
  const x1 = w - 4;
  const y1 = y0 + pillH;
  // Pill with a pointer at the bottom middle, inked like every other badge in the game.
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.arc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(w / 2 + 14, y1);
  ctx.lineTo(w / 2, y1 + 22);
  ctx.lineTo(w / 2 - 14, y1);
  ctx.lineTo(x0 + r, y1);
  ctx.arc(x0 + r, y0 + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = cls.color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // A soft highlight along the top: enamel, like the HUD's counters.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, y0, w, pillH * 0.42);
  ctx.restore();
  drawIcon(ctx, cls.icon, x0 + 16, y0 + 9, 52);
  ctx.font = `800 40px ${TILE_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cls.ink;
  ctx.fillText(cls.chip, x0 + 16 + 52 + 12, y0 + pillH / 2 + 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const entry = { texture, aspect: w / h };
  cache.set(key, entry);
  return entry;
}

interface Chip {
  sprite: THREE.Sprite;
  cls: string;
  pop: number;
}

/**
 * The class chip over every passenger carriage (world UI: hidden in the intro, like pads and bubbles). It pops
 * when the carriage moves up a class.
 */
export class ClassChips {
  readonly group = new THREE.Group();
  private readonly chips: (Chip | null)[] = [];
  private fontReady = false;

  constructor() {
    document.fonts?.ready.then(() => (this.fontReady = true)).catch(() => undefined);
  }

  /** Keeps one chip per passenger carriage, showing its class (null for service cars). */
  sync(classes: readonly (ClassDef | null)[], originZ: (i: number) => number, dt: number): void {
    const redraw = this.fontReady;
    if (redraw) this.fontReady = false;
    for (let i = 0; i < Math.max(classes.length, this.chips.length); i++) {
      const cls = classes[i] ?? null;
      let chip = this.chips[i] ?? null;
      if (!cls) {
        if (chip) {
          this.group.remove(chip.sprite);
          chip.sprite.material.dispose();
          this.chips[i] = null;
        }
        continue;
      }
      if (!chip) {
        const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.layers.set(WORLD_UI_LAYER);
        sprite.renderOrder = 9;
        sprite.center.set(0.5, 0.1);
        this.group.add(sprite);
        chip = { sprite, cls: '', pop: 0 };
        this.chips[i] = chip;
      }
      if (chip.cls !== cls.id || redraw) {
        if (chip.cls && chip.cls !== cls.id) chip.pop = 1;
        chip.cls = cls.id;
        const { texture, aspect } = chipTexture(cls);
        chip.sprite.material.map = texture;
        chip.sprite.material.needsUpdate = true;
        chip.sprite.userData.aspect = aspect;
      }
      chip.pop = Math.max(0, chip.pop - dt * 1.6);
      const bounce = 1 + Math.sin(chip.pop * Math.PI) * 0.35;
      const aspect = (chip.sprite.userData.aspect as number) ?? 3;
      chip.sprite.scale.set(CHIP_HEIGHT * aspect * bounce, CHIP_HEIGHT * bounce, 1);
      chip.sprite.position.set(CHIP_X, CHIP_Y, originZ(i) + CARRIAGE_LENGTH / 2);
    }
  }
}
