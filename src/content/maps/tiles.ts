// Track A tile index contract. Sheet layouts are fixed so maps (#4, #5) and
// art (#3, #9) can be built in parallel. Index = row * 8 + col. -1 = empty.
import type { SceneId } from '../../contracts';

/** public/sprites/tiles-outdoor.png — 8 cols × 6 rows of 16×16. */
export const T = {
  GRASS_A: 0, GRASS_B: 1, GRASS_C: 2, SIDEWALK: 3, ROAD: 4, ROAD_EDGE_N: 5, ROAD_EDGE_S: 6, ROAD_EDGE_E: 7,
  ROAD_EDGE_W: 8, CROSSING_H: 9, CROSSING_V: 10, RAIL_H: 11, RAIL_V: 12, DECK: 13, DECK_EDGE: 14, STAIRS: 15,
  HEDGE: 16, TREE_TL: 17, TREE_TR: 18, TREE_BL: 19, TREE_BR: 20, LAMPPOST: 21, VENDING: 22, BENCH: 23,
  TEMPLE_PATH: 24, STONE_WALL: 25, FENCE: 26, FLOWERS: 27, PLAZA: 28, WATER: 29, GRAVEL: 30, CURB: 31,
  // 32..47 reserved
} as const;

/** public/sprites/tiles-interior.png — 8 cols × 4 rows of 16×16. */
export const IT = {
  TATAMI: 0, WOOD_FLOOR: 1, WALL: 2, WINDOW: 3, LOW_TABLE: 4, FUTON: 5, GENKAN: 6, DOOR_MAT: 7,
  SHOP_FLOOR: 8, DISPLAY_L: 9, DISPLAY_R: 10, SHELF: 11, NOREN_DOOR: 12, REGISTER: 13, COUNTER: 14, PLANT: 15,
  // 16..31 reserved
} as const;

export const TILESETS = {
  'tiles-outdoor': { cols: 8, rows: 6 },
  'tiles-interior': { cols: 8, rows: 4 },
} as const;
export type TilesetId = keyof typeof TILESETS;

export const TILESET_FOR_SCENE: Record<SceneId, TilesetId> = {
  takanawa: 'tiles-outdoor',
  'home-interior': 'tiles-interior',
  'shop-interior': 'tiles-interior',
};
