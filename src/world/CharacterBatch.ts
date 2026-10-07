import * as THREE from 'three';
import { MATERIALS } from './materials';

/**
 * Everyone in the game drawn in one go. A character is a small hierarchy of meshes (body, legs, arms, the
 * broom in their hand, a blanket, a blob shadow), which cost a draw call each, twice over with the moon's
 * shadow: about ten per person, so a busy train with thirty people spent 300 draw calls on them alone, the
 * single biggest cost on a phone. Here every character mesh is an instance in a shared BatchedMesh (one per
 * material: the lit body parts and the blob shadows), so the whole crowd is one draw (plus one for the
 * shadows) however many people there are.
 *
 * The characters keep their own hierarchy and animation code: each frame `sync` walks the registered roots,
 * computes their matrices once (the renderer skips them) and copies every visible part's world matrix into
 * its instance. A part's own mesh stays in the scene graph but draws on no camera layer while it is batched.
 * Anything that cannot be batched (another material, a different vertex layout) simply renders as before.
 */

/** The vertex attributes the batched character material reads (GeoBuilder also writes pattern data). */
const LIT_ATTRIBUTES = ['position', 'normal', 'color', 'aSurface'];
/** Carried items (towels, trays, luggage) use the patterned material. */
const SOLID_ATTRIBUTES = [...LIT_ATTRIBUTES, 'aColor2', 'aPattern'];
const INITIAL_VERTICES = 120_000;
const INITIAL_INSTANCES = 256;
/** A root detached from the scene this many frames is forgotten (its meshes draw themselves again). */
const FORGET_FRAMES = 600;

interface Part {
  readonly mesh: THREE.Mesh;
  readonly batch: Batch;
  readonly id: number;
  readonly mask: number;
  seen: number;
  /** Drawn with the rim light (the conductor). */
  highlight: boolean;
}

/**
 * Per-instance colours carry the highlight in alpha (white, alpha 1 = plain; alpha 0 = full rim light, see the
 * lit shader in materials.ts): the colour multiply leaves every part as it was.
 */
const PLAIN = new THREE.Vector4(1, 1, 1, 1);
const HIGHLIT = new THREE.Vector4(1, 1, 1, 0);

/** A BatchedMesh that grows as new geometries and instances arrive. */
class Batch {
  readonly mesh: THREE.BatchedMesh;
  private readonly ids = new Map<THREE.BufferGeometry, number>();
  private readonly attributes: string[];
  private vertexCapacity: number;
  private verticesUsed = 0;
  private instanceCapacity = INITIAL_INSTANCES;
  private instances = 0;
  private indexed: boolean;

  constructor(material: THREE.Material, reference: THREE.BufferGeometry, castShadow: boolean, vertexCapacity: number, readonly colours = false) {
    this.vertexCapacity = vertexCapacity;
    this.indexed = reference.getIndex() !== null;
    const indexCapacity = this.indexed ? vertexCapacity * 2 : 0;
    this.mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, vertexCapacity, indexCapacity, material);
    this.mesh.castShadow = castShadow;
    // As before batching: people cast the moon's shadow but are not darkened by it (they read better).
    this.mesh.receiveShadow = false;
    // The crowd spreads along the whole train: cull per person, never the batch as a whole.
    this.mesh.frustumCulled = false;
    this.attributes = Object.keys(reference.attributes);
    // The first geometry fixes the batch's vertex layout: add the reference so only what it has is kept.
    const referenceId = this.geometryId(reference);
    if (colours) {
      // The colour texture exists from the start, so the shader variant that reads it is the one warmed up.
      const id = this.mesh.addInstance(referenceId);
      this.mesh.setColorAt(id, PLAIN);
      this.mesh.deleteInstance(id);
    }
  }

  /** True when this geometry has the batch's layout (anything else renders on its own). */
  accepts(geometry: THREE.BufferGeometry): boolean {
    if ((geometry.getIndex() !== null) !== this.indexed) return false;
    for (const name of this.attributes) if (!geometry.hasAttribute(name)) return false;
    return geometry.getAttribute('position').count > 0;
  }

  add(geometry: THREE.BufferGeometry): number {
    const geometryId = this.geometryId(geometry);
    if (this.instances >= this.instanceCapacity) {
      this.instanceCapacity *= 2;
      this.mesh.setInstanceCount(this.instanceCapacity);
    }
    this.instances++;
    const id = this.mesh.addInstance(geometryId);
    // Instance ids are reused: every new one starts plain.
    if (this.colours) this.mesh.setColorAt(id, PLAIN);
    return id;
  }

  setHighlight(id: number, on: boolean): void {
    if (this.colours) this.mesh.setColorAt(id, on ? HIGHLIT : PLAIN);
  }

  remove(id: number): void {
    this.mesh.deleteInstance(id);
    this.instances--;
  }

  private geometryId(geometry: THREE.BufferGeometry): number {
    const known = this.ids.get(geometry);
    if (known !== undefined) return known;
    const count = geometry.getAttribute('position').count;
    if (this.verticesUsed + count > this.vertexCapacity) {
      while (this.verticesUsed + count > this.vertexCapacity) this.vertexCapacity *= 2;
      this.mesh.setGeometrySize(this.vertexCapacity, this.indexed ? this.vertexCapacity * 2 : 0);
    }
    const id = this.mesh.addGeometry(geometry);
    this.verticesUsed += count;
    this.ids.set(geometry, id);
    return id;
  }
}

/** A degenerate triangle carrying just the attributes a batch keeps. */
function reference(attributes: string[], from: THREE.BufferGeometry | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of attributes) {
    const size = from?.getAttribute(name)?.itemSize ?? (name === 'aSurface' ? 4 : name === 'aPattern' ? 2 : 3);
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * size), size));
  }
  if (from?.getIndex()) g.setIndex([0, 1, 2]);
  return g;
}

