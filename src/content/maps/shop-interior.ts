import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

// Fictional shop interior. The counter anchor lets adjacent customers interact.
export const shopInterior: MapDefinition = makeRoom({
  id: 'shop-interior',
  grid: [16, 12],
  floor: IT.SHOP_FLOOR,
  wall: IT.WALL,
  spawns: { [SPAWN.entry]: [8, 10] },
  portals: [{ id: PORTAL.shopExit, tile: [8, 11], toScene: 'takanawa', toSpawn: SPAWN.shopDoor }],
  entities: [{ id: ENTITY.shopkeeper, kind: 'npc', tile: [8, 4], facing: 'down' }],
});

shopInterior.layers.ground[idx(16, 8, 11)] = IT.NOREN_DOOR;
shopInterior.layers.ground[idx(16, 8, 10)] = IT.DOOR_MAT;

const furniture = [
  { tile: IT.SHELF, x: 3, y: 1 },
  { tile: IT.SHELF, x: 4, y: 1 },
  { tile: IT.SHELF, x: 10, y: 1 },
  { tile: IT.SHELF, x: 11, y: 1 },
  { tile: IT.SHELF, x: 2, y: 5 },
  { tile: IT.SHELF, x: 2, y: 6 },
  { tile: IT.COUNTER, x: 6, y: 4 },
  { tile: IT.REGISTER, x: 7, y: 4 },
  { tile: IT.DISPLAY_L, x: 8, y: 4 },
  { tile: IT.DISPLAY_R, x: 9, y: 4 },
  { tile: IT.PLANT, x: 13, y: 9 },
];
for (const { tile, x, y } of furniture) {
  shopInterior.layers.decoration[idx(16, x, y)] = tile;
  shopInterior.collision[idx(16, x, y)] = 1;
}
