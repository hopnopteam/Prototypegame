import * as THREE from 'three';
import type { OutfitDef } from '../config/wardrobe';
import { SHOES_BY_SPEED } from '../config/wardrobe';
import type { CharacterLook, CharacterView } from './CharacterView';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
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
  /** Something is on the stack (the tray only appears under a load, never on its own). */
  carrying: boolean;
}

const RING_COLOURS = { normal: new THREE.Color('#F2B233'), skating: new THREE.Color('#5FC6E0'), doubled: new THREE.Color('#FFD35C') };
const SCOOTER_LIFT = 0.16;

/**
 * Everything that makes the conductor unmistakable and shows what you have earned: a glowing ring on the
 * floor, the outfit from the wardrobe, and gear for each upgrade (sporty then gold shoes for speed, a
 * silver tray for carrying more, a flower, a watch chain and gold epaulettes for charm), plus the power-ups
 * in use (roller skates, the scooter). Rebuilt only when something changes.
 */
export class ConductorGear {
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly tray: THREE.Mesh;
  private readonly chest: THREE.Mesh;
  private readonly epaulettes: THREE.Mesh;
  private readonly skates: THREE.Mesh[] = [];
  private readonly scooter: THREE.Group;
  private key = '';
  private time = 0;

  constructor(private readonly view: CharacterView, private readonly base: CharacterLook) {
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: RING_COLOURS.normal, transparent: true, opacity: 0.8, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2), this.ringMaterial);
    this.ring.position.y = 0.02;
    this.ring.renderOrder = 2;
    view.root.add(this.ring);

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
      .sphere(0.11, 0.66, 0.2, 0.045, '#E8849A', 1)
      .sphere(0.11, 0.66, 0.235, 0.02, PALETTE.mustard, 1)
      .add(new THREE.TorusGeometry(0.1, 0.008, 6, 16, Math.PI), PALETTE.gold, -0.02, 0.5, 0.215, 0, 0, Math.PI, { shade: 1 })
      .sphere(-0.12, 0.5, 0.22, 0.03, PALETTE.gold, 1)
      .build(), MATERIALS.character);
    view.body.add(this.chest);
    this.epaulettes = new THREE.Mesh(new GeoBuilder()
      .rounded(-0.2, 0.8, 0, 0.16, 0.04, 0.14, 0.02, PALETTE.gold, { shade: 1 })
      .rounded(0.2, 0.8, 0, 0.16, 0.04, 0.14, 0.02, PALETTE.gold, { shade: 1 })
      .build(), MATERIALS.character);
    view.body.add(this.epaulettes);

    // Roller skates over the shoes.
    const skate = new GeoBuilder()
      .rounded(0, -0.33, 0.04, 0.13, 0.08, 0.24, 0.03, '#E26D8C', { shade: 0.95 })
      .box(0, -0.38, 0.04, 0.1, 0.02, 0.22, PALETTE.ink, 0, { shade: 1 });
    for (const z of [-0.05, 0.13]) skate.cylinder(0, -0.405, z, 0.035, 0.035, 0.1, '#FFD35C', 10, 'x', { shade: 1 });
    const skateGeo = skate.build();
    for (const pivot of view.legPivots) {
      const mesh = new THREE.Mesh(skateGeo, MATERIALS.character);
      pivot.add(mesh);
      this.skates.push(mesh);
    }

    // The Conductor's Scooter: a brass-trimmed deck on two wheels with a handlebar.
    this.scooter = new THREE.Group();
    const deck = new GeoBuilder()
      .rounded(0, 0.08, 0.05, 0.3, 0.05, 0.78, 0.04, PALETTE.navy, { shade: 0.9 })
      .box(0, 0.108, 0.05, 0.26, 0.01, 0.7, PALETTE.brass, 0, { shade: 1 })
      .cylinder(0, 0.07, -0.33, 0.07, 0.07, 0.06, PALETTE.ink, 14, 'x', { shade: 1 })
      .cylinder(0, 0.07, 0.43, 0.07, 0.07, 0.06, PALETTE.ink, 14, 'x', { shade: 1 })
      .cylinder(0, 0.5, 0.42, 0.02, 0.02, 0.8, PALETTE.brass, 8, 'y', { shade: 1 })
      .cylinder(0, 0.9, 0.42, 0.018, 0.018, 0.42, PALETTE.ink, 8, 'x', { shade: 1 })
      .build();
    this.scooter.add(new THREE.Mesh(deck, MATERIALS.character));
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
      this.view.body.position.y = 0;
    }
    this.tray.visible = state.carrying && state.capacityLevel >= 1;
    if (state.scooter) this.view.body.position.y = SCOOTER_LIFT;
    // The ring breathes; it glows cyan on skates and brighter gold with double fares.
    const colour = state.skating ? RING_COLOURS.skating : state.doubled ? RING_COLOURS.doubled : RING_COLOURS.normal;
    this.ringMaterial.color.copy(colour);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (state.skating || state.doubled ? 7 : 3));
    this.ringMaterial.opacity = 0.55 + 0.3 * pulse;
    this.ring.scale.setScalar(1 + 0.06 * pulse);
  }
}
