import * as THREE from 'three';
import { MATERIALS, pullMaterial, pullTexture } from './materials';
import { welded } from './weld';

export { welded };

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
const INITIAL_VERTICES = 60_000;
/** A character whose bounding sphere (this radius round a point this high, metres) is off screen is not drawn. */
const CULL_RADIUS = 1.4;
const CULL_HEIGHT = 0.9;

const INITIAL_INSTANCES = 256;
/** A root detached from the scene this many frames is forgotten (its meshes draw themselves again). */
const FORGET_FRAMES = 600;

interface Part {
  readonly mesh: THREE.Mesh;
  /** The geometry it was adopted with: a part whose mesh changes geometry (a new outfit) is adopted again. */
  readonly geometry: THREE.BufferGeometry;
  readonly batch: Batch;
  readonly id: number;
  readonly mask: number;
  seen: number;
  /** Drawn with the rim light (the conductor). */
  highlight: boolean;
}

/** Instance 0 is never handed out: freed vertices point at it, and its matrix hides them. */
const HIDDEN_SLOT = 0;
/** A hidden part: squashed to a point far below the world, so it draws nothing. */
const HIDDEN = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, -1e4, 0, 0, 0, 0, 0, 0, 0, 1);

interface Range { start: number; count: number }

/** First fit from a free list; null when nothing fits. */
function takeFree(free: Range[], count: number): number | null {
  for (let i = 0; i < free.length; i++) {
    const r = free[i];
    if (r.count < count) continue;
    const start = r.start;
    r.start += count;
    r.count -= count;
    if (r.count === 0) free.splice(i, 1);
    return start;
  }
  return null;
}

interface Slot { vStart: number; vCount: number; iStart: number; iCount: number; visible: boolean }

/**
 * Many characters' parts in one mesh and one draw (session 32, replacing three's BatchedMesh). BatchedMesh shared one
 * copy of each geometry and found every draw's matrix through gl_DrawID and an integer lookup texture; on some Android
 * GPUs that lookup came back wrong and people were drawn with each other's matrices (heads and bodies swapping as the
 * draw order changed). Here every part owns its own copy of its vertices, each vertex carries the part's instance
 * number (`aNxInst`), and the shader reads that instance's matrix from a float texture (`pullMaterial` in
 * materials.ts): nothing can point one part at another's matrix. A part keeps its instance number and its vertices
 * from adoption to release; freed vertices are pointed at the hidden instance and freed indices collapsed.
 */
class Batch {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.Material;
  private readonly names: string[];
  private readonly sizes: number[];
  private readonly indexed: boolean;
  private geometry!: THREE.BufferGeometry;
  private arrays: Float32Array[] = [];
  private inst!: Float32Array;
  /** Every part's triangles (the CPU's copy); `drawn` holds only those of parts on screen, and is what is drawn. */
  private index: Uint32Array | null = null;
  private drawn: Uint32Array | null = null;
  private drawnCount = 0;
  private visibilityDirty = false;
  private vertexCapacity: number;
  private indexCapacity: number;
  private vertexEnd = 0;
  private indexEnd = 0;
  private readonly freeVertices: Range[] = [];
  private readonly freeIndices: Range[] = [];
  private readonly slots = new Map<number, Slot>();
  private readonly freeSlots: number[] = [];
  private slotEnd = 1;
  private slotCapacity = INITIAL_INSTANCES;
  private texture!: THREE.DataTexture;
  private dirtyVertex: [number, number] = [Infinity, -1];
  private matricesDirty = true;

