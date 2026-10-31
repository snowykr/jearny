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

const at = (layer: number[], map: MapDefinition, [x, y]: Tile) => layer[y * map.grid[0] + x];

/** Flat props the player can walk over; every other decoration tile is furniture and must block. */
const WALKABLE_PROPS: number[] = [IT.ZABUTON, IT.RUG, IT.GENKAN_STEP, IT.DOOR_MAT];
/** Hung on, or built into, the wall: the wall tile underneath already blocks. */
const WALL_PROPS: number[] = [
  IT.WINDOW_CURTAIN, IT.WALL_CLOCK, IT.PICTURE_FRAME, IT.WALL_SHOJI, IT.MENU_BOARD, IT.PAPER_LANTERN, IT.SHOP_WINDOW, IT.WINDOW,
];
const WALL_GROUND: number[] = [IT.WALL_TOP, IT.WALL, IT.SHOP_WALL, IT.WALL_BASE];

const interiors = [
  { map: homeInterior, entityId: ENTITY.guide, portalId: PORTAL.homeExit, toSpawn: SPAWN.homeDoor, exit: [8, 11] as Tile },
  { map: shopInterior, entityId: ENTITY.shopkeeper, portalId: PORTAL.shopExit, toSpawn: SPAWN.shopDoor, exit: [9, 13] as Tile },
];
const directions: Dir[] = ['up', 'down', 'left', 'right'];

for (const { map, entityId, portalId, toSpawn, exit } of interiors) {
  const [cols, rows] = map.grid;
  describe(map.id, () => {
    it('has complete layers, within 20 by 15, using interior tiles', () => {
      expect(cols).toBeLessThanOrEqual(20);
      expect(rows).toBeLessThanOrEqual(15);
      expect(map.tileSize).toBe(16);
      const tiles = Object.values<number>(IT);
      for (const [name, layer] of Object.entries(map.layers)) {
        expect(layer).toHaveLength(cols * rows);
        expect(layer.every((tile) => tiles.includes(tile) || (name !== 'ground' && tile === -1))).toBe(true);
      }
      expect(map.collision).toHaveLength(cols * rows);
      expect(map.collision.every((cell) => cell === 0 || cell === 1)).toBe(true);
      expect(maps[map.id]).toBe(map);
    });

    it('keeps the bottom exit open, with the entry spawn just inside, and its outdoor destination walkable', () => {
      expect(map.portals).toHaveLength(1);
      expect(map.portals[0]).toEqual({ id: portalId, tile: exit, toScene: 'takanawa', toSpawn });
      expect(exit[1]).toBe(rows - 1);
      expect(map.spawns[SPAWN.entry]).toEqual([exit[0], exit[1] - 1]);
      expect(isBlocked(map, exit)).toBe(false);
      expect(WALL_GROUND).not.toContain(at(map.layers.ground, map, exit));
      const destination = maps.takanawa.spawns[toSpawn];
      expect(destination).toBeDefined();
      if (!destination) throw new Error(`Missing outdoor spawn ${toSpawn}`);
      expect(isBlocked(maps.takanawa, destination)).toBe(false);
    });

    it('encloses the room with wall tiles except for the exit', () => {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (x !== 0 && x !== cols - 1 && y !== 0 && y !== rows - 1) continue;
          if (x === exit[0] && y === exit[1]) continue;
          expect(WALL_GROUND).toContain(map.layers.ground[y * cols + x]);
          expect(isBlocked(map, [x, y])).toBe(true);
        }
      }
    });

    it('draws side walls with the cap tile and a cap row on top', () => {
      for (let y = 0; y < rows; y++) {
        expect(at(map.layers.ground, map, [0, y])).toBe(IT.WALL_TOP);
        expect(at(map.layers.ground, map, [cols - 1, y])).toBe(IT.WALL_TOP);
      }
      expect(at(map.layers.ground, map, [1, 0])).toBe(IT.WALL_TOP);
      expect([IT.WALL, IT.SHOP_WALL]).toContain(at(map.layers.ground, map, [1, 1]));
    });

    it('connects every spawn to the exit and an NPC interaction tile', () => {
      for (const start of Object.values(map.spawns)) {
        expect(isBlocked(map, start)).toBe(false);
        const reachable = reachableTiles(map, start);
        expect(reachable).toContainEqual(exit);
        expect(reachable.some((tile) => directions.some((dir) => {
          const command = interactCommand(map, tile, dir);
          return command?.type === 'Interact' && command.entityId === entityId;
        }))).toBe(true);
      }
    });

    it('blocks every piece of furniture and keeps wall props on blocked wall tiles', () => {
      map.layers.decoration.forEach((tile, index) => {
        if (tile === -1 || WALKABLE_PROPS.includes(tile)) return;
        expect(map.collision[index]).toBe(1);
        if (WALL_PROPS.includes(tile)) expect(WALL_GROUND).toContain(map.layers.ground[index]);
      });
    });

    it('has no blocked tile next to the entry that traps the player', () => {
      const entry = map.spawns[SPAWN.entry];
      if (!entry) throw new Error('Missing entry');
      const open = Object.values(DELTA).filter(([dx, dy]) => !isBlocked(map, [entry[0] + dx, entry[1] + dy]));
      expect(open.length).toBeGreaterThanOrEqual(3);
    });
  });
}

