import * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from './CarriageView';
import { createFillMaterial } from './materials';
import { bubbleTexture, jobFillTexture, makeSprite, TILE_MARKER_ASPECT, TILE_MARKER_WIDTH, TileFace, TileMarker, tileFillTextures } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';
import { VISUALS } from '../config/visuals';
import { nearMarker, noteMarker, offFrame, underPopup } from './screenMask';

/** Moves an object and everything in it onto the world-UI layer. */
export function markWorldUi(object: THREE.Object3D): void {
  object.traverse((o) => o.layers.set(WORLD_UI_LAYER));
}

/** A job's sign gives way to a tile marker this close to it (metres, across the floor). */
const PAD_MARKER_REACH = 1.0;
/** How long a sign's pop lasts when its job is done (seconds), and how much it grows. */
const DONE_POP_SECONDS = 0.28;
const DONE_POP_SCALE = 0.22;

/**
 * A job's sign (session 27, owner: "you clean a room simply by standing close to it, with a hover sign indicating the
 * action… the hover indicator fills up as they perform the activity… the current rings are distracting"): nothing on
 * the floor at all. A blue badge with the job's icon floats over the thing it is about (the espresso machine, the urn,
 * the desk, a washroom's shelf, the shoes by a door, the bed of a room to tidy) while the job wants you, and a green
 * ring round it fills as you do it, then the badge pops. Where you may stand to do it is the zone's business
 * (`ZoneSystem`: near the badge, near the job's spot, or anywhere in its room).
 */
export class JobMarker {
  readonly group = new THREE.Group();
  private readonly badge: THREE.Sprite | null;
  private readonly fill: THREE.Sprite | null;
  private readonly fillMaterial: THREE.SpriteMaterial | null;
  private iconHeight: number;
  private readonly baseIconHeight: number;
  /** Where the badge hangs, from the zone's centre (over the furniture it serves). */
  private iconX = 0;
  private iconZ = 0;
  private time = Math.random() * 5;
  private lit = false;
  private litAmount = 0;
  private lastProgress = 0;
  private popT = DONE_POP_SECONDS;
  private shownAmount = 0;
  private progressValue = 0;
  private iconAllowed = true;
  /** The player is the one doing the job here (only their work shows the filling ring). */
  working = false;

