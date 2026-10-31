import { describe, expect, it } from 'vitest';
import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition, Tile } from '../../contracts';
import { DELTA, interactCommand, isBlocked } from '../../game/interaction';
import type { Dir } from '../../game/input';
import { homeInterior } from './home-interior';
import { maps } from './index';
import { shopInterior } from './shop-interior';
import { IT } from './tiles';

function reachableTiles(map: MapDefinition, start: Tile): Tile[] {
  const queue: Tile[] = [start];
  const seen = new Set([start.join(',')]);
  for (const tile of queue) {
    for (const [dx, dy] of Object.values(DELTA)) {
      const next: Tile = [tile[0] + dx, tile[1] + dy];
      const key = next.join(',');
      if (seen.has(key) || isBlocked(map, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return queue;
}

const interiors = [
  { map: homeInterior, entityId: ENTITY.guide, portalId: PORTAL.homeExit, toSpawn: SPAWN.homeDoor },
  { map: shopInterior, entityId: ENTITY.shopkeeper, portalId: PORTAL.shopExit, toSpawn: SPAWN.shopDoor },
];
const directions: Dir[] = ['up', 'down', 'left', 'right'];

for (const { map, entityId, portalId, toSpawn } of interiors) {
  describe(map.id, () => {
    it('has complete 16 by 12 layers using interior tiles', () => {
      expect(map.grid).toEqual([16, 12]);
      expect(map.tileSize).toBe(16);
      const tiles = Object.values<number>(IT);
      for (const [name, layer] of Object.entries(map.layers)) {
        expect(layer).toHaveLength(192);
        expect(layer.every((tile) => tiles.includes(tile) || (name !== 'ground' && tile === -1))).toBe(true);
      }
      expect(map.collision).toHaveLength(192);
      expect(map.collision.every((cell) => cell === 0 || cell === 1)).toBe(true);
      expect(maps[map.id]).toBe(map);
    });

    it('keeps the bottom exit open and its outdoor destination walkable', () => {
      expect(map.portals).toHaveLength(1);
      expect(map.portals[0]).toEqual({ id: portalId, tile: [8, 11], toScene: 'takanawa', toSpawn });
      expect(map.spawns[SPAWN.entry]).toEqual([8, 10]);
      expect(isBlocked(map, [8, 11])).toBe(false);
      expect(map.layers.ground[11 * 16 + 8]).not.toBe(IT.WALL);
      const destination = maps.takanawa.spawns[toSpawn];
      expect(destination).toBeDefined();
      if (!destination) throw new Error(`Missing outdoor spawn ${toSpawn}`);
      expect(isBlocked(maps.takanawa, destination)).toBe(false);
    });

    it('encloses the room except for the exit', () => {
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 16; x++) {
          if (x !== 0 && x !== 15 && y !== 0 && y !== 11) continue;
          if (x === 8 && y === 11) continue;
          expect(map.layers.ground[y * 16 + x]).toBe(IT.WALL);
          expect(isBlocked(map, [x, y])).toBe(true);
        }
      }
    });

    it('connects every spawn to the exit and an NPC interaction tile', () => {
      for (const start of Object.values(map.spawns)) {
        expect(isBlocked(map, start)).toBe(false);
        const reachable = reachableTiles(map, start);
        expect(reachable).toContainEqual([8, 11]);
        expect(reachable.some((tile) => directions.some((dir) => {
          const command = interactCommand(map, tile, dir);
          return command?.type === 'Interact' && command.entityId === entityId;
        }))).toBe(true);
      }
    });

    it('blocks every piece of furniture', () => {
      const furniture: number[] = [IT.LOW_TABLE, IT.FUTON, IT.SHELF, IT.DISPLAY_L, IT.DISPLAY_R, IT.REGISTER, IT.COUNTER, IT.PLANT];
      map.layers.decoration.forEach((tile, index) => {
        if (furniture.includes(tile)) expect(map.collision[index]).toBe(1);
      });
    });
  });
}

it('furnishes the home with tatami, wood, a low table, futon, and genkan', () => {
  expect(Object.keys(homeInterior.spawns).sort()).toEqual([SPAWN.entry, SPAWN.start]);
  expect(homeInterior.layers.ground).toEqual(expect.arrayContaining([IT.TATAMI, IT.WOOD_FLOOR, IT.GENKAN]));
  expect(homeInterior.layers.decoration).toEqual(expect.arrayContaining([IT.LOW_TABLE, IT.FUTON]));
  expect(homeInterior.layers.ground[10 * 16 + 8]).toBe(IT.GENKAN);
});

it('allows interaction with the shopkeeper across the glass counter', () => {
  const keeper = shopInterior.entities.find((entity) => entity.id === ENTITY.shopkeeper);
  expect(keeper).toBeDefined();
  if (!keeper) throw new Error('Missing shopkeeper');
  const [x, y] = keeper.tile;
  expect(keeper.facing).toBe('down');
  expect(shopInterior.layers.decoration[y * 16 + x]).toBe(IT.DISPLAY_L);
  expect(shopInterior.layers.decoration[y * 16 + x + 1]).toBe(IT.DISPLAY_R);
  const customer: Tile = [x, y + 1];
  const entry = shopInterior.spawns[SPAWN.entry];
  if (!entry) throw new Error('Missing shop entry');
  expect(reachableTiles(shopInterior, entry)).toContainEqual(customer);
  expect(isBlocked(shopInterior, keeper.tile)).toBe(true);
  expect(interactCommand(shopInterior, customer, 'up')).toEqual({ type: 'Interact', entityId: ENTITY.shopkeeper });
  expect(shopInterior.layers.decoration).toEqual(expect.arrayContaining([IT.SHELF, IT.REGISTER]));
  expect(shopInterior.layers.ground[11 * 16 + 8]).toBe(IT.NOREN_DOOR);
});
