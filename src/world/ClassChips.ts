import * as THREE from 'three';
import type { ClassDef } from '../config/classes';
import { drawIcon, INK } from '../ui/icons';
import { FLOOR_Y } from './CarriageView';
import { WORLD_UI_LAYER } from './CameraRig';
import { CARRIAGE_LENGTH, HALF_WIDTH } from './layout';
import { TILE_FONT } from './sprites';

/** Where a chip floats: over the lake side of its carriage, just above the wall tops. */
const CHIP_X = -(HALF_WIDTH + 1.2);
const CHIP_Y = FLOOR_Y + 2.1;
/** World height of a chip at the default zoom (its width follows the label); about 26 px of pill on a phone. */
const CHIP_HEIGHT = 0.82;
/** How much of the camera's pull-back the chip makes up for (1 = constant on screen), so it stays readable. */
const ZOOM_FOLLOW = 0.7;
/** The chips' navy enamel (the mockup's), with the class colour carried by the emblem disc. */
const CHIP_NAVY = '#1E2B4D';
const CHIP_NAVY_TOP = '#2D3F6B';

const cache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/**
 * A class chip: a navy pill with the class emblem on a disc of its colour, the class name, and a pointer
 * down to the carriage; First and Royal get a gold rim. Drawn once per class (and again once the display
 * font has loaded).
 */
function chipTexture(cls: ClassDef): { texture: THREE.CanvasTexture; aspect: number } {
  const key = `${cls.id}:${document.fonts?.check?.(`800 40px ${TILE_FONT}`) ? 'font' : 'fallback'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const h = 104;
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `800 38px ${TILE_FONT}`;
  const textWidth = measure.measureText(cls.chip).width;
  const pillH = 70;
  const disc = pillH - 14;
  const w = Math.ceil(8 + 7 + disc + 14 + textWidth + 26);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
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
  const enamel = ctx.createLinearGradient(0, y0, 0, y1);
  enamel.addColorStop(0, CHIP_NAVY_TOP);
  enamel.addColorStop(1, CHIP_NAVY);
  ctx.fillStyle = enamel;
  ctx.fill();
  const gold = cls.tier >= 4;
  ctx.lineWidth = gold ? 6 : 5;
  ctx.strokeStyle = gold ? '#E2B653' : INK;
  ctx.stroke();
  // The emblem on a disc of the class colour: the colour code at a glance.
  const cx = x0 + 7 + disc / 2;
  const cy = y0 + pillH / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, disc / 2, 0, Math.PI * 2);
  ctx.fillStyle = cls.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  drawIcon(ctx, cls.icon, cx - disc * 0.36, cy - disc * 0.36, disc * 0.72);
  ctx.font = `800 38px ${TILE_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = gold ? '#FFE2A0' : '#FFFFFF';
  ctx.fillText(cls.chip, x0 + 7 + disc + 14, cy + 2);
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
  sync(classes: readonly (ClassDef | null)[], originZ: (i: number) => number, dt: number, zoom = 1): void {
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
      const bounce = (1 + Math.sin(chip.pop * Math.PI) * 0.35) * (1 + (zoom - 1) * ZOOM_FOLLOW);
      const aspect = (chip.sprite.userData.aspect as number) ?? 3;
      chip.sprite.scale.set(CHIP_HEIGHT * aspect * bounce, CHIP_HEIGHT * bounce, 1);
      chip.sprite.position.set(CHIP_X, CHIP_Y, originZ(i) + CARRIAGE_LENGTH / 2);
    }
  }
}
