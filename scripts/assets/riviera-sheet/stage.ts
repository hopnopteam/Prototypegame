// Riviera asset contact sheet (Route 2 assets, not part of the game). Renders baked models (assets/models/models.bin)
// exactly as the game draws them: GeoBuilder.model into the shared lit material, the game's own camera angles and the
// midday light. Build: ENTRY=scripts/assets/riviera-sheet/stage.ts OUT=riviera-sheet.html node scripts/build.mjs
// Open riviera-sheet.html?ids=palm_tall,lemon_tree&t=0.25; then window.__show(i) frames model i (shoot.mjs drives it).
import * as THREE from 'three';
import { Stage } from '../../../src/world/Stage';
import { GeoBuilder } from '../../../src/world/geo';
import { MATERIALS } from '../../../src/world/materials';
import { modelEntry, type ModelId } from '../../../src/world/models/library';
import { VISUALS } from '../../../src/config/visuals';
import { loadDetailTextures } from '../../../src/world/detailTextures';

document.getElementById('loader')?.remove();
const params = new URLSearchParams(location.search);
const ids = (params.get('ids') ?? '').split(',').filter(Boolean) as ModelId[];
const SPACING = 80;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
// The game's grade was tuned for golden hour and night: a bright midday needs the exposure brought down.
(VISUALS.night as { exposure: number }).exposure = Number(params.get('exp') ?? '0.8');
const stage = new Stage(canvas, 'high', null);
stage.lighting.setTime(Number(params.get('t') ?? '0.62'));
const ground = params.get('ground') ?? '#E9DFC9';
// Small props sit closer than the game's deep near plane.
stage.rig.camera.near = 0.05;
stage.rig.camera.updateProjectionMatrix();
if (stage.scene.fog) (stage.scene.fog as THREE.FogExp2).density = 0;

const info: { sizes: Record<string, number[]>; errors: string[] } = { sizes: {}, errors: [] };
const w = window as unknown as Record<string, unknown>;
w.__info = info;

async function main(): Promise<void> {
  await loadDetailTextures();
  ids.forEach((id, i) => {
    try {
      const e = modelEntry(id);
      const sx = e.max[0] - e.min[0], sy = e.max[1] - e.min[1], sz = e.max[2] - e.min[2];
      info.sizes[id] = [sx, sy, sz];
      const L = Math.max(sx, sz, sy * 0.8, 0.4);
      const b = new GeoBuilder();
      // A limestone slab under each model, a little wider than it.
      b.box(0, -0.05, i * SPACING, L * 1.8 + 0.6, 0.1, L * 1.8 + 0.6, ground, 0, { shade: 1 });
      b.model(id, 0, 0, i * SPACING, 0, 1, 1, 1);
      const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      stage.scene.add(mesh);
    } catch (err) {
      info.errors.push(`${id}: ${(err as Error).message}`);
    }
  });
  stage.rig.clampZ = [-100, ids.length * SPACING + 100];
  stage.rig.clampX = [-50, 50];
  let cur = 0;
  const frame = (dt: number) => {
    if (stage.scene.fog) (stage.scene.fog as THREE.FogExp2).density = 0;
    const id = ids[cur];
    const s = info.sizes[id] ?? [1, 1, 1];
    const L = Math.max(s[0], s[2], s[1] * 0.9, 0.35);
    stage.rig.setZoom(Math.max(0.12, (L * 2.1) / 7.8));
    const f = stage.rig.viewDirection;
    stage.rig.update(dt, f.x * s[1] * 0.42, cur * SPACING + f.y * s[1] * 0.42);
    stage.render(dt);
  };
  w.__show = (i: number) => {
    cur = i;
    const s = info.sizes[ids[i]] ?? [1, 1, 1];
    const f = stage.rig.viewDirection;
    stage.rig.snapTo(f.x * s[1] * 0.42, i * SPACING + f.y * s[1] * 0.42);
    for (let k = 0; k < 4; k++) frame(1 / 60);
  };
  w.__show(0);
  const loop = () => { frame(1 / 60); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  w.__ready = true;
}
main().catch((e) => { info.errors.push(String(e)); w.__ready = true; });
