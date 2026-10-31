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
    { id: BUILDING.station, kind: 'building', tile: [58, 41], size: [12, 5], footRow: 48, assetId: 'station' },
    { id: BUILDING.home, kind: 'building', tile: [15, 34], size: [5, 6], footRow: 40, assetId: 'home' },
    { id: BUILDING.matsushimaya, kind: 'building', tile: [13, 11], size: [6, 5], footRow: 16, assetId: 'matsushimaya' },
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

/** Deterministic 0..99 roll: the meadow is authored noise, not runtime randomness. */
function roll(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/** Dappled lawn: 4×4 GRASS_B/C patches with flecks, so GRASS_A reads as a base, not a field. */
function meadow(): void {
  const [cols, rows] = map.grid;
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const index = y * cols + x;
      if (map.layers.ground[index] !== T.GRASS_A) continue;
      const patch = roll(x >> 2, y >> 2);
      const fleck = roll(x, y);
      map.layers.ground[index] = patch < 24 ? T.GRASS_C
        : patch < 62 || fleck < 10 ? T.GRASS_B : T.GRASS_A;
    }
  }
}

/** One decoration prop. Props block their tile, so they sit beside a walkway, never on it. */
const WALKWAY = new Set<number>([T.SIDEWALK, T.TEMPLE_PATH, T.PLAZA, T.GRAVEL, T.CROSSING_H, T.CROSSING_V]);

function prop(tile: number, x: number, y: number, blocked = true): void {
  // Decorative props never land on a walkway: a planter on the lane would block the route.
  if (WALKWAY.has(map.layers.ground[y * map.grid[0] + x] ?? -1)) return;
  paint('decoration', tile, x, y, x, y, blocked);
}

/** 2×2 tree: canopy on the roof layer, trunk and skirt on the blocked decoration layer. */
function tree(x: number, y: number): void {
  paint('roof', T.TREE_TL, x, y, x, y);
  paint('roof', T.TREE_TR, x + 1, y, x + 1, y);
  paint('decoration', T.TREE_BL, x, y + 1, x, y + 1, true);
  paint('decoration', T.TREE_BR, x + 1, y + 1, x + 1, y + 1, true);
}

/**
 * Closed garden block: a blocked lawn ringed by a fence or hedge. The interior is collision, so
 * enclosing it cannot leave an unreachable walkable pocket behind the fence.
 */
function garden(x1: number, y1: number, x2: number, y2: number, border: 'fence' | 'hedge' = 'fence'): void {
  paint('ground', T.GRASS_C, x1, y1, x2, y2, true);
  const layer: keyof MapDefinition['layers'] = border === 'hedge' ? 'ground' : 'decoration';
  const tile = border === 'hedge' ? T.HEDGE : T.FENCE;
  paint(layer, tile, x1, y1, x2, y1, true);
  paint(layer, tile, x1, y2, x2, y2, true);
  paint(layer, tile, x1, y1 + 1, x1, y2 - 1, true);
  paint(layer, tile, x2, y1 + 1, x2, y2 - 1, true);
}

meadow();

// Residential lanes and the stylized northwest shop branch stay west of Route 15.
paint('ground', T.SIDEWALK, 14, 38, 35, 43);
paint('ground', T.SIDEWALK, 31, 22, 36, 40);
paint('ground', T.TEMPLE_PATH, 10, 22, 40, 26);
paint('ground', T.SIDEWALK, 14, 16, 18, 24);
paint('ground', T.SIDEWALK, 34, 26, 41, 30);
paint('ground', T.PLAZA, 47, 30, 56, 40);
paint('ground', T.SIDEWALK, 47, 26, 54, 36);

// The shop forecourt is wider than the lane so the storefront has a doorstep.
paint('ground', T.SIDEWALK, 12, 16, 20, 20);

// Neighbourhood street south of the home row, its cross street and the station forecourt.
paint('ground', T.SIDEWALK, 16, 44, 19, 83);
paint('ground', T.SIDEWALK, 16, 84, 37, 87);
paint('ground', T.PLAZA, 59, 33, 70, 37);

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

// Neighbourhood blocks. Every garden below is closed: its lawn is collision, so a hedge or fence
// ring never hides a walkable pocket, and the open lanes between blocks stay connected.
garden(2, 2, 9, 8);
garden(22, 2, 31, 9);
garden(2, 28, 8, 36);
garden(3, 46, 13, 57);
garden(3, 62, 13, 79, 'hedge');
garden(3, 88, 13, 93);
garden(23, 45, 39, 55);
garden(58, 14, 69, 24);

// The park: hedge perimeter with one west gate onto the street, a paved heart to meet on.
paint('ground', T.HEDGE, 23, 60, 39, 60, true);
paint('ground', T.HEDGE, 23, 80, 39, 80, true);
paint('ground', T.HEDGE, 23, 61, 23, 79, true);
paint('ground', T.HEDGE, 39, 61, 39, 79, true);
paint('ground', T.SIDEWALK, 20, 69, 24, 72, false);
paint('ground', T.PLAZA, 28, 66, 35, 73);

