import { describe, expect, it } from 'vitest';
import { PORTAL, SPAWN } from '../../contracts';
import type { Tile } from '../../contracts';
import { takanawa as map } from './takanawa';
import { maps } from './index';
import { T } from './tiles';

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

const home: Tile = [18, 41];

describe('authored Takanawa map', () => {
  it('connects all four spawns and the planned neighborhood anchors', () => {
    const seen = reachable(home, true);
    for (const tile of [...Object.values(map.spawns), ...[
      [18, 40], [64, 48], [54, 36], [44, 28], [34, 24], [16, 16],
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
});
