import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

export const homeInterior: MapDefinition = makeRoom({
  id: 'home-interior',
  grid: [16, 12],
  floor: IT.WOOD_FLOOR,
  wall: IT.WALL,
  spawns: { [SPAWN.start]: [8, 6], [SPAWN.entry]: [8, 10] },
  portals: [{ id: PORTAL.homeExit, tile: [8, 11], toScene: 'takanawa', toSpawn: SPAWN.homeDoor }],
  entities: [{ id: ENTITY.guide, kind: 'npc', tile: [5, 4], facing: 'down' }],
});

for (let y = 2; y <= 7; y++) {
  for (let x = 2; x <= 12; x++) {
    homeInterior.layers.ground[idx(16, x, y)] = IT.TATAMI;
  }
}
for (let y = 9; y <= 10; y++) {
  for (let x = 7; x <= 9; x++) {
    homeInterior.layers.ground[idx(16, x, y)] = IT.GENKAN;
  }
}
homeInterior.layers.ground[idx(16, 8, 11)] = IT.DOOR_MAT;

const furniture = [
  { tile: IT.LOW_TABLE, x: 6, y: 5 },
  { tile: IT.LOW_TABLE, x: 7, y: 5 },
  { tile: IT.FUTON, x: 11, y: 3 },
  { tile: IT.FUTON, x: 11, y: 4 },
  { tile: IT.SHELF, x: 2, y: 1 },
  { tile: IT.SHELF, x: 3, y: 1 },
  { tile: IT.PLANT, x: 13, y: 8 },
];
for (const { tile, x, y } of furniture) {
  homeInterior.layers.decoration[idx(16, x, y)] = tile;
  homeInterior.collision[idx(16, x, y)] = 1;
}