// East of the railway is sealed by the rail corridor. It stays planted and paved for the minimap,
// but no lane reaches across the tracks.
garden(86, 34, 96, 44);
garden(104, 18, 120, 28, 'hedge');
garden(98, 66, 112, 78, 'hedge');
garden(116, 54, 124, 64);
paint('ground', T.SIDEWALK, 82, 10, 83, 90);
paint('ground', T.SIDEWALK, 82, 47, 122, 48);

// Lawn flowers stay walkable so they read as meadow, not as an obstacle. Props painted later win
// their own tile, so a lamppost can stand at the edge of a bed.
// Beds stop short of the lanes so a walkway never runs through flowers.
paint('decoration', T.FLOWERS, 10, 27, 30, 27);
paint('decoration', T.FLOWERS, 10, 21, 13, 21);
paint('decoration', T.FLOWERS, 19, 21, 20, 21);
paint('decoration', T.FLOWERS, 26, 21, 40, 21);
paint('decoration', T.FLOWERS, 14, 33, 21, 33);

// East of Route 15 the reachable block gets the same neighbourhood: a lane down to the rail,
// closed gardens either side and a park strip by the water.
paint('ground', T.SIDEWALK, 54, 57, 55, 90);
paint('ground', T.PLAZA, 60, 78, 70, 84);
garden(48, 60, 53, 70);
garden(58, 60, 70, 70);
garden(48, 78, 53, 88);
garden(58, 88, 70, 93);
garden(61, 72, 70, 76);

// Trees: the original clusters, the garden copses, the park corners and the edge screens.
for (const [x, y] of [[8, 10], [22, 12], [34, 4], [39, 17], [50, 4], [52, 14], [9, 31], [25, 34],
  [7, 40], [53, 43], [21, 56], [68, 30], [58, 6], [66, 12], [71, 28],
  [4, 4], [24, 3], [29, 7], [4, 30], [6, 33], [5, 48], [10, 54], [5, 64], [10, 68], [5, 75],
  [5, 89], [10, 91], [25, 47], [32, 47], [36, 51], [60, 16], [66, 20],
  [50, 63], [52, 80], [57, 86], [68, 59], [71, 73],
  [24, 61], [37, 61], [24, 77], [37, 77], [20, 90], [24, 92], [30, 90], [35, 91], [39, 88],
  [88, 36], [93, 41], [106, 20], [112, 23], [117, 26], [100, 68], [106, 72], [109, 76],
  [118, 56], [121, 61], [86, 8], [94, 6], [102, 12], [112, 14], [120, 10], [88, 22], [96, 24],
  [118, 32], [90, 52], [100, 54], [114, 58], [88, 62], [94, 72], [102, 82], [114, 84], [120, 88],
  [88, 86], [96, 90]] satisfies Tile[]) tree(x, y);

// Lampposts follow the walkway shoulders: the temple path, home row, main street, plaza, station
// forecourt and the park heart.
for (const [x, y] of [[11, 21], [21, 21], [12, 22], [24, 22], [36, 22], [18, 26], [30, 26],
  [13, 43], [22, 43], [31, 43], [37, 38], [15, 48], [15, 56], [15, 64], [15, 72], [15, 80],
  [20, 46], [20, 77], [50, 30], [54, 30], [48, 40], [55, 40], [59, 33], [70, 33], [59, 37],
  [70, 37], [28, 66], [35, 66], [28, 73], [35, 73]] satisfies Tile[]) prop(T.LAMPPOST, x, y);

// Benches face the lanes and the park plaza, clear of the through route.
for (const [x, y] of [[13, 40], [20, 50], [20, 58], [48, 32], [48, 36], [60, 34], [69, 34],
  [27, 68], [27, 71], [36, 68], [36, 71]] satisfies Tile[]) prop(T.BENCH, x, y);

// Vending machines sit on corners where a walker would stop, not in the road.
for (const [x, y] of [[21, 18], [12, 44], [20, 63], [47, 38], [59, 35], [70, 50]] satisfies Tile[])
  prop(T.VENDING, x, y);

// Flower clumps inside the closed gardens, beside their trees.
for (const [x, y] of [[7, 3], [3, 7], [26, 3], [30, 5], [3, 33], [7, 29], [8, 47], [4, 53],
  [11, 56], [7, 65], [4, 71], [8, 77], [8, 89], [6, 92], [27, 49], [30, 52], [35, 53],
  [62, 18], [67, 22], [89, 39], [94, 36], [108, 21], [114, 25], [119, 19], [102, 70],
  [110, 74], [119, 59], [122, 55]] satisfies Tile[]) prop(T.FLOWERS, x, y);

// Planters and beds frame doorsteps and the plaza edges.
for (const [x, y] of [[12, 16], [12, 17], [20, 16], [20, 17], [26, 43], [29, 43], [47, 33],
  [56, 33], [61, 37], [68, 37], [25, 66], [38, 66], [26, 75], [37, 75]] satisfies Tile[])
  prop(T.FLOWERS, x, y);

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
