import * as THREE from 'three';
import type { OutfitDef } from '../config/wardrobe';
import { SHOES_BY_SPEED } from '../config/wardrobe';
import { CharacterView, type CharacterLook } from './CharacterView';
import { faceDepth, LEG_LENGTH, SHOULDER_X, SHOULDER_Y } from './CharacterParts';
import { GeoBuilder } from './geo';
import { LIGHT_UNIFORMS, MATERIALS } from './materials';
import { PALETTE } from './palette';

export interface GearState {
  outfit: OutfitDef;
  speedLevel: number;
  capacityLevel: number;
  charmLevel: number;
  /** The rewarded roller skates are on. */
  skating: boolean;
  /** Owns the Conductor's Scooter. */
  scooter: boolean;
  /** Double fares at this stop. */
  doubled: boolean;
  /** How fast the conductor is going (m/s), for the scooter's wheels. */
  speed: number;
  /** Something is on the stack (the tray only appears under a load, never on its own). */
  carrying: boolean;
}

/** The rim light's colour: warm gold, cyan on skates, a brighter gold with double fares (linear, before strength). */
const RIM_COLOURS = { normal: new THREE.Color('#FFC75A'), skating: new THREE.Color('#5FD2F0'), doubled: new THREE.Color('#FFE27A') };
/** The scooter deck's top, the handlebar's height and how far ahead of the rider it is, and its wheels. */
const SCOOTER_LIFT = 0.11;
const SCOOTER_BAR_Y = 0.72;
const SCOOTER_BAR_Z = 0.4;
const WHEEL_RADIUS = 0.06;

/**
 * Everything that makes the conductor unmistakable and shows what you have earned: a soft rim of warm light
 * round them (session 16, owner: "the yellow area around the player clips through the environment… a less
 * intrusive way"; it replaces the ring on the floor and, being on the character, never cuts into a bed or a
 * wall), the outfit from the wardrobe, and gear for each upgrade (sporty then gold shoes for speed, a silver
 * tray for carrying more, a flower, a watch chain and gold epaulettes for charm), plus the power-ups in use
 * (roller skates, the scooter). Rebuilt only when something changes.
 */
export class ConductorGear {
  private readonly tray: THREE.Mesh;
  private readonly chest: THREE.Mesh;
  private readonly epaulettes: THREE.Mesh;
  private readonly skates: THREE.Mesh[] = [];
  private readonly scooter: THREE.Group;
  private readonly wheels: THREE.Mesh[] = [];
  private key = '';
  private time = 0;