  constructor(icon: IconName | null, iconHeight = VISUALS.pads.iconHeight) {
    this.iconHeight = iconHeight;
    this.baseIconHeight = iconHeight;
    if (icon) {
      this.badge = makeSprite(bubbleTexture(icon, 'job'), VISUALS.pads.icon);
      this.fillMaterial = createFillMaterial(jobFillTexture());
      this.fill = new THREE.Sprite(this.fillMaterial);
      this.fill.renderOrder = 11;
      this.fill.visible = false;
      this.group.add(this.badge, this.fill);
    } else {
      this.badge = null;
      this.fill = null;
      this.fillMaterial = null;
    }
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  set progress(value: number) {
    // A job done (the fill went back to empty from nearly full): the badge pops.
    if (value < 0.05 && this.lastProgress > 0.85) this.popT = 0;
    this.lastProgress = value;
    this.progressValue = value;
  }

  set visible(value: boolean) {
    this.group.visible = value;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** How high the badge's centre hangs over the floor (metres). */
  get height(): number {
    return this.iconHeight;
  }

  /** "You're needed here": the badge bobs higher and grows a little. */
  set highlight(value: boolean) {
    this.lit = value;
  }

  set iconShown(value: boolean) {
    this.iconAllowed = value;
  }

  /** A job that changes shows the icon of the job now. */
  setIcon(name: IconName): void {
    if (!this.badge) return;
    (this.badge.material as THREE.SpriteMaterial).map = bubbleTexture(name, 'job');
  }

  /**
   * The badge hangs over the furniture the job serves: `dx`, `dz` from the zone's centre and the height over the floor
   * (null: over the zone itself, at the usual height).
   */
  setIconAnchor(dx: number, dz: number, height: number | null): void {
    this.iconX = dx;
    this.iconZ = dz;
    this.iconHeight = height ?? this.baseIconHeight;
  }

  update(dt: number): void {
    if (!this.badge || !this.fill || !this.fillMaterial) return;
    this.time += dt;
    // Session 37: eased slowly, so a badge picked out by the guide grows in instead of jumping (it read as a flash).
    this.litAmount += ((this.lit ? 1 : 0) - this.litAmount) * Math.min(1, dt * 3);
    const lit = this.litAmount;
    this.popT = Math.min(DONE_POP_SECONDS, this.popT + dt);
    const popping = this.popT < DONE_POP_SECONDS;
    // Up while the job wants you, while the player is at it, and through the pop that says it is done.
    const fillShown = this.working && this.progressValue > 0.01;
    const want = this.iconAllowed || fillShown || popping;
    this.shownAmount += ((want ? 1 : 0) - this.shownAmount) * Math.min(1, dt * 5);
    // Fix list 6.3: the badge gives way to a pop-up over it and to a tile's marker right beside it.
    const gp = this.group.position;
    const ix = gp.x + this.iconX;
    const iz = gp.z + this.iconZ;
    const shown = this.shownAmount > 0.02 && !nearMarker(ix, iz, PAD_MARKER_REACH) && !underPopup(ix, FLOOR_Y + this.iconHeight, iz);
    this.badge.visible = shown;
    this.fill.visible = shown && (fillShown || popping);
    if (!shown) return;
    // Steady while you work at it (a bobbing target is hard to read); a gentle bob while it waits for you.
    const bob = fillShown ? 0 : Math.sin(this.time * 2.2) * (0.05 + lit * 0.03);
    const y = FLOOR_Y + this.iconHeight + lit * 0.22 + bob;
    const pop = 1 + DONE_POP_SCALE * Math.sin((this.popT / DONE_POP_SECONDS) * Math.PI);
    const s = (VISUALS.pads.icon + lit * VISUALS.pads.iconLit) * pop * (0.6 + 0.4 * this.shownAmount);
    this.badge.position.set(this.iconX, y, this.iconZ);
    this.badge.scale.set(s, s, 1);
    (this.badge.material as THREE.SpriteMaterial).opacity = this.shownAmount;
    this.fill.position.copy(this.badge.position);
    this.fill.scale.set(s, s, 1);
    // Full and green through the pop; otherwise as far round as the job has got.
    this.fillMaterial.userData.fill.value = popping ? 1 : this.progressValue;
  }
}

/** How far the tile's pad stands proud of the floor: a physical plate you step on, not a sticker. */
const PAD_HEIGHT = 0.06;
/** How high a tile's marker floats over the floor: above the room walls, below the HUD's reach. */
const MARKER_HEIGHT = 1.3;
/** A quiet marker (not affordable, not the focus) is this much smaller and this much more transparent. */
const QUIET_SHRINK = 0.2;
const QUIET_FADE = 0.2;
/** Where a tile's floating marker hangs (world height); the close-up label takes its exact place. */
export const TILE_MARKER_Y = FLOOR_Y + MARKER_HEIGHT;
/** Lip colours by state (the face's border colour, a shade darker). */
const LIP = { idle: '#9C7A52', affordable: '#2F7D50', active: '#C8891B', locked: '#8D8478' };

/** A rounded square, as flat geometry lying on the floor (the pad under a tile's face). */
function roundedPad(size: number, height: number): THREE.BufferGeometry {
  const half = size / 2;
  const r = size * (30 / 256);
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * MPH-style unlock tile: a raised, rounded plate on the floor with a bright face showing what it unlocks and
 * what is left to pay. Its lip takes the state colour (green when you can afford it, gold while paying).
 */
/** How quickly a tile's fill catches up with what has been paid (per second). */
const FILL_EASE = 9;
/** The rising edge's height, as a share of the card. */
const FILL_EDGE = 0.028;
/** How quickly the plate presses down and springs back up (per second). */
const PRESS_EASE = 14;
/** A landing bill's throb: its size and how fast it fades. */
const THROB = 0.05;
const THROB_DECAY = 7;

export class TileView {
  readonly group = new THREE.Group();
  readonly face = new TileFace();
  /** Floats over the plate: what it is and what it costs, never hidden behind a wall. */
  readonly marker = new TileMarker();
  /** How quiet its marker is now (0 loud, 1 quiet), eased so a tile turning affordable grows smoothly. */
  private quiet = 0;
  private readonly pad = new THREE.Group();
  private readonly plane: THREE.Mesh;
  private readonly top: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly edge: THREE.Mesh;
  private readonly fillMap: THREE.Texture;
  private readonly edgeMap: THREE.Texture;
  private readonly lip: THREE.Mesh;
  private readonly lipMaterial = new THREE.MeshLambertMaterial({ color: LIP.idle });
  private lipState = '';
  private time = Math.random() * 3;
  private popT = 1;
  /** The fill as drawn: eased toward what has been paid, so it glides rather than ticking up a bill at a time. */
  private shownFill = 0;
  private fillTarget = 0;
  /** How far the plate is pressed (0 up, 1 down), eased so stepping on and off is a soft press, not a snap. */
  private press = 0;
  /** A little throb each time a bill lands. */
  private throb = 0;

  constructor(private readonly size = 1.3, private readonly locked = false) {
    const layer = (map: THREE.Texture, order: number, offset: number): THREE.Mesh => {
      const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
      // Spans z 0 (the card's bottom edge, v = 0) to −size (its top), so scaling z crops it from the bottom up.
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(0, 0, -size / 2), material);
      mesh.position.set(0, 0.004 + PAD_HEIGHT + 0.008, size / 2);
      mesh.renderOrder = order;
      return mesh;
    };
    const [fillMask, edgeMask] = tileFillTextures();
    this.fillMap = fillMask.clone();
    this.edgeMap = edgeMask.clone();
    this.lip = new THREE.Mesh(roundedPad(size * 0.97, PAD_HEIGHT), this.lipMaterial);
    this.lip.position.y = 0.004;
    this.lip.receiveShadow = true;
    this.plane = layer(this.face.base, 3, -4);
    this.fill = layer(this.fillMap, 4, -5);
    this.edge = layer(this.edgeMap, 5, -6);
    this.top = layer(this.face.texture, 6, -7);
    this.fill.visible = false;
    this.edge.visible = false;
    // The pad pivots on the floor, so pressing it squashes the plate down onto the floor, never through it.
    this.pad.position.y = FLOOR_Y;
    this.pad.add(this.lip, this.plane, this.fill, this.edge, this.top);
    this.group.add(this.pad);
    this.marker.sprite.position.y = FLOOR_Y + MARKER_HEIGHT;
    this.group.add(this.marker.sprite);
    this.popT = 0;
    this.setLip(locked ? 'locked' : 'idle');
  }

  /** What has been paid, 0–1; the plate eases its fill there. */
  setFill(share: number): void {
    this.fillTarget = Math.max(0, Math.min(1, share));
    if (this.fillTarget < this.shownFill - 0.02) this.shownFill = this.fillTarget;
  }

  /** A bill has landed: the plate throbs. */
  bump(): void {
    this.throb = 1;
  }

  private drawFill(dt: number): void {
    this.shownFill += (this.fillTarget - this.shownFill) * Math.min(1, dt * FILL_EASE);
    if (Math.abs(this.fillTarget - this.shownFill) < 0.0005) this.shownFill = this.fillTarget;
    const p = this.shownFill;
    const shown = p > 0.002;
    this.fill.visible = shown;
    this.edge.visible = shown && p < 0.995;
    if (!shown) return;
    this.fill.scale.z = p;
    this.fillMap.repeat.y = p;
    // The bright line rides the level: a thin band of the card's shape centred on it.
    const lo = Math.max(0, p - FILL_EDGE / 2);
    const hi = Math.min(1, p + FILL_EDGE / 2);
    this.edge.position.z = this.size / 2 - lo * this.size;
    this.edge.scale.z = Math.max(0.0001, hi - lo);
    this.edgeMap.offset.y = lo;
    this.edgeMap.repeat.y = hi - lo;
  }

  private setLip(state: keyof typeof LIP): void {
    if (state === this.lipState) return;
    this.lipState = state;
    this.lipMaterial.color.set(LIP[state]);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  /**
   * `marker`: whether the floating marker shows (the close-up label takes its place near the conductor);
   * `quiet`: a tile you cannot afford yet and the guide is not pointing at wears a smaller, softer marker
   * (session 23: every upgrade always in view, the one that matters now the loudest).
   */
  update(dt: number, affordable: boolean, active: boolean, marker = true, quiet = false): void {
    this.time += dt;
    this.popT = Math.min(1, this.popT + dt * 3);
    const appear = this.popT < 1 ? 0.4 + 0.6 * Math.sin(this.popT * Math.PI * 0.5) * 1.08 : 1;
    const breathe = affordable && !active ? 1 + Math.sin(this.time * 4) * 0.035 : 1;
    this.throb = Math.max(0, this.throb - dt * THROB_DECAY);
    const s = appear * breathe * (1 + THROB * this.throb * this.throb);
    // Stepping on it presses the plate down a little, like a real button.
    this.press += ((active ? 1 : 0) - this.press) * Math.min(1, dt * PRESS_EASE);
    this.pad.scale.set(s, 1 - 0.55 * this.press, s);
    this.drawFill(dt);
    // The marker bobs gently, and steps aside while you stand on the tile (the plate shows the fill) or a pop-up is
    // over it (fix list 6.3).
    const gp = this.group.position;
    // De-Slop B3: never cut off at the screen's edge either.
    const shown = marker && !active && !underPopup(gp.x, FLOOR_Y + MARKER_HEIGHT, gp.z) && !offFrame(gp.x, FLOOR_Y + MARKER_HEIGHT + 0.3, gp.z, TILE_MARKER_WIDTH * 0.5);
    this.marker.sprite.visible = shown;
    if (shown) noteMarker(gp.x, gp.z);
    this.marker.sprite.position.y = FLOOR_Y + MARKER_HEIGHT + Math.sin(this.time * 2.2) * 0.04;
    this.quiet += ((quiet ? 1 : 0) - this.quiet) * Math.min(1, dt * 6);
    const size = appear * (1 - QUIET_SHRINK * this.quiet);
    this.marker.sprite.scale.set(TILE_MARKER_WIDTH * size, TILE_MARKER_WIDTH * TILE_MARKER_ASPECT * size, 1);
    (this.marker.sprite.material as THREE.SpriteMaterial).opacity = 1 - QUIET_FADE * this.quiet;
    if (!this.locked) this.setLip(active ? 'active' : affordable ? 'affordable' : 'idle');
  }

  dispose(): void {
    this.face.dispose();
    this.marker.dispose();
    for (const mesh of [this.plane, this.fill, this.edge, this.top]) {
      (mesh.material as THREE.Material).dispose();
      mesh.geometry.dispose();
    }
    this.fillMap.dispose();
    this.edgeMap.dispose();
    this.lip.geometry.dispose();
    this.lipMaterial.dispose();
  }
}
