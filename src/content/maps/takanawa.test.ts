import { describe, expect, it } from 'vitest';
import { BUILDING, PORTAL, SPAWN } from '../../contracts';
import type { EntityAnchor, Tile } from '../../contracts';
import { takanawa as map, BENCH_MISSES, PASSAGES, PROP_MISSES, TREE_MISSES, WALKWAY_TILES } from './takanawa';
import { isBlocked } from '../../game/interaction';
import { VIEW_H, VIEW_W, cameraCenter } from '../../game/camera';
import { maps } from './index';
import { T } from './tiles';
import homeMeta from '../../../assets/source/meta/home.json';
import matsushimayaMeta from '../../../assets/source/meta/matsushimaya.json';
import stationMeta from '../../../assets/source/meta/station.json';
import liebeMeta from '../../../assets/source/meta/liebe.json';
import houseTwoMeta from '../../../assets/source/meta/house-2.json';
import houseThreeMeta from '../../../assets/source/meta/house-3.json';
import apartmentSmallMeta from '../../../assets/source/meta/apartment-small.json';
import cafeMeta from '../../../assets/source/meta/cafe.json';
import konbiniMeta from '../../../assets/source/meta/konbini.json';
import kobanMeta from '../../../assets/source/meta/koban.json';
import sengakujiGateMeta from '../../../assets/source/meta/sengakuji-gate.json';
import sengakujiHallMeta from '../../../assets/source/meta/sengakuji-hall.json';
import bicycleParkingMeta from '../../../assets/source/meta/bicycle-parking.json';

const cell = ([x, y]: Tile) => y * map.grid[0] + x;