  constructor(base: THREE.Material, reference: THREE.BufferGeometry, castShadow: boolean, vertexCapacity: number, readonly colours = false) {
    this.material = pullMaterial(base);
    this.names = Object.keys(reference.attributes);
    this.sizes = this.names.map((n) => reference.getAttribute(n).itemSize);
    this.indexed = reference.getIndex() !== null;
    this.vertexCapacity = vertexCapacity;
    this.indexCapacity = this.indexed ? vertexCapacity * 2 : 0;
    this.allocateGeometry();
    this.allocateTexture();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = castShadow;
    // As before batching: people cast the moon's shadow but are not darkened by it (they read better).
    this.mesh.receiveShadow = false;
    // The crowd spreads along the whole train: the mesh is always drawn (hidden parts are squashed away).
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** True when this geometry has the batch's layout (anything else renders on its own). */
  accepts(geometry: THREE.BufferGeometry): boolean {
    // An indexed batch welds what comes in (`welded`); a plain one takes plain geometry only.
    if (!this.indexed && geometry.getIndex() !== null) return false;
    for (const name of this.names) if (!geometry.hasAttribute(name)) return false;
    return geometry.getAttribute('position').count > 0;
  }

  /** Parts in the batch and the vertices they use (the live overlay and the debug checks). */
  stats(): { instances: number; vertices: number } {
    let vertices = 0;
    for (const s of this.slots.values()) vertices += s.vCount;
    return { instances: this.slots.size, vertices };
  }

  add(source: THREE.BufferGeometry): number {
    const geometry = this.indexed ? welded(source) : source;
    const vCount = geometry.getAttribute('position').count;
    const src = geometry.getIndex();
    const iCount = src ? src.count : 0;
    const id = this.freeSlots.pop() ?? this.slotEnd++;
    if (id >= this.slotCapacity) this.growTexture();
    let vStart = takeFree(this.freeVertices, vCount);
    if (vStart === null) {
      if (this.vertexEnd + vCount > this.vertexCapacity) this.growGeometry(this.vertexEnd + vCount, this.indexEnd + iCount);
      vStart = this.vertexEnd;
      this.vertexEnd += vCount;
    }
    let iStart = 0;
    if (src) {
      const free = takeFree(this.freeIndices, iCount);
      if (free === null) {
        if (this.indexEnd + iCount > this.indexCapacity) this.growGeometry(this.vertexEnd, this.indexEnd + iCount);
        iStart = this.indexEnd;
        this.indexEnd += iCount;
      } else iStart = free;
    }
    // Copy the part's own vertices in, each marked with its instance.
    for (let a = 0; a < this.names.length; a++) {
      const attr = geometry.getAttribute(this.names[a]);
      const size = this.sizes[a];
      const out = this.arrays[a];
      const array = (attr as THREE.BufferAttribute).array;
      if (!(attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && array instanceof Float32Array && attr.itemSize === size && !attr.normalized) {
        out.set(array.subarray(0, vCount * size), vStart * size);
      } else {
        for (let v = 0; v < vCount; v++) for (let c = 0; c < size; c++) out[(vStart + v) * size + c] = c < attr.itemSize ? attr.getComponent(v, c) : 0;
      }
    }
    this.inst.fill(id, vStart, vStart + vCount);
    if (src && this.index) for (let i = 0; i < iCount; i++) this.index[iStart + i] = src.getX(i) + vStart;
    this.markVertices(vStart, vCount);
    this.slots.set(id, { vStart, vCount, iStart, iCount, visible: false });
    this.writeMatrix(id, HIDDEN, false);
    this.updateDrawRange();
    return id;
  }

  remove(id: number): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    this.slots.delete(id);
    // Freed vertices point at the hidden instance and freed triangles collapse, so stale data can never draw.
    this.inst.fill(HIDDEN_SLOT, slot.vStart, slot.vStart + slot.vCount);
    this.markVertices(slot.vStart, slot.vCount);
    this.freeVertices.push({ start: slot.vStart, count: slot.vCount });
    if (this.index && slot.iCount > 0) {
      this.index.fill(0, slot.iStart, slot.iStart + slot.iCount);
      this.freeIndices.push({ start: slot.iStart, count: slot.iCount });
    }
    if (slot.visible) this.visibilityDirty = true;
    this.writeMatrix(id, HIDDEN, false);
    this.freeSlots.push(id);
  }

  /** The part's world matrix, or hidden; the highlight (the conductor's rim light) rides in an unused element. */
  set(id: number, visible: boolean, matrix: THREE.Matrix4, highlight: boolean): void {
    this.writeMatrix(id, visible ? matrix : HIDDEN, highlight && this.colours);
    const slot = this.slots.get(id);
    if (slot && slot.visible !== visible) {
      slot.visible = visible;
      this.visibilityDirty = true;
    }
  }

  /** True when this instance number is in use (the debug checks). */
  has(id: number): boolean {
    return this.slots.has(id);
  }

  /** Uploads what changed this frame. */
  flush(): void {
    if (this.dirtyVertex[1] >= 0) {
      const [lo, hi] = this.dirtyVertex;
      for (let a = 0; a < this.names.length; a++) {
        const attr = this.geometry.getAttribute(this.names[a]) as THREE.BufferAttribute;
        attr.clearUpdateRanges();
        attr.addUpdateRange(lo * this.sizes[a], (hi - lo) * this.sizes[a]);
        attr.needsUpdate = true;
      }
      const inst = this.geometry.getAttribute('aNxInst') as THREE.BufferAttribute;
      inst.clearUpdateRanges();
      inst.addUpdateRange(lo, hi - lo);
      inst.needsUpdate = true;
      this.dirtyVertex = [Infinity, -1];
    }
    // Only the triangles of parts on screen are drawn: the list is rebuilt when someone comes into or goes out of
    // view, a prop shows or hides, or a part joins or leaves (a few hundred kilobytes at most, now and then).
    if (this.visibilityDirty && this.index && this.drawn && this.geometry.index) {
      let n = 0;
      for (const slot of this.slots.values()) {
        if (!slot.visible || slot.iCount === 0) continue;
        this.drawn.set(this.index.subarray(slot.iStart, slot.iStart + slot.iCount), n);
        n += slot.iCount;
      }
      this.drawnCount = n;
      const index = this.geometry.index;
      index.clearUpdateRanges();
      index.addUpdateRange(0, Math.max(1, n));
      index.needsUpdate = true;
      this.updateDrawRange();
      this.visibilityDirty = false;
    }
    if (this.matricesDirty) {
      this.texture.needsUpdate = true;
      this.matricesDirty = false;
    }
  }

  private writeMatrix(id: number, matrix: THREE.Matrix4, highlight: boolean): void {
    const data = this.texture.image.data as Float32Array;
    const e = matrix.elements;
    const o = id * 16;
    for (let i = 0; i < 16; i++) data[o + i] = e[i];
    data[o + 3] = highlight ? 1 : 0;
    this.matricesDirty = true;
  }

  private markVertices(start: number, count: number): void {
    this.dirtyVertex[0] = Math.min(this.dirtyVertex[0], start);
    this.dirtyVertex[1] = Math.max(this.dirtyVertex[1], start + count);
  }

  private updateDrawRange(): void {
    this.geometry.setDrawRange(0, this.indexed ? this.drawnCount : this.vertexEnd);
  }

  private allocateGeometry(): void {
    const old = this.geometry;
    const g = new THREE.BufferGeometry();
    this.arrays = this.names.map((name, a) => {
      const array = new Float32Array(this.vertexCapacity * this.sizes[a]);
      const prev = old?.getAttribute(name)?.array as Float32Array | undefined;
      if (prev) array.set(prev.subarray(0, Math.min(prev.length, array.length)));
      const attr = new THREE.BufferAttribute(array, this.sizes[a]);
      attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, attr);
      return array;
    });
    const inst = new Float32Array(this.vertexCapacity);
    if (this.inst) inst.set(this.inst.subarray(0, Math.min(this.inst.length, inst.length)));
    this.inst = inst;
    g.setAttribute('aNxInst', new THREE.BufferAttribute(inst, 1).setUsage(THREE.DynamicDrawUsage));
    if (this.indexed) {
      const index = new Uint32Array(this.indexCapacity);
      if (this.index) index.set(this.index.subarray(0, Math.min(this.index.length, index.length)));
      this.index = index;
      this.drawn = new Uint32Array(this.indexCapacity);
      this.visibilityDirty = true;
      g.setIndex(new THREE.BufferAttribute(this.drawn, 1).setUsage(THREE.DynamicDrawUsage));
    }
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geometry = g;
    this.updateDrawRange();
    if (old) {
      (this.mesh as THREE.Mesh | undefined)!.geometry = g;
      old.dispose();
    }
  }

