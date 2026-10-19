// The Pixi stage: one canvas in the portrait frame, layers in draw order, and the world-to-screen scale.
// World units are metres with +y up; the world container flips to Pixi's +y down (see toScreenY).
import { Application, Container } from 'pixi.js';
import { VIEW } from './config';

export interface Layers {
  /** Screen-space backdrop (parallax). */
  backdrop: Container;
  /** Everything below moves with the camera. */
  world: Container;
  /** The Workshop's build stand (only on the Workshop screen). */
  workshop: Container;
  terrain: Container;
  decor: Container;
  actors: Container;
  fx: Container;
  fxAdd: Container;
  debug: Container;
}

/** Sim y (up) to Pixi y (down). */
export const toScreenY = (y: number) => -y;

export class Stage {
  readonly app = new Application();
  readonly layers: Layers;
  /** CSS pixels per metre. */
  ppm = 40;
  widthPx = 390;
  heightPx = 844;
  private resizeListeners: (() => void)[] = [];
  /** Draw calls in the last rendered frame (WebGL calls counted at the context). */
  drawCalls = 0;
  private drawCounter = 0;

  constructor(private readonly host: HTMLElement) {
    const world = new Container();
    const layers: Layers = {
      backdrop: new Container(),
      world,
      workshop: new Container(),
      terrain: new Container(),
      decor: new Container(),
      actors: new Container(),
      fx: new Container(),
      fxAdd: new Container(),
      debug: new Container(),
    };
    layers.fxAdd.blendMode = 'add';
    world.addChild(layers.workshop, layers.terrain, layers.decor, layers.actors, layers.fx, layers.fxAdd, layers.debug);
    this.layers = layers;
  }

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      resolution: Math.min(window.devicePixelRatio || 1, VIEW.maxResolution),
      autoDensity: true,
      antialias: true,
      background: '#14121F',
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.app.canvas.classList.add('stage');
    this.host.prepend(this.app.canvas);
    this.app.stage.addChild(this.layers.backdrop, this.layers.world);
    this.app.ticker.stop();
    this.countDrawCalls();
    this.measure();
    new ResizeObserver(() => {
      this.measure();
      for (const fn of this.resizeListeners) fn();
    }).observe(this.host);
  }

  onResize(fn: () => void): void {
    this.resizeListeners.push(fn);
  }

  /** Visible world height, metres. */
  get viewHeightM(): number {
    return this.heightPx / this.ppm;
  }

  get viewWidthM(): number {
    return this.widthPx / this.ppm;
  }

  render(): void {
    this.drawCounter = 0;
    this.app.renderer.render(this.app.stage);
    this.drawCalls = this.drawCounter;
  }

  private countDrawCalls(): void {
    const gl = (this.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    if (!gl) return;
    const elements = gl.drawElements.bind(gl);
    const arrays = gl.drawArrays.bind(gl);
    gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
      this.drawCounter++;
      elements(...args);
    };
    gl.drawArrays = (...args: Parameters<typeof gl.drawArrays>) => {
      this.drawCounter++;
      arrays(...args);
    };
  }

  private measure(): void {
    const rect = this.host.getBoundingClientRect();
    this.widthPx = Math.max(1, rect.width);
    this.heightPx = Math.max(1, rect.height);
    this.ppm = this.widthPx / VIEW.widthM;
  }
}