describe('home-interior', () => {
  it('keeps the contract coordinates other suites rely on', () => {
    expect(homeInterior.grid).toEqual([16, 12]);
    expect(homeInterior.spawns[SPAWN.start]).toEqual([8, 6]);
    expect(homeInterior.entities.find((e) => e.id === ENTITY.guide)?.tile).toEqual([5, 4]);
    expect(Object.keys(homeInterior.spawns).sort()).toEqual([SPAWN.entry, SPAWN.start]);
  });

  it('is furnished: tatami, wood, rug, kitchen, kotatsu, TV, bookshelves, genkan, tokonoma', () => {
    expect(homeInterior.layers.ground).toEqual(expect.arrayContaining([
      IT.TATAMI, IT.WOOD_FLOOR, IT.FLOOR_WOOD_DARK, IT.RUG, IT.GENKAN, IT.DOMA_STONE, IT.GENKAN_STEP, IT.WALL, IT.WALL_BASE,
    ]));
    expect(homeInterior.layers.decoration).toEqual(expect.arrayContaining([
      IT.KITCHEN_COUNTER, IT.SINK, IT.STOVE, IT.FRIDGE, IT.KOTATSU_L, IT.KOTATSU_R, IT.ZABUTON, IT.TV_STAND, IT.FLOOR_LAMP,
      IT.BOOKSHELF, IT.LOW_TABLE, IT.FUTON, IT.PLANT, IT.SHOE_RACK, IT.UMBRELLA_STAND, IT.WINDOW_CURTAIN, IT.WALL_CLOCK,
      IT.PICTURE_FRAME, IT.WALL_SHOJI,
    ]));
    expect(at(homeInterior.layers.ground, homeInterior, [8, 10])).toBe(IT.GENKAN);
  });

  it('keeps the x=8 column open from the alcove down to the door', () => {
    for (let y = 1; y <= 10; y++) expect(isBlocked(homeInterior, [8, y])).toBe(false);
    expect(isBlocked(homeInterior, [8, 0])).toBe(true);
  });

  it('pairs the kotatsu halves', () => {
    const { decoration } = homeInterior.layers;
    const i = decoration.indexOf(IT.KOTATSU_L);
    expect(decoration[i + 1]).toBe(IT.KOTATSU_R);
  });
});

describe('shop-interior', () => {
  it('is furnished: wagashi counter, menu board, lanterns, windows, tea corner, noren door', () => {
    expect(shopInterior.layers.ground).toEqual(expect.arrayContaining([
      IT.SHOP_FLOOR, IT.FLOOR_WOOD_DARK, IT.DOMA_STONE, IT.SHOP_WALL, IT.WALL_BASE, IT.NOREN_DOOR,
    ]));
    expect(shopInterior.layers.decoration).toEqual(expect.arrayContaining([
      IT.DISPLAY_L, IT.DISPLAY_R, IT.REGISTER, IT.COUNTER, IT.WAGASHI_TRAY, IT.TEA_SET, IT.SHELF, IT.STOOL, IT.CUSHION_CHAIR,
      IT.POTTED_BAMBOO, IT.PAPER_LANTERN, IT.MENU_BOARD, IT.SHOP_WINDOW,
    ]));
    expect(at(shopInterior.layers.ground, shopInterior, [9, 13])).toBe(IT.NOREN_DOOR);
  });

  it('allows interaction with the shopkeeper across the glass counter', () => {
    const keeper = shopInterior.entities.find((entity) => entity.id === ENTITY.shopkeeper);
    expect(keeper).toBeDefined();
    if (!keeper) throw new Error('Missing shopkeeper');
    const [x, y] = keeper.tile;
    expect(keeper.facing).toBe('down');
    // The keeper stands behind the case: the counter row directly below them is the glass display.
    expect(at(shopInterior.layers.decoration, shopInterior, [x, y + 1])).toBe(IT.DISPLAY_L);
    expect(at(shopInterior.layers.decoration, shopInterior, [x + 1, y + 1])).toBe(IT.DISPLAY_R);
    expect(isBlocked(shopInterior, keeper.tile)).toBe(true);
    const entry = shopInterior.spawns[SPAWN.entry];
    if (!entry) throw new Error('Missing shop entry');
    const reachable = reachableTiles(shopInterior, entry);
    for (const customer of [[x, y + 2], [x + 1, y + 2]] as Tile[]) {
      expect(reachable).toContainEqual(customer);
      expect(interactCommand(shopInterior, customer, 'up')).toEqual({ type: 'Interact', entityId: ENTITY.shopkeeper });
    }
  });

  it('keeps customers out of the staff side of the counter', () => {
    const entry = shopInterior.spawns[SPAWN.entry];
    if (!entry) throw new Error('Missing shop entry');
    expect(reachableTiles(shopInterior, entry).every(([, y]) => y >= 6)).toBe(true);
  });
});
