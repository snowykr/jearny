import { assert, describe, expect, it } from 'vitest';
import { BUILDING, ENTITY, SPAWN } from '../../contracts';
import type { Tile } from '../../contracts';
import { maps } from './index';
import { IT, T, tileCount } from './tiles';
import { validateMaps } from './validate';

const copyMaps = () => structuredClone(maps);

describe('map registry validation', () => {
  it('satisfies map, portal, collision, ID, tileset and connectivity rules', () => {
    expect(validateMaps(maps)).toEqual([]);
  });

  it('reports a portal pointing to a missing spawn', () => {
    const broken = copyMaps();
    const portal = broken.takanawa.portals[0];
    assert(portal);
    portal.toSpawn = 'missing-spawn';
    expect(validateMaps(broken)).toContainEqual(expect.stringContaining('targets missing spawn missing-spawn'));
  });

  it.each([T.RAIL_H, T.RAIL_V, T.ROAD, T.ROAD_EDGE_N, T.ROAD_EDGE_S, T.ROAD_EDGE_E, T.ROAD_EDGE_W])(
    'reports walkable rail/road tile %i', (tile) => {
      const broken = copyMaps();
      broken.takanawa.layers.ground[129] = tile;
      broken.takanawa.collision[129] = 0;
      expect(validateMaps(broken)).toContainEqual(expect.stringContaining('rail/road cell 129 must be blocked'));
    },
  );

  it('reports a disconnected spawn', () => {
    const broken = copyMaps();
    const map = broken.takanawa;
    const spawn = map.spawns[SPAWN.shopDoor];
    assert(spawn);
    const [x, y] = spawn;
    const offsets: Tile[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of offsets)
      map.collision[(y + dy) * map.grid[0] + x + dx] = 1;
    expect(validateMaps(broken)).toContainEqual(expect.stringContaining('required spawn shop-door is disconnected'));
  });

  it('counts directed same-scene portals as BFS edges', () => {
    const registry = copyMaps();
    const map = registry.takanawa;
    map.entities = [];
    map.portals = [];
    map.collision.fill(1);
    map.layers.ground.fill(T.GRASS_A); // drop real road/crossing tiles so only BFS is under test
    const tiles: Tile[] = [[2, 2], [4, 4], [6, 6], [8, 8]];
    const names = [SPAWN.homeDoor, SPAWN.shopDoor, SPAWN.plaza, SPAWN.stationDeck];
    names.forEach((name, index) => {
      const tile = tiles[index];
      assert(tile);
      map.spawns[name] = tile;
      map.collision[tile[1] * map.grid[0] + tile[0]] = 0;
      const next = names[(index + 1) % names.length];
      if (next)
        map.portals.push({ id: `test-${index}`, tile, toScene: map.id, toSpawn: next });
    });
    expect(validateMaps(registry)).toEqual([]);
    map.portals.splice(2, 1);
    expect(validateMaps(registry)).toContainEqual(expect.stringContaining('required spawn station-deck is disconnected'));
  });

  it('reports missing scenes, blocked portal tiles and overlapping portals', () => {
    const broken = copyMaps();
    const { 'home-interior': omitted, ...withoutHome } = broken;
    expect(omitted.id).toBe('home-interior');
    const map = broken.takanawa;
    const portal = map.portals[0];
    assert(portal);
    map.collision[portal.tile[1] * map.grid[0] + portal.tile[0]] = 1;
    map.portals.push(structuredClone(portal));
    const errors = validateMaps(withoutHome);
    expect(errors).toContainEqual(expect.stringContaining('targets missing scene home-interior'));
    expect(errors).toContainEqual(expect.stringContaining('tile is not walkable'));
    expect(errors).toContainEqual(expect.stringContaining('duplicate portal tile'));
  });

  it('reports a target spawn blocked by an NPC footprint even under a zone', () => {
    const broken = copyMaps();
    const map = broken['home-interior'];
    const spawn = map.spawns[SPAWN.entry];
    assert(spawn);
    const [x, y] = spawn;
    map.entities.unshift({ id: ENTITY.stationZone, kind: 'zone', tile: [x, y] });
    map.entities.push({ id: ENTITY.guide, kind: 'npc', tile: [x - 1, y - 1], size: [2, 2] });
    expect(validateMaps(broken)).toContainEqual(expect.stringContaining('target spawn entry is not walkable'));
  });

  it('reports a target spawn on a painted building footprint', () => {
    const broken = copyMaps();
    const map = broken['home-interior'];
    const spawn = map.spawns[SPAWN.entry];
    assert(spawn);
    const [x, y] = spawn;
    map.entities.push({ id: BUILDING.home, kind: 'building', tile: [x - 1, y - 1], size: [2, 2] });
    // The authoring loop paints every footprint into the grid; the validator reads that same grid.
    map.collision[y * map.grid[0] + x] = 1;
    expect(validateMaps(broken)).toContainEqual(expect.stringContaining('target spawn entry is not walkable'));
  });

  it('does not treat a building entity alone as a wall, so a carved passage stays walkable', () => {
    // The grid owns building walls. A building whose footprint is not painted must not block, which
    // is exactly what lets the 泉岳寺 sanmon passage through its gate entity.
    const broken = copyMaps();
    const map = broken['home-interior'];
    const spawn = map.spawns[SPAWN.entry];
    assert(spawn);
    const [x, y] = spawn;
    map.entities.push({ id: BUILDING.home, kind: 'building', tile: [x - 1, y - 1], size: [2, 2] });
    expect(validateMaps(broken)).toEqual([]);
  });

  it.each([T.CROSSING_H, T.CROSSING_V])('requires crossing %i to be walkable', (tile) => {
    const broken = copyMaps();
    broken.takanawa.layers.ground[129] = tile;
    expect(validateMaps(broken)).toEqual([]);
    broken.takanawa.collision[129] = 1;
    expect(validateMaps(broken)).toContainEqual(expect.stringContaining('crossing cell 129 must be walkable'));
  });

  it('accepts stair indices from the second interior sheet', () => {
    expect(tileCount('tiles-interior')).toBe(64);
    expect(validateMaps(maps)).toEqual([]);
  });

  it('reports invalid layer lengths, collision values, IDs, indices and spawn bounds', () => {
    const broken = copyMaps();
    const map = broken['home-interior'];
    for (const layer of Object.values(map.layers)) layer.pop();
    map.layers.ground[0] = tileCount('tiles-interior');
    map.layers.decoration[0] = -2;
    map.layers.roof[0] = IT.WALL + 0.5;
    map.collision.pop();
    map.collision[0] = 2;
    map.spawns[SPAWN.start] = [16, 0];
    const entity = map.entities[0];
    assert(entity);
    entity.id = 'unknown';
    const errors = validateMaps(broken);
    const expected = map.grid[0] * map.grid[1];
    for (const layer of ['ground', 'decoration', 'roof', 'collision'])
      expect(errors).toContainEqual(expect.stringContaining(`${layer} length must be ${expected}`));
    for (const layer of ['ground', 'decoration', 'roof'])
      expect(errors).toContainEqual(expect.stringContaining(`${layer}[0] tile index`));
    expect(errors).toContainEqual(expect.stringContaining('collision[0] must be 0 or 1'));
    expect(errors).toContainEqual(expect.stringContaining('spawn start is outside bounds'));
    expect(errors).toContainEqual(expect.stringContaining('unknown entity unknown'));
  });
});
