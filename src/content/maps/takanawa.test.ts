import { describe, expect, it } from 'vitest';
import { BUILDING, PORTAL, SPAWN } from '../../contracts';
import type { Tile } from '../../contracts';
import { takanawa as map } from './takanawa';
import { maps } from './index';
import { T } from './tiles';
import homeMeta from '../../../assets/source/meta/home.json';
import matsushimayaMeta from '../../../assets/source/meta/matsushimaya.json';
import stationMeta from '../../../assets/source/meta/station.json';

const cell = ([x, y]: Tile) => y * map.grid[0] + x;

function reachable(start: Tile, useDeck: boolean): Set<number> {
  const seen = new Set<number>();
  const queue: Tile[] = [start];
  for (const tile of queue) {
    const [x, y] = tile;
    const index = cell(tile);
    if (x < 0 || y < 0 || x >= map.grid[0] || y >= map.grid[1]
      || map.collision[index] !== 0 || seen.has(index)) continue;
    seen.add(index);
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    if (useDeck) {
      for (const portal of map.portals) {
        if (portal.toScene !== map.id || cell(portal.tile) !== index) continue;
        const target = map.spawns[portal.toSpawn];
        if (target) queue.push(target);
      }
    }
  }
  return seen;
}

const home: Tile = map.spawns[SPAWN.homeDoor] ?? [17, 41];

describe('authored Takanawa map', () => {
  it('connects all four spawns and the planned neighborhood anchors', () => {
    const seen = reachable(home, true);
    for (const tile of [...Object.values(map.spawns), ...[
      [17, 40], [64, 48], [54, 36], [44, 28], [34, 24], [17, 16],
    ] satisfies Tile[]]) expect(seen.has(cell(tile))).toBe(true);
    expect(map.spawns[SPAWN.homeDoor]).toEqual(home);
  });

  it('requires the deck portals to reach the station', () => {
    const seen = reachable(home, false);
    expect(seen.has(cell([64, 50]))).toBe(false);
    expect(seen.has(cell([54, 37]))).toBe(true);
    expect(map.portals.filter(p => p.toScene === map.id).map(p => p.id))
      .toEqual([PORTAL.deckUp, PORTAL.deckDown]);
  });

  it('blocks all rail and road tiles and confines crossings to Route 15', () => {
    // Guard the invariant itself: the loop below is vacuous if the layers lose these tiles.
    const count = (tile: number) => map.layers.ground.filter((t) => t === tile).length;
    const crossings = count(T.CROSSING_H);
    expect(count(T.RAIL_V)).toBe(96 * 4);
    expect(crossings).toBe(3 * 5);
    // The crossing replaces the 3 crossing rows of each of the 3 road columns.
    expect(count(T.ROAD)).toBe(3 * (96 - 3));
    const blocked = new Set<number>([T.ROAD, T.ROAD_EDGE_N, T.ROAD_EDGE_S,
      T.ROAD_EDGE_E, T.ROAD_EDGE_W, T.RAIL_H, T.RAIL_V]);
    map.layers.ground.forEach((tile, index) => {
      if (blocked.has(tile)) expect(map.collision[index]).toBe(1);
      if (tile === T.CROSSING_H || tile === T.CROSSING_V) {
        expect(index % 128).toBeGreaterThanOrEqual(42);
        expect(index % 128).toBeLessThanOrEqual(46);
        expect(Math.floor(index / 128)).toBeGreaterThanOrEqual(27);
        expect(Math.floor(index / 128)).toBeLessThanOrEqual(29);
        expect(map.collision[index]).toBe(0);
      }
    });
    const seen = reachable(home, true);
    expect(seen.has(cell([82, 48]))).toBe(false);
  });


  it('puts each storefront portal under the door in the approved art', () => {
    // The renderer draws a building sprite centred on its footprint and bottom-aligned to its foot row, so the
    // door's world x is footprintLeft + (footprintWidth - spriteWidth) / 2 + anchors.door[0].
    const cases = [
      { building: BUILDING.home, meta: homeMeta, portal: PORTAL.homeDoor, spawn: SPAWN.homeDoor },
      { building: BUILDING.matsushimaya, meta: matsushimayaMeta, portal: PORTAL.shopDoor, spawn: SPAWN.shopDoor },
    ] as const;
    for (const c of cases) {
      const entity = map.entities.find((e) => e.id === c.building);
      expect(entity).toBeDefined();
      const [w, h] = entity!.size ?? [1, 1];
      const spriteW = c.meta.runtimeSize[0] as number;
      const doorX = c.meta.anchors.door[0] as number;
      const worldX = entity!.tile[0] * map.tileSize + (w * map.tileSize - spriteW) / 2 + doorX;
      const expected: Tile = [Math.floor(worldX / map.tileSize), entity!.tile[1] + h];
      const portal = map.portals.find((p) => p.id === c.portal);
      expect(portal?.tile).toEqual(expected);
      // Arriving from the interior drops the player on the tile in front of the door.
      expect(map.spawns[c.spawn]).toEqual([expected[0], expected[1] + 1]);
    }
  });

  it('keeps every portal and its destination walkable', () => {
    for (const portal of map.portals) {
      expect(map.collision[cell(portal.tile)]).toBe(0);
      const targetMap = maps[portal.toScene];
      const target = targetMap.spawns[portal.toSpawn];
      expect(target).toBeDefined();
      if (target) expect(targetMap.collision[target[1] * targetMap.grid[0] + target[0]]).toBe(0);
    }
  });

  it('blocks building footprints and NPCs without blocking the station zone', () => {
    for (const entity of map.entities) {
      const [w, h] = entity.size ?? [1, 1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const index = cell([entity.tile[0] + x, entity.tile[1] + y]);
        expect(map.collision[index]).toBe(entity.kind === 'zone' ? 0 : 1);
      }
    }
  });

  // The art registry owns building collision. `previousSpriteY` is the sprite's top-left y that the
  // old footprint bottom produced, so a mismatch means the art moved on screen.
  const buildings = [
    { id: BUILDING.station, meta: stationMeta, previousSpriteY: 640 },
    { id: BUILDING.home, meta: homeMeta, previousSpriteY: 544 },
    { id: BUILDING.matsushimaya, meta: matsushimayaMeta, previousSpriteY: 176 },
  ] as const;

  it('takes each building footprint from its art registry collision tiles', () => {
    for (const b of buildings) {
      const entity = map.entities.find((e) => e.id === b.id);
      expect(entity?.size).toEqual(b.meta.collisionTiles);
    }
  });

  it('keeps every building sprite where it was drawn by anchoring it to its foot row', () => {
    for (const b of buildings) {
      const entity = map.entities.find((e) => e.id === b.id);
      expect(entity?.footRow).toBeDefined();
      expect((entity!.footRow ?? 0) * map.tileSize - (b.meta.runtimeSize[1] as number))
        .toBe(b.previousSpriteY);
    }
  });

  it('blocks exactly the rows the station art paints and frees the transparent deck', () => {
    // station.png paints rows 41..45 (opaque y 31..91 of a 128px sprite with footRow 48);
    // rows 40 and 46..47 are transparent padding and must stay walkable.
    // art-collision.test.ts reads the sprite alpha and pins collisionTiles to the painted rows.
    for (let y = 40; y <= 47; y++) {
      const expected = y >= 41 && y <= 45 ? 1 : 0;
      for (let x = 58; x < 70; x++) expect([y, x, map.collision[cell([x, y])]]).toEqual([y, x, expected]);
    }
  });
});