  constructor(private readonly view: CharacterView, private readonly base: CharacterLook) {
    // The rim light is drawn by the character batch, in the same single draw as everyone else.
    CharacterView.batch?.highlight(view.root, true);

    // A silver tray under whatever the conductor carries (shown only with a load on it): silver on top,
    // a thin brass edge below, so from above it reads as a tray and not a gold disc.
    this.tray = new THREE.Mesh(new GeoBuilder()
      .cylinder(0, 0.012, 0, 0.2, 0.19, 0.02, '#DADFE4', 20, 'y', { shade: 1 })
      .cylinder(0, -0.002, 0, 0.215, 0.215, 0.012, PALETTE.brass, 20, 'y', { shade: 1 })
      .build(), MATERIALS.character);
    this.tray.visible = false;
    this.tray.position.set(0, -0.06, 0);
    view.stackAnchor.add(this.tray);

    // Charm: a flower in the lapel and a gold watch chain across the coat.
    this.chest = new THREE.Mesh(new GeoBuilder()
      .sphere(0.08, 0.68, faceDepth(0.68) + 0.012, 0.036, '#E8849A', 1)
      .sphere(0.08, 0.68, faceDepth(0.68) + 0.038, 0.016, PALETTE.mustard, 1)
      .add(new THREE.TorusGeometry(0.07, 0.007, 6, 16, Math.PI), PALETTE.gold, -0.02, 0.52, faceDepth(0.52) + 0.008, 0, 0, Math.PI, { shade: 1 })
      .sphere(-0.09, 0.52, faceDepth(0.52) + 0.01, 0.022, PALETTE.gold, 1)
      .build(), MATERIALS.character);
    view.body.add(this.chest);
    this.epaulettes = new THREE.Mesh(new GeoBuilder()
      .rounded(-SHOULDER_X, SHOULDER_Y + 0.045, 0, 0.12, 0.035, 0.12, 0.02, PALETTE.gold, { shade: 1 })
      .rounded(SHOULDER_X, SHOULDER_Y + 0.045, 0, 0.12, 0.035, 0.12, 0.02, PALETTE.gold, { shade: 1 })
      .build(), MATERIALS.character);
    view.body.add(this.epaulettes);

    // Roller skates over the shoes.
    const skate = new GeoBuilder()
      .rounded(0, -LEG_LENGTH + 0.06, 0.03, 0.13, 0.08, 0.24, 0.03, '#E26D8C', { shade: 0.95 })
      .box(0, -LEG_LENGTH + 0.01, 0.03, 0.1, 0.02, 0.22, PALETTE.ink, 0, { shade: 1 });
    for (const z of [-0.06, 0.12]) skate.cylinder(0, -LEG_LENGTH - 0.015, z, 0.035, 0.035, 0.1, '#FFD35C', 10, 'x', { shade: 1 });
    const skateGeo = skate.build();
    for (const pivot of view.legPivots) {
      const mesh = new THREE.Mesh(skateGeo, MATERIALS.character);
      pivot.add(mesh);
      this.skates.push(mesh);
    }

    // The Conductor's Scooter: a navy deck with a brass grip under the conductor's feet, a raked stem rising to
    // a handlebar at the hands' height, and two wheels that turn with the ride (session 36: sized to the rider,
    // the bar where the hands reach).
    this.scooter = new THREE.Group();
    const deck = new GeoBuilder()
      .rounded(0, SCOOTER_LIFT - 0.022, 0.0, 0.2, 0.04, 0.74, 0.018, PALETTE.navy, { shade: 0.9 })
      .box(0, SCOOTER_LIFT - 0.001, -0.02, 0.16, 0.004, 0.56, PALETTE.brass, 0, { shade: 1 })
      .box(0, SCOOTER_LIFT - 0.03, -0.36, 0.05, 0.05, 0.08, PALETTE.ink, 0, { shade: 1 })
      .box(0, 0.32, 0.37, 0.034, 0.5, 0.034, PALETTE.brass, 0, { shade: 1 })
      .box(0, 0.07, 0.37, 0.05, 0.08, 0.05, PALETTE.ink, 0, { shade: 1 })
      .cylinder(0, SCOOTER_BAR_Y, SCOOTER_BAR_Z, 0.016, 0.016, 0.44, PALETTE.ink, 8, 'x', { shade: 1 })
      .cylinder(-0.2, SCOOTER_BAR_Y, SCOOTER_BAR_Z, 0.024, 0.024, 0.07, '#7A2E2E', 8, 'x', { shade: 1 })
      .cylinder(0.2, SCOOTER_BAR_Y, SCOOTER_BAR_Z, 0.024, 0.024, 0.07, '#7A2E2E', 8, 'x', { shade: 1 })
      .build();
    const stem = new THREE.Mesh(deck, MATERIALS.character);
    this.scooter.add(stem);
    const wheel = new GeoBuilder()
      .cylinder(0, 0, 0, WHEEL_RADIUS, WHEEL_RADIUS, 0.045, PALETTE.ink, 14, 'x', { shade: 1 })
      .cylinder(0, 0, 0, WHEEL_RADIUS * 0.45, WHEEL_RADIUS * 0.45, 0.05, PALETTE.brass, 10, 'x', { shade: 1 })
      .box(0, 0, 0, 0.052, WHEEL_RADIUS * 1.6, 0.012, '#C9A24A', 0, { shade: 1 })
      .build();
    for (const z of [-0.3, 0.37]) {
      const w = new THREE.Mesh(wheel, MATERIALS.character);
      w.position.set(0, WHEEL_RADIUS, z);
      this.scooter.add(w);
      this.wheels.push(w);
    }
    this.scooter.visible = false;
    view.root.add(this.scooter);
  }

  update(dt: number, state: GearState): void {
    this.time += dt;
    const key = `${state.outfit.id}|${state.speedLevel}|${state.capacityLevel}|${state.charmLevel}|${state.skating}|${state.scooter}`;
    if (key !== this.key) {
      this.key = key;
      const o = state.outfit;
      this.view.setLook({
        ...this.base,
        body: o.body,
        accent: o.accent,
        pants: o.pants,
        hat: o.hat,
        hatColor: o.hatColor,
        bandColor: o.bandColor,
        shoe: SHOES_BY_SPEED[Math.min(SHOES_BY_SPEED.length - 1, state.speedLevel)],
      });
      this.tray.scale.setScalar(1 + Math.min(4, state.capacityLevel) * 0.08);
      this.chest.visible = state.charmLevel >= 1;
      this.epaulettes.visible = state.charmLevel >= 3;
      for (const s of this.skates) s.visible = state.skating && !state.scooter;
      this.scooter.visible = state.scooter;
      this.view.riding = state.scooter;
      this.view.rideLift = state.scooter ? SCOOTER_LIFT : 0;
      this.view.body.position.y = 0;
    }
    this.tray.visible = state.carrying && state.capacityLevel >= 1;
    if (state.scooter) for (const w of this.wheels) w.rotation.x += (state.speed * dt) / WHEEL_RADIUS;
    // The rim breathes gently; it turns cyan on skates and a brighter, quicker gold with double fares.
    const boosted = state.skating || state.doubled;
    const colour = state.skating ? RIM_COLOURS.skating : state.doubled ? RIM_COLOURS.doubled : RIM_COLOURS.normal;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (boosted ? 6 : 2.2));
    LIGHT_UNIFORMS.uNxHighlight.value.copy(colour).multiplyScalar((boosted ? 0.95 : 0.85) + (boosted ? 0.35 : 0.15) * pulse);
  }
}