  private growGeometry(vertices: number, indices: number): void {
    while (this.vertexCapacity < vertices) this.vertexCapacity *= 2;
    if (this.indexed) while (this.indexCapacity < indices) this.indexCapacity *= 2;
    this.allocateGeometry();
  }

  private allocateTexture(): void {
    // Four texels a matrix, rows a multiple of four wide, so a matrix never wraps a row.
    let size = Math.ceil(Math.sqrt(this.slotCapacity * 4));
    size = Math.ceil(size / 4) * 4;
    const data = new Float32Array(size * size * 4);
    const old = this.texture;
    if (old) data.set((old.image.data as Float32Array).subarray(0, Math.min(data.length, (old.image.data as Float32Array).length)));
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    this.texture = texture;
    // A texture of n texels per row holds n/4 matrices a row: every slot under capacity fits.
    this.slotCapacity = (size * size) / 4;
    for (let i = 0; i < 16; i++) data[HIDDEN_SLOT * 16 + i] = HIDDEN.elements[i];
    pullTexture(this.material).value = texture;
    old?.dispose();
  }

  private growTexture(): void {
    this.slotCapacity *= 2;
    this.allocateTexture();
  }
}

/** A degenerate triangle carrying just the attributes a batch keeps. */
function reference(attributes: string[], from: THREE.BufferGeometry | null, indexed = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of attributes) {
    const size = from?.getAttribute(name)?.itemSize ?? (name === 'aSurface' ? 4 : name === 'aPattern' ? 2 : 3);
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * size), size));
  }
  if (indexed || from?.getIndex()) g.setIndex([0, 1, 2]);
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
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor(shadowGeometry: THREE.BufferGeometry) {
    // Session 26 ("random shadow issues"): people and what they carry throw no moon shadow on any tier. On High and
    // Ultra they used to cast one as well as their soft blob, two shadows under everyone (and on the phone tiers only
    // the blob): now every tier shows the one blob, My Perfect Hotel's look.
    this.lit = new Batch(MATERIALS.character, reference(LIT_ATTRIBUTES, null, true), false, INITIAL_VERTICES, true);
    this.solid = new Batch(MATERIALS.solid, reference(SOLID_ATTRIBUTES, null, true), false, 16_384);
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

  /**
   * Session 32's debug safety net (`?debug=1`): problems in the batch's bookkeeping, as short warnings. A part whose
   * character is not registered (drawn with no owner), two parts sharing one slot, a part pointing at a freed slot.
   */
  audit(): string[] {
    const problems: string[] = [];
    const used = new Map<Batch, Set<number>>();
    for (const part of this.parts.values()) {
      let ids = used.get(part.batch);
      if (!ids) used.set(part.batch, (ids = new Set()));
      if (ids.has(part.id)) problems.push(`two parts share batch slot ${part.id}`);
      ids.add(part.id);
      if (!part.batch.has(part.id)) problems.push(`a part points at a freed slot ${part.id}`);
      let root: THREE.Object3D | null = part.mesh;
      while (root && !this.roots.has(root)) root = root.parent;
      if (!root) problems.push('a part is drawn with no character owning it');
    }
    return problems;
  }

  /**
   * Once a frame, after the simulation and before rendering. With `camera`, anyone off screen is squashed away
   * (session 32: the pull batch draws every part, so this is what keeps the crowd's cost to who is in view, as
   * BatchedMesh's per-instance culling used to).
   */
  sync(camera?: THREE.Camera): void {
    const frame = ++this.frame;
    if (camera) {
      camera.updateMatrixWorld();
      this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projScreen);
    }
    const cull = camera !== undefined;
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
      let inView = true;
      if (cull) {
        this.sphere.center.set(0, CULL_HEIGHT, 0).applyMatrix4(root.matrixWorld);
        this.sphere.radius = CULL_RADIUS * root.scale.x;
        inView = this.frustum.intersectsSphere(this.sphere);
      }
      this.visit(root, inView && root.visible && visibleChain(parent), frame, true, this.highlighted.has(root));
    }
    // Parts not seen this frame left their character (a blanket swapped, a prop dropped, a character taken
    // off the stage): they go back to drawing themselves, wherever they are now.
    for (const part of this.parts.values()) if (part.seen !== frame) this.release(part);
    this.lit.flush();
    this.solid.flush();
    this.shadow.flush();
  }

  private visit(object: THREE.Object3D, visible: boolean, frame: number, isRoot: boolean, highlight: boolean): void {
    if (!isRoot) {
      if (object.matrixAutoUpdate) object.updateMatrix();
      object.matrixWorld.multiplyMatrices((object.parent as THREE.Object3D).matrixWorld, object.matrix);
    }
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
      let found = this.parts.get(mesh);
      // Fix list 3.3 (an outfit chosen in the wardrobe never showed): a part keeps drawing the geometry it was
      // adopted with, so a mesh given a new one (setLook) goes back and comes in again with it.
      if (found && found.geometry !== mesh.geometry) {
        this.release(found);
        found = undefined;
      }
      const part = found ?? this.adopt(mesh);
      if (part) {
        part.seen = frame;
        part.highlight = highlight;
        part.batch.set(part.id, visible, mesh.matrixWorld, highlight);
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
    const part: Part = { mesh, geometry: mesh.geometry, batch, id: batch.add(mesh.geometry), mask: mesh.layers.mask, seen: 0, highlight: false };
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
