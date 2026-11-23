// Writes the game's own lobby floor plan to JSON so the Blender build lines up with gameplay.
import { writeFileSync } from 'node:fs';
import { getLayout, CARRIAGE_LENGTH, HALF_WIDTH, WALL, INNER, PARTITION_X0, PARTITION_X1, EXTERIOR_WALL_HEIGHT,
  CUTAWAY_WALL_HEIGHT, DOOR_Z0, DOOR_Z1, ROOM_DOOR_WIDTH, INTERIOR_END } from '../../../src/world/layout';
const tier = Number(process.argv[2] ?? 1);
const l = getLayout('lobby', tier);
const out = {
  tier, CARRIAGE_LENGTH, HALF_WIDTH, WALL, INNER, PARTITION_X0, PARTITION_X1, EXTERIOR_WALL_HEIGHT, CUTAWAY_WALL_HEIGHT,
  DOOR_Z0, DOOR_Z1, ROOM_DOOR_WIDTH, INTERIOR_END,
  windowBand: l.windowBand, rooms: l.rooms, walls: l.walls, props: l.props, cabins: l.cabins, doors: l.doors,
  connectors: l.connectors, anchors: l.anchors, queue: l.queue,
};
writeFileSync(process.argv[3] ?? 'lobby_layout.json', JSON.stringify(out, null, 1));
console.log('props', l.props.map((p) => p.kind).join(','), 'walls', l.walls.length, 'cabins', l.cabins.length);
