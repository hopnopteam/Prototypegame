// The backdrop: tiling cave layers that scroll slower than the course, darker and quieter the farther they are.
import { Container, TilingSprite } from 'pixi.js';
import { texture } from './assets';
import type { Stage } from './Stage';

const LAYERS = [
  { id: 'bg.w1.far', factor: 0.18 },
  { id: 'bg.w1.mid', factor: 0.42 },
] as const;

export class Parallax {
  private readonly sprites: TilingSprite[] = [];

  constructor(private readonly stage: Stage, parent: Container) {
    for (const layer of LAYERS) {
      const sprite = new TilingSprite({ texture: texture(layer.id), width: stage.widthPx, height: stage.heightPx });
      parent.addChild(sprite);
      this.sprites.push(sprite);
    }
    this.resize();
  }

  resize(): void {
    for (const s of this.sprites) {
      s.width = this.stage.widthPx;
      s.height = this.stage.heightPx;
      const k = this.stage.widthPx / s.texture.width;
      s.tileScale.set(k);
    }
  }

  /** Scrolls with the camera height (metres). */
  update(camY: number): void {
    LAYERS.forEach((layer, i) => {
      this.sprites[i].tilePosition.y = camY * this.stage.ppm * layer.factor;
    });
  }

  set visible(v: boolean) {
    for (const s of this.sprites) s.visible = v;
  }
}