export class CharacterBatch {
  /** Add to the scene once: it holds the batched meshes. */
  readonly group = new THREE.Group();
  private readonly lit: Batch;
  private readonly solid: Batch;
  private readonly shadow: Batch;
  private readonly roots = new Map<THREE.Object3D, number>();
  private readonly parts = new Map<THREE.Mesh, Part>();
  private readonly highlighted = new Set<THREE.Object3D>();
  private frame = 0;

  constructor(shadowGeometry: THREE.BufferGeometry) {
    this.lit = new Batch(MATERIALS.character, reference(LIT_ATTRIBUTES, null), true, INITIAL_VERTICES, true);
    this.solid = new Batch(MATERIALS.solid, reference(SOLID_ATTRIBUTES, null), true, 16_384);
    this.shadow = new Batch(MATERIALS.shadow, reference(Object.keys(shadowGeometry.attributes), shadowGeometry), false, 4_096);
    this.group.add(this.lit.mesh, this.solid.mesh, this.shadow.mesh);
  }

  /** Characters drawn through the batch and the parts they are made of (the live performance overlay). */
  stats(): { characters: number; parts: number } {
    return { characters: this.roots.size, parts: this.parts.size };
  }

  /** Draws this character (a CharacterView root) through the batch from the next frame. */
  register(root: THREE.Object3D): void {
    if (this.roots.has(root)) return;
    this.roots.set(root, this.frame);
    // Its matrices are worked out in `sync`, once a frame: the renderer's own pass skips it.
    root.matrixWorldAutoUpdate = false;
  }

  /** Draws this character with a soft rim light (the conductor: the eye finds them without a ring on the floor). */
  highlight(root: THREE.Object3D, on: boolean): void {
    if (on) this.highlighted.add(root);
    else this.highlighted.delete(root);
  }

  /** Back to drawing itself (a character leaving the game, or one that should not be batched). */
  unregister(root: THREE.Object3D): void {
    if (!this.roots.delete(root)) return;
    this.highlighted.delete(root);
    root.matrixWorldAutoUpdate = true;
    root.traverse((o) => {
      const part = this.parts.get(o as THREE.Mesh);
      if (part) this.release(part);
    });
  }

  get size(): { roots: number; parts: number } {
    return { roots: this.roots.size, parts: this.parts.size };
  }

  /** Once a frame, after the simulation and before rendering. */
  sync(): void {
    const frame = ++this.frame;
    for (const [root, lastSeen] of this.roots) {
      if (!attached(root)) {
        // Off the stage (a platform character between stations): nothing to draw, and after a while forget it.
        if (frame - lastSeen > FORGET_FRAMES) this.unregister(root);
        continue;
      }
      this.roots.set(root, frame);
      // updateWorldMatrix leaves a root that opted out of automatic updates alone: compose it by hand.
      const parent = root.parent as THREE.Object3D;
      parent.updateWorldMatrix(true, false);
      if (root.matrixAutoUpdate) root.updateMatrix();
      root.matrixWorld.multiplyMatrices(parent.matrixWorld, root.matrix);
      this.visit(root, root.visible && visibleChain(parent), frame, true, this.highlighted.has(root));
    }
    // Parts not seen this frame left their character (a blanket swapped, a prop dropped, a character taken
    // off the stage): they go back to drawing themselves, wherever they are now.
    for (const part of this.parts.values()) if (part.seen !== frame) this.release(part);
  }

  private visit(object: THREE.Object3D, visible: boolean, frame: number, isRoot: boolean, highlight: boolean): void {
    if (!isRoot) {
      if (object.matrixAutoUpdate) object.updateMatrix();
      object.matrixWorld.multiplyMatrices((object.parent as THREE.Object3D).matrixWorld, object.matrix);
    }
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
      const part = this.parts.get(mesh) ?? this.adopt(mesh);
      if (part) {
        part.seen = frame;
        if (part.highlight !== highlight) {
          part.highlight = highlight;
          part.batch.setHighlight(part.id, highlight);
        }
        part.batch.mesh.setVisibleAt(part.id, visible);
        if (visible) part.batch.mesh.setMatrixAt(part.id, mesh.matrixWorld);
      }
    }
    const children = object.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      // Every child gets its matrix here (bubbles and carried items too: the renderer skips the whole root).
      this.visit(child, visible && child.visible, frame, false, highlight);
    }
  }

  private adopt(mesh: THREE.Mesh): Part | null {
    if (Array.isArray(mesh.material)) return null;
    const m = mesh.material;
    const batch = m === MATERIALS.character ? this.lit : m === MATERIALS.solid ? this.solid : m === MATERIALS.shadow ? this.shadow : null;
    if (!batch || !batch.accepts(mesh.geometry)) return null;
    const part: Part = { mesh, batch, id: batch.add(mesh.geometry), mask: mesh.layers.mask, seen: 0, highlight: false };
    // The mesh itself no longer draws on any camera (the batch draws it).
    mesh.layers.mask = 0;
    this.parts.set(mesh, part);
    return part;
  }

  private release(part: Part): void {
    part.batch.remove(part.id);
    part.mesh.layers.mask = part.mask;
    this.parts.delete(part.mesh);
  }
}

/** True when every ancestor is visible (a platform character while the platform is away is not). */
function visibleChain(object: THREE.Object3D | null): boolean {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function attached(object: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = object;
  while (o.parent) o = o.parent;
  return (o as THREE.Scene).isScene === true;
}
