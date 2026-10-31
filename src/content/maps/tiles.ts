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

/** public/sprites/tiles-interior.png — 8 cols × 6 rows of 16×16. */
export const IT = {
  TATAMI: 0, WOOD_FLOOR: 1, WALL: 2, WINDOW: 3, LOW_TABLE: 4, FUTON: 5, GENKAN: 6, DOOR_MAT: 7,
  SHOP_FLOOR: 8, DISPLAY_L: 9, DISPLAY_R: 10, SHELF: 11, NOREN_DOOR: 12, REGISTER: 13, COUNTER: 14, PLANT: 15,
  // Row 2: walls and home furniture
  WALL_TOP: 16, WALL_BASE: 17, WALL_SHOJI: 18, WINDOW_CURTAIN: 19, BOOKSHELF: 20, TV_STAND: 21, KITCHEN_COUNTER: 22, SINK: 23,
  // Row 3: home furniture
  STOVE: 24, FRIDGE: 25, ZABUTON: 26, KOTATSU_L: 27, KOTATSU_R: 28, RUG: 29, FLOOR_LAMP: 30, WALL_CLOCK: 31,
  // Row 4: shop furniture
  SHOP_WALL: 32, MENU_BOARD: 33, WAGASHI_TRAY: 34, TEA_SET: 35, STOOL: 36, POTTED_BAMBOO: 37, PAPER_LANTERN: 38, SHOP_WINDOW: 39,
  // Row 5: floors, entrance, small props
  FLOOR_WOOD_DARK: 40, DOMA_STONE: 41, GENKAN_STEP: 42, SHOE_RACK: 43, UMBRELLA_STAND: 44, CUSHION_CHAIR: 45, PICTURE_FRAME: 46,
  // 47 reserved
  // On the second interior sheet (tiles-interior-2), indices 48+.
  STAIRS_UP: 48, STAIRS_DOWN: 49,
} as const;

export const TILESETS = {
  'tiles-outdoor': { cols: 8, rows: 6 },
  'tiles-interior': { cols: 8, rows: 6 },
  'tiles-interior-2': { cols: 8, rows: 2 },
} as const;
export type TilesetId = keyof typeof TILESETS;

/** One image a tileset is split across, and the tile index range it covers. */
export interface TileSheet {
  id: TilesetId;
  /** First tile index on this sheet. */
  base: number;
  /** Number of tiles on this sheet. */
  count: number;
}

/** The images that make up each tileset, in draw order. Index = sheet base + frame. */
export const TILESET_SHEETS: Record<TilesetId, readonly TileSheet[]> = {
  'tiles-outdoor': [{ id: 'tiles-outdoor', base: 0, count: 48 }],
  'tiles-interior': [
    { id: 'tiles-interior', base: 0, count: 48 },
    { id: 'tiles-interior-2', base: 48, count: 16 },
  ],
  // tiles-interior-2 is a companion sheet: scenes using it draw through 'tiles-interior' above.
  'tiles-interior-2': [{ id: 'tiles-interior-2', base: 0, count: 16 }],
};

/** One past the highest tile index the tileset's sheets cover. */
export function tileCount(tileset: TilesetId): number {
  return TILESET_SHEETS[tileset].reduce((end, sheet) => Math.max(end, sheet.base + sheet.count), 0);
}

export const TILESET_FOR_SCENE: Record<SceneId, TilesetId> = {
  takanawa: 'tiles-outdoor',
  'home-interior': 'tiles-interior',
  'home-2f': 'tiles-interior',
  'shop-interior': 'tiles-interior',
};
