// PLACEHOLDER — issue #5 replaces this with the authored 16×12 shop (fictional interior).
import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { makeRoom } from './util';

export const shopInterior: MapDefinition = makeRoom({
  id: 'shop-interior',
  grid: [16, 12],
  floor: IT.SHOP_FLOOR,
  wall: IT.WALL,
  spawns: { [SPAWN.entry]: [8, 9] },
  portals: [{ id: PORTAL.shopExit, tile: [8, 11], toScene: 'takanawa', toSpawn: SPAWN.shopDoor }],
  entities: [{ id: ENTITY.shopkeeper, kind: 'npc', tile: [8, 3], facing: 'down' }],
});
