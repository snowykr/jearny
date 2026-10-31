import { BUILDING, ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { EntityAnchor, MapDefinition, Tile } from '../../contracts';
import { T } from './tiles';
import { makeRoom } from './util';

/**
 * Every building on the town map. `size` is the art registry footprint (`collisionTiles`) and
 * `footRow` the sprite's bottom row, so exactly the rows the sprite paints block movement
 * (docs/ART.md). `footRow` is `tile.y + size.y` for every pack sprite because they paint down to
 * their last 16px band; the station keeps transparent padding below the roof, so its foot row sits
 * two rows under the footprint. Doors are placed from `anchors.door`, so a walkable tile always sits
 * directly in front of them (see the tests).
 */
const BUILDINGS: readonly EntityAnchor[] = [
  { id: BUILDING.station, kind: 'building', tile: [58, 41], size: [12, 5], footRow: 48, assetId: 'station' },
  { id: BUILDING.home, kind: 'building', tile: [15, 34], size: [5, 6], footRow: 40, assetId: 'home' },
  { id: BUILDING.matsushimaya, kind: 'building', tile: [13, 11], size: [6, 5], footRow: 16, assetId: 'matsushimaya' },
  // The bakery is set back behind a forecourt so its door reads from the home lane.
  { id: BUILDING.liebe, kind: 'building', tile: [20, 30], size: [5, 5], footRow: 35, assetId: 'liebe' },
  // Residential row on the north side of the home lane: every door opens onto the pavement.
  { id: BUILDING.houseThree, kind: 'building', tile: [9, 34], size: [5, 4], footRow: 38, assetId: 'house-3' },
  { id: BUILDING.apartmentSmall, kind: 'building', tile: [25, 31], size: [6, 7], footRow: 38, assetId: 'apartment-small' },
  { id: BUILDING.houseTwo, kind: 'building', tile: [37, 33], size: [5, 5], footRow: 38, assetId: 'house-2' },
  // Station corner: the police box and the convenience store front the walkway off the crossing.
  { id: BUILDING.koban, kind: 'building', tile: [47, 22], size: [3, 4], footRow: 26, assetId: 'koban' },
  { id: BUILDING.konbini, kind: 'building', tile: [50, 22], size: [7, 4], footRow: 26, assetId: 'konbini' },
  // Cafe above the station forecourt, facing the plaza across the lawn.
  { id: BUILDING.cafe, kind: 'building', tile: [59, 28], size: [5, 5], footRow: 33, assetId: 'cafe' },
  // Bicycle parking at the foot of the deck stairs, south of the plaza.
  { id: BUILDING.bicycleParking, kind: 'building', tile: [52, 41], size: [4, 3], footRow: 44, assetId: 'bicycle-parking' },
  // 泉岳寺: the hall sits behind a stone court, the gate opens onto the temple path (34,24 is the
  // approach marker on the minimap), and the gate's own paved apron is the path's north row.
  { id: BUILDING.sengakujiHall, kind: 'building', tile: [32, 6], size: [10, 8], footRow: 14, assetId: 'sengakuji-hall' },
  { id: BUILDING.sengakujiGate, kind: 'building', tile: [33, 16], size: [8, 6], footRow: 22, assetId: 'sengakuji-gate' },
];

/**
 * The gate's central passage, carved out of its footprint. sengakuji-gate.json says the sanmon art
 * paints an open passage and that the map owner must leave a walkable gap in the collision
 * rectangle; the sprite's transparent opening spans these two central columns. The flanking posts
 * stay solid, and this is the only exemption from building-footprint collision on the map.
 */
export const PASSAGES: readonly Tile[] = [
  [36, 16], [37, 16], [36, 17], [37, 17], [36, 18], [37, 18],
  [36, 19], [37, 19], [36, 20], [37, 20], [36, 21], [37, 21],
];

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
    ...BUILDINGS,
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

/**
 * True when a `size`×`size` art cell at (x, y) would touch a building footprint. Painted rows equal
 * collision rows for every placed sprite, so this is visual clearance rather than a roof overhang:
 * a two-row canopy needs breathing room above and beside a facade or it reads as part of the roof.
 */
function onBuilding(x: number, y: number, size = 1): boolean {
  return BUILDINGS.some((b) => {
    const [bw, bh] = b.size ?? [1, 1];
    const [bx, by] = b.tile;
    return x + size > bx - 1 && x < bx + bw + 1 && y + size > by - 2 && y < by + bh + 1;
  });
}

/** Ground tiles a prop must never stand on: a planter on the lane would block the route. */
export const WALKWAY_TILES: ReadonlySet<number> = new Set([
  T.SIDEWALK, T.TEMPLE_PATH, T.PLAZA, T.GRAVEL, T.CROSSING_H, T.CROSSING_V, T.DECK, T.STAIRS,
]);

/**
 * Ground a prop cannot stand on even though it is not pavement: asphalt, the crossing, the rail bed,
 * the deck's raised lip, gravel, stone walls, hedges and water. A lamppost on the Route 15 stripe is
 * an invisible wall in the road, which is worse than a dropped prop.
 */
const PROPS_FORBIDDEN: ReadonlySet<number> = new Set([
  T.ROAD, T.ROAD_EDGE_N, T.ROAD_EDGE_S, T.ROAD_EDGE_E, T.ROAD_EDGE_W,
  T.CROSSING_H, T.CROSSING_V, T.RAIL_H, T.RAIL_V,
  T.DECK_EDGE, T.GRAVEL, T.STONE_WALL, T.HEDGE, T.WATER,
]);

const groundAt = (x: number, y: number): number => map.layers.ground[y * map.grid[0] + x] ?? -1;
const decorationAt = (x: number, y: number): number => map.layers.decoration[y * map.grid[0] + x] ?? -1;

/** Props whose shoulder search found nowhere. Tests require this to stay empty. */
export const PROP_MISSES: Tile[] = [];

/** Pavement benches whose authored cell was not free pavement. Tests require this to stay empty. */
export const BENCH_MISSES: Tile[] = [];

/** Trees (explicit or copse) with no clear meadow cell left. Tests require this to stay empty. */
export const TREE_MISSES: Tile[] = [];

const MEADOW_TILES: ReadonlySet<number> = new Set([T.GRASS_A, T.GRASS_B, T.GRASS_C]);

/**
 * Neighbour offsets in outward spiral order: the authored cell first, then each square ring from
 * the top-left corner round clockwise. Four rings are enough to reach the shoulder of a five-row
 * pavement like the home lane without letting a prop wander across the map.
 */
function* shoulderSearch(): Generator<Tile> {
  yield [0, 0];
  for (let r = 1; r <= 4; r++) {
    for (let dx = -r; dx <= r; dx++) yield [dx, -r];
    for (let dy = -r + 1; dy <= r; dy++) yield [r, dy];
    for (let dx = r - 1; dx >= -r; dx--) yield [dx, r];
    for (let dy = r - 1; dy >= -r + 1; dy--) yield [-r, dy];
  }
}

/**
 * Prop on the shoulder of a walkway. Authored coordinates aim at the lane itself, so a prop that
 * lands on pavement moves to the nearest buildable shoulder instead of vanishing; a prop that still
 * has nowhere to go is recorded in PROP_MISSES rather than silently dropped.
 */
function prop(tile: number, x: number, y: number, blocked = true): boolean {
  for (const [dx, dy] of shoulderSearch()) {
    const sx = x + dx;
    const sy = y + dy;
    if (sx < 1 || sy < 1 || sx >= map.grid[0] - 1 || sy >= map.grid[1] - 1) continue;
    const ground = groundAt(sx, sy);
    if (WALKWAY_TILES.has(ground) || PROPS_FORBIDDEN.has(ground)) continue;
    if (decorationAt(sx, sy) !== -1 || onBuilding(sx, sy)) continue;
    paint('decoration', tile, sx, sy, sx, sy, blocked);
    return true;
  }
  PROP_MISSES.push([x, y]);
  return false;
}

/**
 * Authored bench on wide pavement. `prop` never blocks a walkway, but a wide lane or a plaza has
 * room for a bench on its outer row; without these the widest paved screens are bare concrete.
 * A bench belongs on pavement only: the cell must be a walkway and never a tile `prop` forbids (the
 * crossing is both), and a bad coordinate is recorded instead of painting furniture over a road or
 * a lawn.
 * These stay off door fronts, portals and the crossing (the tests check all three).
 */
function pavementBench(x: number, y: number): void {
  const ground = groundAt(x, y);
  if (!WALKWAY_TILES.has(ground) || PROPS_FORBIDDEN.has(ground)
    || decorationAt(x, y) !== -1 || onBuilding(x, y)) {
    BENCH_MISSES.push([x, y]);
    return;
  }
  paint('decoration', T.BENCH, x, y, x, y, true);
}

/** True when a 2×2 tree fits at (x, y): plain meadow, nothing painted, clear of every roof. */
function treeFits(x: number, y: number): boolean {
  if (x < 1 || y < 1 || x >= map.grid[0] - 2 || y >= map.grid[1] - 2) return false;
  if (onBuilding(x, y, 2)) return false; // never grow a canopy through a roof
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const index = (y + dy) * map.grid[0] + x + dx;
      if (!MEADOW_TILES.has(map.layers.ground[index] ?? -1)
        || map.layers.decoration[index] !== -1 || map.layers.roof[index] !== -1) return false;
    }
  }
  return true;
}