function reachable(start: Tile, useDeck: boolean, blocked: ReadonlySet<number> = new Set()): Set<number> {
  const seen = new Set<number>();
  const queue: Tile[] = [start];
  for (const tile of queue) {
    const [x, y] = tile;
    const index = cell(tile);
    // Route the map's reachability through the runtime rule, so a tile the grid frees but an entity
    // still blocks (or the reverse) can never pass here and fail in the game.
    if (blocked.has(index) || isBlocked(map, tile) || seen.has(index)) continue;
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
  });

  it('varies the meadow with both grass variants and keeps every spawn connected', () => {
    const count = (tile: number) => map.layers.ground.filter((t) => t === tile).length;
    expect(count(T.GRASS_B)).toBeGreaterThan(0);
    expect(count(T.GRASS_C)).toBeGreaterThan(0);
    // GRASS_A is the base shade, no longer the whole town.
    expect(count(T.GRASS_A)).toBeLessThan(map.grid[0] * map.grid[1] / 2);
    const seen = reachable(home, true);
    for (const spawn of Object.values(map.spawns)) expect(seen.has(cell(spawn))).toBe(true);
    // The new south neighbourhood is part of that walk, not a sealed block.
    for (const tile of [[30, 69], [17, 60], [20, 86]] satisfies Tile[])
      expect(seen.has(cell(tile))).toBe(true);
  });

  it('leaves no walkable pocket outside the sealed railway side', () => {
    // Every walkable cell west of the rail tracks is reachable from home; the east bank stays sealed.
    const seen = reachable(home, true);
    const strays: Tile[] = [];
    for (let y = 0; y < map.grid[1]; y++) {
      for (let x = 0; x <= 81; x++) {
        if (!isBlocked(map, [x, y]) && !seen.has(cell([x, y]))) strays.push([x, y]);
      }
    }
    expect(strays).toEqual([]);
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

  it('leaves the gate passage as the only way into the 泉岳寺 court', () => {
    const gate = map.entities.find((e) => e.id === BUILDING.sengakujiGate)!;
    const [gw, gh] = gate.size ?? [1, 1];
    const passages = new Set(PASSAGES.map(cell));
    for (const [x, y] of PASSAGES) {
      expect(x).toBeGreaterThanOrEqual(gate.tile[0]);
      expect(x).toBeLessThan(gate.tile[0] + gw);
      expect(y).toBeGreaterThanOrEqual(gate.tile[1]);
      expect(y).toBeLessThan(gate.tile[1] + gh);
      expect(map.layers.ground[cell([x, y])]).toBe(T.TEMPLE_PATH);
      expect(map.collision[cell([x, y])]).toBe(0);
    }
    // The posts around the opening stay solid, so the passage is a doorway, not a missing wall.
    for (let y = gate.tile[1]; y < gate.tile[1] + gh; y++) {
      for (let x = gate.tile[0]; x < gate.tile[0] + gw; x++) {
        if (!passages.has(cell([x, y]))) expect(map.collision[cell([x, y])]).toBe(1);
      }
    }
    // The apron and the temple path meet the passage, and the hall court is on the other side.
    expect(map.layers.ground[cell([37, 22])]).toBe(T.PLAZA);
    expect(map.layers.ground[cell([37, 23])]).toBe(T.TEMPLE_PATH);
    const open = reachable(home, false);
    expect(open.has(cell([37, 14]))).toBe(true);
    // Closing only the passage must cut the court off: it has no side entrance. This fails if the
    // passage is blocked again, and also if a later wall change opens a way around the gate.
    const closed = reachable(home, false, passages);
    expect(closed.has(cell([37, 14]))).toBe(false);
  });

  it('places every authored prop, bench and tree and never drops one', () => {
    expect(PROP_MISSES).toEqual([]);
    expect(BENCH_MISSES).toEqual([]);
    expect(TREE_MISSES).toEqual([]);
    // No furniture on asphalt, rail, the deck lip, gravel, stone, hedge or water: a prop there is
    // an invisible wall. Wide pavement benches are authored separately and stay off these tiles.
    const props: ReadonlySet<number> = new Set([T.LAMPPOST, T.VENDING, T.BENCH]);
    const forbidden: ReadonlySet<number> = new Set([T.ROAD, T.ROAD_EDGE_N, T.ROAD_EDGE_S,
      T.ROAD_EDGE_E, T.ROAD_EDGE_W, T.CROSSING_H, T.CROSSING_V, T.RAIL_H, T.RAIL_V,
      T.DECK_EDGE, T.GRAVEL, T.STONE_WALL, T.HEDGE, T.WATER]);
    const strays: Tile[] = [];
    map.layers.decoration.forEach((tile, index) => {
      if (!props.has(tile)) return;
      if (forbidden.has(map.layers.ground[index] ?? -1))
        strays.push([index % map.grid[0], Math.floor(index / map.grid[0])]);
    });
    expect(strays).toEqual([]);
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
      const footRow = entity!.footRow ?? entity!.tile[1] + h;
      const expected: Tile = [Math.floor(worldX / map.tileSize), footRow];
      const portal = map.portals.find((p) => p.id === c.portal);
      expect(portal?.tile).toEqual(expected);
      // Arriving from the interior drops the player on the tile in front of the door.
      expect(map.spawns[c.spawn]).toEqual([expected[0], expected[1] + 1]);
    }
  });

  it('never paints a flower bed over a walkway', () => {
    const walkway = WALKWAY_TILES;
    const bad: Tile[] = [];
    map.layers.decoration.forEach((tile, index) => {
      if (tile !== T.FLOWERS) return;
      const ground = map.layers.ground[index] ?? -1;
      if (walkway.has(ground)) bad.push([index % map.grid[0], Math.floor(index / map.grid[0])]);
    });
    expect(bad).toEqual([]);
  });

  it('keeps furniture at the landmarks the guard could empty', () => {
    const props = new Map<number, Tile[]>();
    map.layers.decoration.forEach((tile, index) => {
      const list = props.get(tile) ?? [];
      list.push([index % map.grid[0], Math.floor(index / map.grid[0])]);
      props.set(tile, list);
    });
    const near = (tile: number, box: [number, number, number, number]): number =>
      (props.get(tile) ?? []).filter(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]).length;
    // Prop placement moves to the shoulder when the authored cell is pavement, so counts here
    // would silently go to zero if the guard started dropping props again.
    expect(near(T.BENCH, [44, 24, 60, 44])).toBeGreaterThan(0); // station forecourt
    expect(near(T.LAMPPOST, [44, 24, 60, 44])).toBeGreaterThan(0);
    expect(near(T.BENCH, [48, 57, 73, 94])).toBeGreaterThan(0); // east neighbourhood
    expect(near(T.LAMPPOST, [48, 57, 73, 94])).toBeGreaterThan(0);
    expect(near(T.FLOWERS, [10, 14, 22, 22])).toBeGreaterThan(0); // shop doorstep planters
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
    // PASSAGES is the documented exemption: sengakuji-gate.json mandates the open sanmon passage.
    const passages = new Set(PASSAGES.map(cell));
    for (const entity of map.entities) {
      const [w, h] = entity.size ?? [1, 1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const index = cell([entity.tile[0] + x, entity.tile[1] + y]);
        if (passages.has(index)) continue;
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

  describe('neighbourhood pack buildings', () => {
    /** Door anchors and sprite sizes of the buildings that must get a doorstep. */
    const doorMetas: Record<string, { runtimeSize: number[]; anchors: { door: number[] } }> = {
      liebe: liebeMeta,
      'house-2': houseTwoMeta,
      'house-3': houseThreeMeta,
      'apartment-small': apartmentSmallMeta,
      cafe: cafeMeta,
      konbini: konbiniMeta,
      koban: kobanMeta,
      'sengakuji-gate': sengakujiGateMeta,
      'sengakuji-hall': sengakujiHallMeta,
      'bicycle-parking': bicycleParkingMeta,
    };

    const packBuildings = map.entities.filter((e) => e.kind === 'building' && e.assetId && doorMetas[e.assetId]);

    /** Tile under the door anchor: the renderer centres the sprite on the footprint (drawBuilding). */
    const doorFront = (entity: EntityAnchor, meta: { runtimeSize: number[]; anchors: { door: number[] } }): Tile => {
      const [w] = entity.size ?? [1, 1];
      const worldX = entity.tile[0] * map.tileSize
        + (w * map.tileSize - (meta.runtimeSize[0] as number)) / 2
        + (meta.anchors.door[0] as number);
      return [Math.floor(worldX / map.tileSize), entity.footRow ?? entity.tile[1] + (entity.size?.[1] ?? 1)];
    };

    it('fronts every door with pavement', () => {
      expect(packBuildings).toHaveLength(10);
      for (const entity of packBuildings) {
        const meta = doorMetas[entity.assetId!]!;
        const [w, h] = entity.size ?? [1, 1];
        // Pack sprites paint down to their last 16px band, so the sprite bottom is the footprint
        // bottom and the doorstep is the row directly below it (art-collision.test.ts pins the rest).
        expect([entity.assetId, entity.footRow]).toEqual([entity.assetId, entity.tile[1] + h]);
        const front = doorFront(entity, meta);
        expect(front[0], entity.assetId).toBeGreaterThanOrEqual(entity.tile[0]);
        expect(front[0], entity.assetId).toBeLessThan(entity.tile[0] + w);
        const ground = map.layers.ground[cell(front)] ?? -1;
        expect([entity.assetId, ground === T.SIDEWALK || ground === T.PLAZA]).toEqual([entity.assetId, true]);
        expect([entity.assetId, map.collision[cell(front)]]).toEqual([entity.assetId, 0]);
      }
    });

    it('reaches every pack door from the home door on one walk', () => {
      const seen = reachable(home, true);
      for (const entity of packBuildings) {
        const meta = doorMetas[entity.assetId!]!;
        const front = doorFront(entity, meta);
        expect(seen.has(cell(front)), `${entity.assetId} door at ${front}`).toBe(true);
      }
    });

    it('stands the 泉岳寺 gate on the temple approach, in front of the hall', () => {
      const hall = map.entities.find((e) => e.id === BUILDING.sengakujiHall);
      const gate = map.entities.find((e) => e.id === BUILDING.sengakujiGate);
      expect([hall?.assetId, gate?.assetId]).toEqual(['sengakuji-hall', 'sengakuji-gate']);
      const centre = (entity: EntityAnchor) => entity.tile[0] + (entity.size?.[0] ?? 1) / 2;
      // Same axis, gate nearer the path (larger foot row), hall wholly behind it.
      expect(centre(gate!)).toBe(centre(hall!));
      expect(gate!.footRow!).toBeGreaterThan(hall!.footRow!);
      expect(hall!.tile[1] + (hall!.size?.[1] ?? 1)).toBeLessThanOrEqual(gate!.tile[1]);
      // The gate opens onto a paved apron on the path; the hall door opens onto the paved court.
      expect(map.layers.ground[cell([centre(gate!), gate!.footRow!])]).toBe(T.PLAZA);
      expect(map.layers.ground[cell([37, 14])]).toBe(T.PLAZA);
      // The approach marker (34,24) and the path under the gate are still TEMPLE_PATH.
      expect(map.layers.ground[cell([34, 24])]).toBe(T.TEMPLE_PATH);
      expect(map.layers.ground[cell([37, 24])]).toBe(T.TEMPLE_PATH);
    });

    it('keeps every building footprint off portals, spawns, the zone and the crossing', () => {
      const reserved = new Set<number>();
      for (const portal of map.portals) reserved.add(cell(portal.tile));
      for (const spawn of Object.values(map.spawns)) reserved.add(cell(spawn));
      for (let y = 27; y <= 29; y++) for (let x = 42; x <= 46; x++) reserved.add(cell([x, y])); // crossing
      for (const entity of map.entities) {
        if (entity.kind !== 'zone') continue;
        const [w, h] = entity.size ?? [1, 1];
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
          reserved.add(cell([entity.tile[0] + dx, entity.tile[1] + dy]));
      }
      // The station is built on the deck by design; every other building must stay off the road,
      // the crossing and the raised deck the portals step onto.
      const carried: ReadonlySet<number> = new Set([T.ROAD, T.ROAD_EDGE_W, T.ROAD_EDGE_E, T.ROAD_EDGE_N, T.ROAD_EDGE_S,
        T.RAIL_V, T.RAIL_H, T.CROSSING_H, T.CROSSING_V, T.DECK, T.DECK_EDGE, T.STAIRS]);
      let checked = 0;
      for (const entity of map.entities) {
        if (entity.kind !== 'building') continue;
        checked++;
        const [w, h] = entity.size ?? [1, 1];
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          const tile: Tile = [entity.tile[0] + dx, entity.tile[1] + dy];
          expect(reserved.has(cell(tile)), `${entity.id} covers reserved ${tile}`).toBe(false);
          if (entity.id === BUILDING.station) continue;
          expect(carried.has(map.layers.ground[cell(tile)] ?? -1), `${entity.id} covers deck/road ${tile}`)
            .toBe(false);
        }
      }
      expect(checked).toBe(13);
    });

    it('keeps every 15x10 camera window under 80% empty', () => {
      // One camera window is 15x10 tiles. Empty means bare grass plus undecorated pavement
      // (SIDEWALK / PLAZA / DECK / TEMPLE_PATH / STAIRS): counting only grass let a bare concrete
      // lane pass as full, and omitting the temple path left the widest plain corridor on the map
      // unmeasured. A building footprint is not empty -- the sprite covers the cell -- and neither is
      // a tree, bed, prop, hedge, road, rail, deck edge, garden ring or water tile.
      //
      // The window slides one tile at a time instead of sampling aligned 15x10 blocks, over every
      // camera origin on the playable west side (x0 0..66, y0 0..86; east of the rail is sealed). The
      // centre goes through cameraCenter, so clamping matches the real camera exactly.
      //
      // Before the approach was furnished, counting TEMPLE_PATH/STAIRS put the worst window at
      // origin (27,22): 132 of 150 cells empty (88.0%), the five-row temple path and the open lane
      // below it. Bench rows on the path shoulders, planting and hedges on the lawn rows y18..21 and
      // y28..31, and seating on the lane and forecourt edges bring that window to 118 (78.7%). The
      // worst window on the whole map is now the home lane at (22,34): 119 of 150 (79.3%). The bound
      // stays 0.8, checked strictly, and both numbers are pinned by the strict `<` below.
      const EMPTY_MAX = 0.8;
      const emptyGround: ReadonlySet<number> = new Set([
        T.GRASS_A, T.GRASS_B, T.GRASS_C, T.SIDEWALK, T.PLAZA, T.DECK, T.TEMPLE_PATH, T.STAIRS,
      ]);
      const built = new Set<number>();
      for (const entity of map.entities) {
        if (entity.kind !== 'building') continue;
        const [w, h] = entity.size ?? [1, 1];
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
          built.add(cell([entity.tile[0] + dx, entity.tile[1] + dy]));
      }
      const ts = map.tileSize;
      const mapPx: [number, number] = [map.grid[0] * ts, map.grid[1] * ts];
      const windows: Array<{ x0: number; y0: number; share: number }> = [];
      for (let y0 = 0; y0 <= map.grid[1] - VIEW_H / ts; y0++) {
        for (let x0 = 0; x0 <= 66; x0++) { // west of the rail: the sealed far bank is not a camera position
          // Focus on the window centre and let cameraCenter clamp it exactly like sceneCamera.
          const [cx, cy] = cameraCenter([(x0 + VIEW_W / ts / 2) * ts, (y0 + VIEW_H / ts / 2) * ts], mapPx);
          expect([cx / ts - VIEW_W / ts / 2, cy / ts - VIEW_H / ts / 2]).toEqual([x0, y0]);
          let empty = 0;
          for (let y = y0; y < y0 + VIEW_H / ts; y++) {
            for (let x = x0; x < x0 + VIEW_W / ts; x++) {
              const index = cell([x, y]);
              if (built.has(index)) continue;
              if (emptyGround.has(map.layers.ground[index] ?? -1)
                && map.layers.decoration[index] === -1
                && map.layers.roof[index] === -1) empty++;
            }
          }
          windows.push({ x0, y0, share: empty / (VIEW_W / ts * VIEW_H / ts) });
        }
      }
      const worst = windows.reduce((a, b) => (b.share > a.share ? b : a));
      expect(worst.share, `worst camera window at ${worst.x0},${worst.y0}`).toBeLessThan(EMPTY_MAX);
      // The town is planted, not measured on paper: both the canopy and the beds must exist.
      expect(map.layers.roof.filter((tile) => tile === T.TREE_TL).length).toBeGreaterThan(40);
      expect(map.layers.decoration.filter((tile) => tile === T.FLOWERS).length).toBeGreaterThan(60);
    });

    it('roots every tree on meadow, clear of pavement and building roofs', () => {
      const built = new Set<number>();
      for (const entity of map.entities) {
        if (entity.kind !== 'building') continue;
        const [w, h] = entity.size ?? [1, 1];
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
          built.add(cell([entity.tile[0] + dx, entity.tile[1] + dy]));
      }
      let trunks = 0;
      map.layers.decoration.forEach((tile, index) => {
        if (tile !== T.TREE_BL && tile !== T.TREE_BR) return;
        trunks++;
        const x = index % map.grid[0];
        const y = Math.floor(index / map.grid[0]);
        const left = tile === T.TREE_BL ? x : x - 1;
        const top = y - 1;
        // Every 2x2 tree must be on meadow, off a walkway and clear of a footprint, and its canopy
        // must actually be painted: a blocked trunk without a canopy would be an invisible wall.
        expect([tile, map.layers.roof[cell([left, top])]]).toEqual([tile, T.TREE_TL]);
        expect([tile, map.layers.roof[cell([left + 1, top])]]).toEqual([tile, T.TREE_TR]);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const cellIndex = cell([left + dx, top + dy]);
          const ground = map.layers.ground[cellIndex] ?? -1;
          expect([ground === T.GRASS_A || ground === T.GRASS_B || ground === T.GRASS_C,
            left + dx, top + dy], `${left + dx},${top + dy}`).toEqual([true, left + dx, top + dy]);
          expect(WALKWAY_TILES.has(ground), `tree on pavement at ${left + dx},${top + dy}`).toBe(false);
          expect(built.has(cellIndex), `tree through a roof at ${left + dx},${top + dy}`).toBe(false);
        }
      });
      expect(trunks).toBeGreaterThan(0);
    });
  });
});
