import { BUILDING, ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition, Tile } from '../../contracts';
import { T } from './tiles';
import { makeRoom } from './util';

const map: MapDefinition = makeRoom({
  id: 'takanawa',
  grid: [128, 96],
  floor: T.GRASS_A,
  wall: T.HEDGE,
  spawns: {
    [SPAWN.homeDoor]: [17, 41],
    [SPAWN.shopDoor]: [17, 17],
    [SPAWN.plaza]: [54, 37],
    [SPAWN.stationDeck]: [64, 50],
  },
  portals: [
    { id: PORTAL.homeDoor, tile: [17, 40], toScene: 'home-interior', toSpawn: SPAWN.entry },
    { id: PORTAL.shopDoor, tile: [17, 16], toScene: 'shop-interior', toSpawn: SPAWN.entry },
    { id: PORTAL.deckUp, tile: [56, 38], toScene: 'takanawa', toSpawn: SPAWN.stationDeck },
    { id: PORTAL.deckDown, tile: [64, 52], toScene: 'takanawa', toSpawn: SPAWN.plaza },
  ],
  entities: [
    { id: ENTITY.stationStaff, kind: 'npc', tile: [66, 50], facing: 'down' },
    { id: ENTITY.stationZone, kind: 'zone', tile: [61, 48], size: [7, 2] },
    { id: BUILDING.station, kind: 'building', tile: [58, 40], size: [12, 8], assetId: 'station' },
    { id: BUILDING.home, kind: 'building', tile: [15, 34], size: [5, 6], assetId: 'home' },
    { id: BUILDING.matsushimaya, kind: 'building', tile: [13, 11], size: [6, 5], assetId: 'matsushimaya' },
  ],
});


// Rectangles use inclusive tile bounds. The layout is compressed game space.
function paint(layer: keyof MapDefinition['layers'], tile: number,
  x1: number, y1: number, x2: number, y2: number, blocked?: boolean): void {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const cell = y * map.grid[0] + x;
      map.layers[layer][cell] = tile;
      if (blocked !== undefined) map.collision[cell] = Number(blocked);
    }
  }
}

// Residential lanes and the stylized northwest shop branch stay west of Route 15.
paint('ground', T.SIDEWALK, 14, 38, 35, 43);
paint('ground', T.SIDEWALK, 31, 22, 36, 40);
paint('ground', T.TEMPLE_PATH, 10, 22, 40, 26);
paint('ground', T.SIDEWALK, 14, 16, 18, 24);
paint('ground', T.SIDEWALK, 34, 26, 41, 30);
paint('ground', T.PLAZA, 47, 30, 56, 40);
paint('ground', T.SIDEWALK, 47, 26, 54, 36);

// Route 15 spans the map so grass cannot provide an unmarked bypass.
paint('ground', T.ROAD_EDGE_W, 42, 0, 42, 95, true);
paint('ground', T.ROAD, 43, 0, 45, 95, true);
paint('ground', T.ROAD_EDGE_E, 46, 0, 46, 95, true);
paint('ground', T.CROSSING_H, 42, 27, 46, 29, false);

// The raised station forecourt is enclosed. Only the paired portals cross levels.
paint('ground', T.DECK_EDGE, 57, 39, 72, 56, true);
paint('ground', T.DECK, 58, 40, 71, 55, false);
paint('decoration', T.FENCE, 57, 39, 72, 39, true);
paint('decoration', T.FENCE, 57, 56, 72, 56, true);
paint('decoration', T.FENCE, 57, 40, 57, 55, true);
paint('decoration', T.FENCE, 72, 40, 72, 55, true);
paint('ground', T.STAIRS, 55, 38, 56, 39, false);
paint('ground', T.STAIRS, 63, 52, 65, 53, false);

// No bridge or tunnel crosses the north-south railway in this playable slice.
paint('ground', T.GRAVEL, 74, 0, 81, 95, true);
paint('ground', T.RAIL_V, 76, 0, 77, 95, true);
paint('ground', T.RAIL_V, 79, 0, 80, 95, true);
paint('decoration', T.FENCE, 74, 0, 74, 95, true);

for (const [x, y] of [[8, 10], [22, 12], [9, 31], [25, 34], [39, 17],
  [49, 19], [53, 43], [29, 48], [8, 48], [68, 30]] satisfies Tile[]) {
  paint('roof', T.TREE_TL, x, y, x, y);
  paint('roof', T.TREE_TR, x + 1, y, x + 1, y);
  paint('decoration', T.TREE_BL, x, y + 1, x, y + 1, true);
  paint('decoration', T.TREE_BR, x + 1, y + 1, x + 1, y + 1, true);
}
paint('decoration', T.FLOWERS, 10, 27, 25, 27);
paint('decoration', T.BENCH, 49, 33, 49, 33, true);
paint('decoration', T.LAMPPOST, 52, 31, 52, 31, true);
paint('decoration', T.VENDING, 70, 50, 70, 50, true);

for (const entity of map.entities) {
  if (entity.kind !== 'building' && entity.kind !== 'npc') continue;
  const [x, y] = entity.tile;
  const [width, height] = entity.size ?? [1, 1];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      map.collision[(y + dy) * map.grid[0] + x + dx] = 1;
    }
  }
}

export const takanawa: MapDefinition = map;