/** 2×2 tree: canopy on the roof layer, trunk and skirt on the blocked decoration layer. */
function tree(x: number, y: number): boolean {
  if (!treeFits(x, y)) {
    TREE_MISSES.push([x, y]);
    return false;
  }
  paint('roof', T.TREE_TL, x, y, x, y);
  paint('roof', T.TREE_TR, x + 1, y, x + 1, y);
  paint('decoration', T.TREE_BL, x, y + 1, x, y + 1, true);
  paint('decoration', T.TREE_BR, x + 1, y + 1, x + 1, y + 1, true);
  return true;
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

// Residential lanes and the stylized northwest shop branch stay west of Route 15. The home lane
// spans the block so the new frontages get pavement under their doors instead of a lawn strip.
paint('ground', T.SIDEWALK, 8, 38, 41, 43);
paint('ground', T.SIDEWALK, 31, 22, 36, 40);
paint('ground', T.TEMPLE_PATH, 10, 22, 40, 26);
paint('ground', T.SIDEWALK, 14, 16, 18, 24);
paint('ground', T.SIDEWALK, 34, 26, 41, 30);
paint('ground', T.PLAZA, 47, 30, 56, 40);
paint('ground', T.SIDEWALK, 47, 26, 54, 36);

// The shop forecourt is wider than the lane so the storefront has a doorstep.
paint('ground', T.SIDEWALK, 12, 16, 20, 20);

// Doorstep pavements, one per new building: a door that opens onto bare lawn reads as scenery and
// leaves the player guessing where the entrance is.
paint('ground', T.PLAZA, 21, 35, 24, 37); // bakery forecourt below liebe's door
paint('ground', T.PLAZA, 31, 14, 41, 15); // 泉岳寺 court between the hall and the gate
paint('ground', T.PLAZA, 33, 22, 40, 22); // gate's paved apron on the temple path
// The gate's central passage is the sanmon's painted opening, mandated by sengakuji-gate.json.
paint('ground', T.TEMPLE_PATH, 36, 16, 37, 21);
// Low stone walls flank the gate, so the paved court behind it reads as a temple compound.
paint('ground', T.STONE_WALL, 32, 16, 32, 21, true);
paint('ground', T.STONE_WALL, 41, 16, 41, 21, true);
// Close the west corner of the court: without this stub the player walks around the wall and the
// gate passage is scenery. The court is now entered only through the passage.
paint('ground', T.STONE_WALL, 31, 14, 31, 15, true);
paint('ground', T.PLAZA, 51, 41, 56, 45); // bicycle-parking apron, joined to the plaza at row 40

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
paint('decoration', T.FLOWERS, 26, 21, 31, 21); // stops west of the temple gate
paint('decoration', T.FLOWERS, 14, 33, 19, 33); // stops west of the bakery footprint

// East of Route 15 the reachable block gets the same neighbourhood: a lane down to the rail,
// closed gardens either side and a park strip by the water.
paint('ground', T.SIDEWALK, 54, 57, 55, 90);
paint('ground', T.PLAZA, 60, 78, 70, 84);
paint('ground', T.PLAZA, 56, 81, 59, 81);
garden(48, 60, 53, 70);
garden(58, 60, 70, 70);
garden(48, 78, 53, 88);
garden(58, 88, 70, 93);
garden(61, 72, 70, 76);

// Flower borders follow the new pavement edges and the backs of the new buildings. They stay on
// grass (a bed on a walkway would paint over the route) and are walkable, so a border frames a
// frontage without fencing it off.
const BEDS: ReadonlyArray<[number, number, number, number]> = [
  [8, 44, 13, 44], [21, 44, 24, 44], [26, 44, 30, 44], [37, 44, 41, 44], // south shoulder of the lane
  [9, 33, 13, 33], [25, 30, 30, 30], [37, 32, 41, 32], [20, 29, 24, 29], // behind the houses
  [47, 20, 49, 20], [50, 20, 56, 20], // behind the police box and the store
  [59, 27, 63, 27], [47, 46, 50, 46], // cafe back and bike-parking apron
  [31, 16, 31, 21], // along the temple wall
  [34, 2, 40, 2], [47, 6, 52, 7], [54, 3, 58, 3], // north meadow banks
  [62, 12, 68, 12], [70, 16, 72, 16], // station garden rim
  [4, 41, 7, 41], [30, 58, 35, 58], [47, 59, 52, 59], // lane and yard edges
  [5, 81, 12, 81], [20, 89, 25, 89], [48, 93, 52, 93], // park and south field
  [61, 71, 70, 71], [4, 59, 12, 59],
  [16, 9, 21, 9], [69, 11, 73, 11], [69, 19, 73, 19], [1, 21, 2, 21],
  [1, 11, 2, 11], [1, 19, 2, 19], [1, 4, 1, 7], [71, 7, 73, 7], [4, 61, 12, 61],
  [1, 88, 2, 88], [58, 69, 69, 69], [1, 83, 3, 83], [31, 56, 34, 56], [1, 78, 2, 78],
  [15, 1, 17, 1], [71, 25, 73, 25],
  // Wildflower borders around the south street and the east square, so their wide paving is
  // framed by beds instead of meeting the lawn edge as bare concrete.
  [20, 82, 29, 83], [14, 81, 15, 83], [56, 77, 58, 77], [59, 77, 73, 77],
  [59, 85, 73, 86], [71, 78, 73, 84], [24, 74, 27, 75],
];
for (const [x1, y1, x2, y2] of BEDS) paint('decoration', T.FLOWERS, x1, y1, x2, y2);

// Trees: the original clusters, the garden copses, the park corners and the edge screens.
for (const [x, y] of [[8, 10], [22, 12], [50, 4], [52, 14], [9, 30],
  [21, 56], [68, 30], [58, 6], [66, 10], [71, 28],
  [4, 4], [24, 3], [29, 7], [4, 30], [6, 33], [5, 39], [5, 48], [10, 54], [5, 64], [10, 68], [5, 75],
  [5, 89], [10, 91], [25, 47], [32, 47], [36, 51], [60, 16], [66, 20],
  [50, 63], [57, 82], [57, 86], [72, 58], [71, 73],
  [24, 61], [37, 61], [24, 77], [37, 77], [20, 90], [24, 92], [30, 90], [35, 91], [39, 88],
  [88, 36], [93, 41], [106, 20], [112, 23], [117, 26], [100, 68], [106, 72], [109, 76],
  [118, 56], [121, 61], [86, 8], [94, 6], [102, 12], [112, 14], [120, 10], [88, 22], [96, 24],
  [118, 32], [90, 52], [100, 54], [114, 58], [88, 62], [94, 72], [102, 82], [114, 84], [120, 88],
  [88, 86], [96, 90]] satisfies Tile[]) tree(x, y);

/**
 * Tree cluster: `count` 2×2 trees scattered around (cx, cy) by `roll`, so a group reads as a copse
 * with varied spacing rather than an evenly spaced row. A tree only lands on plain meadow with
 * nothing on any of its four cells: never a walkway, prop, bed, garden ring or another canopy.
 * A skipped tree is recorded by `tree` instead of vanishing, so an authored count that no longer
 * fits is either given room or removed from the list.
 */
function copse(cx: number, cy: number, count: number, spread: number): void {
  // Walk the copse square in a deterministic pseudo-random order (the same `roll` as the meadow), so
  // a tree that cannot stand on one cell still fills the next clear one instead of disappearing.
  const anchors: Tile[] = [];
  for (let dy = -spread; dy <= spread; dy++) {
    for (let dx = -spread; dx <= spread; dx++) anchors.push([cx + dx, cy + dy]);
  }
  anchors.sort((a, b) => roll(a[0], a[1]) - roll(b[0], b[1]));
  let placed = 0;
  for (const [x, y] of anchors) {
    if (placed >= count) break;
    if (!treeFits(x, y)) continue;
    tree(x, y);
    placed++;
  }
  for (let i = placed; i < count; i++) TREE_MISSES.push([cx, cy]);
}

// Copses, not orchard rows: corners, garden backs and the far bank. Every entry is [cx, cy, trees,
// spread]; the count is exact, not a target: each copse fills its square in a deterministic
// pseudo-random order and `TREE_MISSES` flags any entry that can no longer fit its trees.
const COPSES: ReadonlyArray<[number, number, number, number]> = [
  [5, 5, 3, 1], [5, 13, 4, 2], [10, 18, 3, 2], [24, 16, 4, 2], [5, 25, 3, 2],
  [50, 4, 5, 3], [57, 8, 4, 2], [64, 5, 8, 3], [70, 9, 3, 2],
  [50, 16, 5, 3], [55, 12, 4, 2], [62, 18, 6, 2], [66, 22, 2, 2], [63, 21, 1, 1],
  [6, 53, 5, 2], [10, 49, 4, 2], [26, 57, 3, 2], [36, 55, 4, 2], [50, 52, 4, 2],
  [54, 50, 2, 1], [6, 68, 5, 2], [10, 75, 4, 2], [5, 84, 5, 2], [11, 82, 4, 2],
  [62, 64, 7, 2], [67, 67, 3, 2], [48, 72, 3, 1], [20, 92, 1, 1],
  [26, 91, 3, 1], [48, 92, 2, 1], [63, 91, 2, 1],
  // Garden lawns, the north field and the south banks, so no camera window ends on open lawn.
  [26, 5, 3, 2], [19, 7, 2, 1], [6, 18, 2, 1], [20, 13, 2, 1], [52, 18, 2, 2],
  [48, 12, 3, 2], [67, 17, 1, 1], [71, 13, 3, 1], [60, 23, 1, 1],
  [69, 3, 3, 1], [6, 63, 1, 1], [65, 62, 1, 1],
  [8, 72, 2, 1], [8, 86, 1, 1], [22, 92, 1, 1], [67, 92, 2, 1],
  // The walled station garden and the corners the wider crops left thin.
  [70, 26, 3, 2], [71, 29, 2, 1],
  [9, 66, 2, 1], [66, 2, 1, 1], [69, 64, 1, 1],
  [33, 52, 2, 1], [72, 64, 2, 1], [28, 4, 2, 1], [68, 26, 1, 1],
  // Far bank: unreachable scenery, but the horizon should still read as planted.
  [86, 12, 4, 2], [96, 30, 4, 2], [110, 70, 4, 2], [118, 40, 3, 2], [116, 82, 4, 2],
];
for (const [cx, cy, count, spread] of COPSES) copse(cx, cy, count, spread);

// Lampposts follow the walkway shoulders: the temple path, home row, main street, plaza, station
// forecourt and the park heart.
for (const [x, y] of [[11, 21], [21, 21], [12, 22], [24, 22], [30, 21], [18, 26], [30, 26],
  [13, 43], [22, 45], [31, 43], [35, 44], [15, 48], [15, 56], [15, 64], [15, 72], [15, 80],
  [20, 46], [20, 77], [57, 30], [54, 30], [48, 40], [55, 40], [59, 33], [70, 33], [59, 37],
  [70, 37], [28, 66], [35, 66], [28, 73], [35, 73], [57, 39], [56, 72]] satisfies Tile[])
  prop(T.LAMPPOST, x, y);

// Benches face the lanes and the park plaza, clear of the through route.
for (const [x, y] of [[14, 44], [20, 50], [20, 58], [57, 32], [57, 36], [60, 34], [69, 34],
  [27, 68], [27, 71], [36, 68], [36, 71], [57, 31], [56, 64], [56, 86]] satisfies Tile[])
  prop(T.BENCH, x, y);

// Vending machines sit on corners where a walker would stop, not in the road.
for (const [x, y] of [[21, 18], [12, 44], [20, 63], [47, 38], [59, 35], [70, 50]] satisfies Tile[])
  prop(T.VENDING, x, y);

// Flower clumps inside the closed gardens, beside their trees.
for (const [x, y] of [[7, 3], [3, 7], [26, 3], [30, 5], [3, 33], [7, 29], [8, 47], [4, 53],
  [11, 56], [7, 65], [4, 71], [8, 77], [8, 89], [6, 92], [27, 49], [30, 52], [35, 53],
  [62, 18], [67, 22], [89, 39], [94, 36], [108, 21], [114, 25], [119, 19], [102, 70],
  [110, 74], [119, 59], [122, 55]] satisfies Tile[]) prop(T.FLOWERS, x, y);

// Planters and beds frame doorsteps and the plaza edges.
for (const [x, y] of [[12, 16], [12, 17], [20, 16], [20, 17], [26, 43], [31, 44], [57, 33],
  [56, 33], [61, 37], [68, 37], [25, 66], [38, 66], [26, 75], [37, 75]] satisfies Tile[])
  prop(T.FLOWERS, x, y);

// Planting along the approach shoulders: flower clumps on the open meadow rows north and south of
// the path, and a clipped hedge where the lawn meets the lane, so the widest paved corridor is
// framed by planting instead of ending on bare lawn. These cells are grass, never a walkway.
paint('decoration', T.FLOWERS, 19, 28, 20, 28);
paint('decoration', T.FLOWERS, 10, 29, 11, 29);
paint('decoration', T.FLOWERS, 13, 29, 13, 29);
paint('decoration', T.FLOWERS, 15, 29, 16, 29);
paint('decoration', T.FLOWERS, 18, 29, 19, 29);
paint('decoration', T.FLOWERS, 26, 29, 30, 29);
paint('decoration', T.FLOWERS, 11, 30, 11, 30);
paint('decoration', T.FLOWERS, 13, 30, 13, 30);
paint('decoration', T.FLOWERS, 15, 30, 15, 30);
paint('decoration', T.FLOWERS, 17, 30, 17, 30);
paint('ground', T.HEDGE, 12, 28, 17, 28, true);
paint('ground', T.HEDGE, 21, 30, 23, 30, true);
paint('ground', T.HEDGE, 24, 21, 25, 21, true);
paint('ground', T.HEDGE, 36, 31, 36, 31, true);
paint('ground', T.HEDGE, 36, 33, 36, 33, true);

// Wide pavement gets authored benches on its outer rows, clear of every door, portal and spawn.
pavementBench(25, 43);
pavementBench(26, 43);
pavementBench(30, 43);
pavementBench(35, 43);
pavementBench(48, 34);
pavementBench(49, 31);
pavementBench(51, 34);
pavementBench(53, 31);
pavementBench(54, 34);
// The station deck is a big open terrace, so it gets the same seating along its edges. Row 46/47
// beside x58 stays clear because those are the station sprite's transparent padding rows, and the
// gap at x64 keeps the deck portal, its stairs and the station zone on one clear north-south walk.
for (let y = 48; y <= 55; y++) pavementBench(58, y);
for (let y = 46; y <= 55; y++) pavementBench(71, y);
for (const y of [48, 49]) {
  for (const x of [59, 60, 68, 69, 70]) pavementBench(x, y);
}
for (let x = 59; x <= 70; x++) {
  if (x === 64) continue;
  pavementBench(x, 54);
}

// The temple approach is the widest plain corridor on the map: a five-row path meeting a six-wide
// lane. Seating on its outer rows furnishes the camera windows at the path edges while the three
// middle rows stay clear from the west meadow, under the gate and into the hall court. The gate axis
// (x36..37), the shop lane (x14..18) and the lane junction (x31..36) stay unseated.
for (const x of [10, 13, 19, 22, 25, 28, 31]) pavementBench(x, 22);
for (const x of [10, 13, 16, 19, 22, 25, 28, 30, 38, 40]) pavementBench(x, 26);
pavementBench(31, 27);
pavementBench(40, 27);
pavementBench(40, 29);
// The station forecourt plaza is the widest paved screen on the east side; its edges get the same
// seating so the camera never opens on bare concrete.
for (const [x, y] of [[47, 31], [47, 35], [52, 37], [55, 36], [56, 31]] satisfies Tile[])
  pavementBench(x, y);

/**
 * Scatter walkable meadow flowers over plain grass. The quality test counts undecorated grass as
 * empty, and a 30% deterministic sprinkle (same `roll` as the copses) is the difference between a
 * lawn and a meadow. Beds, paths and roofs keep their own tiles.
 */
function meadowFlowers(): void {
  const grass: ReadonlySet<number> = new Set([T.GRASS_A, T.GRASS_B, T.GRASS_C]);
  for (let y = 1; y < map.grid[1] - 1; y++) {
    for (let x = 1; x < map.grid[0] - 1; x++) {
      const index = y * map.grid[0] + x;
      if (!grass.has(map.layers.ground[index] ?? -1)) continue;
      if (map.layers.decoration[index] !== -1 || map.layers.roof[index] !== -1) continue;
      if (roll(x, y) >= 30) continue;
      map.layers.decoration[index] = T.FLOWERS;
    }
  }
}

meadowFlowers();

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

// The sanmon passage is walkable inside the gate footprint; its flanking posts stay blocked above.
for (const [x, y] of PASSAGES) map.collision[y * map.grid[0] + x] = 0;

export const takanawa: MapDefinition = map;
