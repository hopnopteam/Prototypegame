// The crash: the suit breaks into jointed pieces that tumble, and armor plates fly off (SPEC A5.3).
// Built from the flight body's exact pose and velocity, so the switch never jumps.
import { RAPIER, LAYER, groups, NO_COLLISION, type World, type RigidBody, type ImpulseJoint } from './physics';
import { PIECES, PIECE_BY_ID, PLATES, type PieceDef, type PieceId } from './rig';
import { CRASH } from '../econ/balance';

export interface RagdollPiece {
  id: PieceId;
  def: PieceDef;
  body: RigidBody;
}

export interface LoosePlate {
  index: number;
  body: RigidBody;
}

const TOTAL_SHARE = PIECES.reduce((sum, p) => sum + p.massShare, 0);

export class Ragdoll {
  readonly pieces: RagdollPiece[] = [];
  readonly plates: LoosePlate[] = [];
  readonly joints: ImpulseJoint[] = [];
  readonly facing: number;
  readonly mass: number;

  constructor(
    private readonly world: World,
    source: RigidBody,
    facing: number,
    mass: number,
    plateCount: number,
    friction: number,
  ) {
    this.facing = facing;
    this.mass = mass;
    const origin = source.translation();
    const angle = source.rotation();
    const v = source.linvel();
    const w = source.angvel();
    const com = source.worldCom();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const toWorld = (lx: number, ly: number) => ({ x: origin.x + cos * lx - sin * ly, y: origin.y + sin * lx + cos * ly });
    const velocityAt = (p: { x: number; y: number }) => ({ x: v.x - w * (p.y - com.y), y: v.y + w * (p.x - com.x) });
    const collide = groups(LAYER.ragdoll, LAYER.terrain);

    const bodies = new Map<PieceId, RigidBody>();
    for (const def of PIECES) {
      const at = toWorld(facing * def.cx, def.cy);
      const vel = velocityAt(at);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(at.x, at.y)
          .setRotation(angle)
          .setLinvel(vel.x, vel.y)
          .setAngvel(w)
          .setCcdEnabled(def.id === 'torso')
          .setCanSleep(false)
          .setAngularDamping(0.4),
      );
      const shape = def.shape === 'capsule' ? RAPIER.ColliderDesc.capsule(def.hh, def.hw) : RAPIER.ColliderDesc.cuboid(def.hw, def.hh);
      world.createCollider(
        shape.setMass((def.massShare / TOTAL_SHARE) * mass).setFriction(friction).setRestitution(0.25).setCollisionGroups(collide),
        body,
      );
      bodies.set(def.id, body);
      this.pieces.push({ id: def.id, def, body });
    }

    for (const def of PIECES) {
      if (!def.parent || !def.joint) continue;
      const parent = PIECE_BY_ID[def.parent];
      const a1 = { x: facing * (def.joint.x - parent.cx), y: def.joint.y - parent.cy };
      const a2 = { x: facing * (def.joint.x - def.cx), y: def.joint.y - def.cy };
      const data = RAPIER.JointData.revolute(a1, a2);
      data.limitsEnabled = true;
      data.limits = facing > 0 ? [def.joint.min, def.joint.max] : [-def.joint.max, -def.joint.min];
      const parentBody = bodies.get(def.parent);
      const body = bodies.get(def.id);
      if (parentBody && body) this.joints.push(world.createImpulseJoint(data, parentBody, body, true));
    }

    const plateCollide = groups(LAYER.plate, LAYER.terrain | LAYER.plate);
    const torsoDef = PIECE_BY_ID.torso;
    for (let i = 0; i < Math.min(plateCount, PLATES.length); i++) {
      const plate = PLATES[i];
      const at = toWorld(facing * plate.cx, plate.cy);
      const vel = velocityAt(at);
      // Fly outward from the torso's centre, and a little up.
      const centre = toWorld(facing * torsoDef.cx, torsoDef.cy);
      const dx = at.x - centre.x;
      const dy = at.y - centre.y;
      const len = Math.hypot(dx, dy) || 1;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(at.x, at.y)
          .setRotation(angle)
          .setLinvel(vel.x + (dx / len) * CRASH.plateSpeed, vel.y + (dy / len) * CRASH.plateSpeed + 1.5)
          .setAngvel(w + (i % 2 === 0 ? 6 : -7))
          .setCanSleep(false),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(plate.hw, plate.hh).setMass(CRASH.plateMassKg).setFriction(friction).setRestitution(0.35).setCollisionGroups(plateCollide),
        body,
      );
      this.plates.push({ index: i, body });
    }
  }

  get torso(): RigidBody {
    return this.pieces.find((p) => p.id === 'torso')!.body;
  }

  /** The pieces stop touching the course (while the drone tows them off). Loose plates stay behind. */
  disableCollisions(): void {
    for (const piece of this.pieces) {
      for (let i = 0; i < piece.body.numColliders(); i++) piece.body.collider(i).setCollisionGroups(NO_COLLISION);
    }
  }

  dispose(): void {
    for (const piece of this.pieces) this.world.removeRigidBody(piece.body);
    for (const plate of this.plates) this.world.removeRigidBody(plate.body);
  }
}
