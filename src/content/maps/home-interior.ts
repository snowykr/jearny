// PLACEHOLDER — issue #5 replaces this with the authored 16×12 home.
import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { makeRoom } from './util';

export const homeInterior: MapDefinition = makeRoom({
  id: 'home-interior',
  grid: [16, 12],
  floor: IT.TATAMI,
  wall: IT.WALL,
  spawns: { [SPAWN.start]: [8, 6], [SPAWN.entry]: [8, 9] },
  portals: [{ id: PORTAL.homeExit, tile: [8, 11], toScene: 'takanawa', toSpawn: SPAWN.homeDoor }],
  entities: [{ id: ENTITY.guide, kind: 'npc', tile: [5, 4], facing: 'down' }],
});
