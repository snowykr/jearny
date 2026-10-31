import { describe, expect, it } from 'vitest';
import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition, Tile } from '../../contracts';
import { DELTA, interactCommand, isBlocked } from '../../game/interaction';
import type { Dir } from '../../game/input';
import { spawnFacing } from '../../game/scene';
import { home2f } from './home-2f';
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

const directions: Dir[] = ['up', 'down', 'left', 'right'];

const interiors = [
  { map: homeInterior, entityId: ENTITY.guide, exit: [6, 8] as Tile, exitPortal: PORTAL.homeExit, toSpawn: SPAWN.homeDoor },
  { map: shopInterior, entityId: ENTITY.shopkeeper, exit: [6, 8] as Tile, exitPortal: PORTAL.shopExit, toSpawn: SPAWN.shopDoor },
  { map: home2f, entityId: null, exit: null, exitPortal: null, toSpawn: null },
];

for (const { map, entityId, exit, exitPortal, toSpawn } of interiors) {
  const [cols, rows] = map.grid;
  describe(map.id, () => {
    it('has complete layers, fits one 15 by 10 screen, and uses interior tiles', () => {
      expect(cols).toBeLessThanOrEqual(15);
      expect(rows).toBeLessThanOrEqual(10);
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

    it('encloses the room with wall tiles except for its portals', () => {
      const portalTiles = new Set(map.portals.map((portal) => portal.tile.join(',')));
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (x !== 0 && x !== cols - 1 && y !== 0 && y !== rows - 1) continue;
          if (portalTiles.has(`${x},${y}`)) continue;
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

    it('blocks every piece of furniture and keeps wall props on blocked wall tiles', () => {
      map.layers.decoration.forEach((tile, index) => {
        if (tile === -1 || WALKABLE_PROPS.includes(tile)) return;
        expect(map.collision[index]).toBe(1);
        if (WALL_PROPS.includes(tile)) expect(WALL_GROUND).toContain(map.layers.ground[index]);
      });
    });

    it('keeps every spawn walkable and out of a furniture trap', () => {
      for (const spawn of Object.values(map.spawns)) {
        expect(isBlocked(map, spawn)).toBe(false);
        const open = Object.values(DELTA).filter(([dx, dy]) => !isBlocked(map, [spawn[0] + dx, spawn[1] + dy]));
        expect(open.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('never seals an open floor cell behind furniture', () => {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const tile: Tile = [x, y];
          if (isBlocked(map, tile)) continue;
          const open = Object.values(DELTA).some(([dx, dy]) => !isBlocked(map, [x + dx, y + dy]));
          expect(open, `isolated open cell ${x},${y}`).toBe(true);
        }
      }
    });

    it('blocks every wall-ground cell', () => {
      map.layers.ground.forEach((tile, index) => {
        if (WALL_GROUND.includes(tile)) expect(map.collision[index], `wall cell ${index}`).toBe(1);
      });
    });

    it('keeps spawns off portals so entering a scene cannot bounce', () => {
      for (const spawn of Object.values(map.spawns)) {
        expect(map.portals.some((portal) => portal.tile[0] === spawn[0] && portal.tile[1] === spawn[1])).toBe(false);
      }
    });

    if (exit && exitPortal && toSpawn) {
      it('keeps the bottom exit open, with the entry spawn just inside, and its outdoor destination walkable', () => {
        const portal = map.portals.find((candidate) => candidate.id === exitPortal);
        expect(portal).toEqual({ id: exitPortal, tile: exit, toScene: 'takanawa', toSpawn });
        expect(exit[1]).toBe(rows - 1);
        expect(map.spawns[SPAWN.entry]).toEqual([exit[0], exit[1] - 1]);
        expect(isBlocked(map, exit)).toBe(false);
        expect(WALL_GROUND).not.toContain(at(map.layers.ground, map, exit));
        const destination = maps.takanawa.spawns[toSpawn];
        expect(destination).toBeDefined();
        if (!destination) throw new Error(`Missing outdoor spawn ${toSpawn}`);
        expect(isBlocked(maps.takanawa, destination)).toBe(false);
      });
    }

    if (entityId) {
      it('connects every spawn to the exit and an NPC interaction tile', () => {
        for (const start of Object.values(map.spawns)) {
          const reachable = reachableTiles(map, start);
          if (exit) expect(reachable).toContainEqual(exit);
          expect(reachable.some((tile) => directions.some((dir) => {
            const command = interactCommand(map, tile, dir);
            return command?.type === 'Interact' && command.entityId === entityId;
          }))).toBe(true);
        }
      });
    }
  });
}

describe('home floors', () => {
  it('connects 1F and 2F with paired stairs that arrive next to each other', () => {
    const up = homeInterior.portals.find((portal) => portal.id === PORTAL.homeStairsUp);
    const down = home2f.portals.find((portal) => portal.id === PORTAL.homeStairsDown);
    expect(up).toEqual({ id: PORTAL.homeStairsUp, tile: [10, 2], toScene: 'home-2f', toSpawn: SPAWN.stairs });
    expect(down).toEqual({ id: PORTAL.homeStairsDown, tile: [8, 1], toScene: 'home-interior', toSpawn: SPAWN.stairs });
    expect(isBlocked(homeInterior, [10, 2])).toBe(false);
    expect(isBlocked(home2f, [8, 1])).toBe(false);
    expect(isBlocked(homeInterior, homeInterior.spawns[SPAWN.stairs]!)).toBe(false);
    expect(isBlocked(home2f, home2f.spawns[SPAWN.stairs]!)).toBe(false);
  });

  it('reaches the stairs, the door and the guide from every 1F spawn', () => {
    for (const start of Object.values(homeInterior.spawns)) {
      const reachable = reachableTiles(homeInterior, start);
      expect(reachable).toContainEqual([10, 2]);
      expect(reachable).toContainEqual([6, 8]);
      expect(reachable.some((tile) => directions.some((dir) => {
        const command = interactCommand(homeInterior, tile, dir);
        return command?.type === 'Interact' && command.entityId === ENTITY.guide;
      }))).toBe(true);
    }
  });

  it('reaches the 2F stairs from the arrival tile', () => {
    expect(reachableTiles(home2f, home2f.spawns[SPAWN.stairs]!)).toContainEqual([8, 1]);
  });

  it('keeps the 1F contract coordinates other suites rely on', () => {
    expect(homeInterior.portals.map((portal) => portal.id).sort()).toEqual([PORTAL.homeExit, PORTAL.homeStairsUp].sort());
    expect(homeInterior.grid).toEqual([13, 9]);
    expect(homeInterior.spawns[SPAWN.start]).toEqual([5, 5]);
    expect(spawnFacing(homeInterior, homeInterior.spawns[SPAWN.start]!)).toBe('down');
    expect(homeInterior.entities.find((e) => e.id === ENTITY.guide)?.tile).toEqual([4, 4]);
    expect(Object.keys(homeInterior.spawns).sort()).toEqual([SPAWN.entry, SPAWN.stairs, SPAWN.start]);
  });

  it('is furnished as a home: kitchen, dining, kotatsu, rug, genkan and wall hangings', () => {
    expect(homeInterior.layers.ground).toEqual(expect.arrayContaining([
      IT.WOOD_FLOOR, IT.RUG, IT.DOMA_STONE, IT.FLOOR_WOOD_DARK, IT.DOOR_MAT, IT.WALL, IT.WALL_BASE,
    ]));
    expect(homeInterior.layers.decoration).toEqual(expect.arrayContaining([
      IT.KITCHEN_COUNTER, IT.SINK, IT.STOVE, IT.FRIDGE, IT.KOTATSU_L, IT.KOTATSU_R, IT.ZABUTON, IT.TV_STAND,
      IT.BOOKSHELF, IT.LOW_TABLE, IT.PLANT, IT.SHOE_RACK, IT.UMBRELLA_STAND, IT.WINDOW_CURTAIN, IT.WALL_CLOCK,
      IT.PICTURE_FRAME, IT.WALL_SHOJI,
    ]));
    expect(at(homeInterior.layers.ground, homeInterior, [6, 7])).toBe(IT.DOMA_STONE);
    expect(at(homeInterior.layers.ground, homeInterior, [10, 2])).toBe(IT.FLOOR_WOOD_DARK);
    const kotatsu = homeInterior.layers.decoration.findIndex((tile) => tile === IT.KOTATSU_L);
    expect(homeInterior.layers.decoration[kotatsu + 1]).toBe(IT.KOTATSU_R);
  });

  it('furnishes 2F as a bedroom with a tatami floor and no outdoor door', () => {
    expect(home2f.portals).toHaveLength(1);
    expect(home2f.layers.ground).toEqual(expect.arrayContaining([IT.TATAMI, IT.RUG, IT.FLOOR_WOOD_DARK, IT.WALL, IT.WALL_BASE]));
    expect(at(home2f.layers.ground, home2f, [8, 1])).toBe(IT.FLOOR_WOOD_DARK);
    expect(home2f.layers.decoration).toEqual(expect.arrayContaining([
      IT.FUTON, IT.BOOKSHELF, IT.LOW_TABLE, IT.CUSHION_CHAIR, IT.ZABUTON, IT.FLOOR_LAMP, IT.TV_STAND, IT.PLANT,
      IT.WINDOW_CURTAIN, IT.WALL_CLOCK, IT.PICTURE_FRAME,
    ]));
  });
});

describe('shop-interior', () => {
  it('is furnished: wagashi counter, menu board, lanterns, windows, tea corner, noren door', () => {
    expect(shopInterior.layers.ground).toEqual(expect.arrayContaining([
      IT.SHOP_FLOOR, IT.SHOP_WALL, IT.WALL_BASE, IT.NOREN_DOOR,
    ]));
    expect(shopInterior.layers.decoration).toEqual(expect.arrayContaining([
      IT.DISPLAY_L, IT.DISPLAY_R, IT.REGISTER, IT.COUNTER, IT.WAGASHI_TRAY, IT.TEA_SET, IT.SHELF, IT.STOOL, IT.CUSHION_CHAIR,
      IT.POTTED_BAMBOO, IT.PAPER_LANTERN, IT.MENU_BOARD, IT.SHOP_WINDOW,
    ]));
    expect(at(shopInterior.layers.ground, shopInterior, [6, 8])).toBe(IT.NOREN_DOOR);
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
    // The NPC blocks movement via its footprint, not by painting the map collision layer.
    expect(at(shopInterior.collision, shopInterior, keeper.tile)).toBe(0);
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
    expect(reachableTiles(shopInterior, entry).every(([, y]) => y >= 5)).toBe(true);
  });
});
