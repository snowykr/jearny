import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

const COLS = 18;
const ROWS = 14;

// A small wagashi (sweets) and tea shop, seen from above. Interior is x 1..16, y 1..12.
//
//   y0   cap row; y1 shop-wall face with windows, lanterns and the menu board
//   y2-4 staff side (dark wood) with shelves; the shopkeeper stands at [9,4]
//   y5   the glass counter, x 1..16 (sealed at both ends), so the staff side is for the shopkeeper only
//   y6-12 shop floor: a tea corner on the right, goods shelves on the left,
//        packed-earth entrance with the noren door in the bottom wall at [9,13]
//
// The shopkeeper's anchor is 2x2 ([9..10, 4..5]) so a customer at [9,6] or [10,6] reaches them across
// the display case. Convention as in home-interior: `ground` = opaque floor/wall, `decoration` = props.
export const shopInterior: MapDefinition = makeRoom({
  id: 'shop-interior',
  grid: [COLS, ROWS],
  floor: IT.SHOP_FLOOR,
  wall: IT.WALL_TOP,
  spawns: { [SPAWN.entry]: [9, 12] },
  portals: [{ id: PORTAL.shopExit, tile: [9, 13], toScene: 'takanawa', toSpawn: SPAWN.shopDoor }],
  entities: [{ id: ENTITY.shopkeeper, kind: 'npc', tile: [9, 4], size: [2, 2], facing: 'down' }],
});

const { ground, decoration } = shopInterior.layers;
const { collision } = shopInterior;

const fill = (x0: number, y0: number, x1: number, y1: number, tile: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[idx(COLS, x, y)] = tile;
};
const hang = (x: number, y: number, tile: number) => {
  decoration[idx(COLS, x, y)] = tile;
};
const place = (x: number, y: number, tile: number) => {
  decoration[idx(COLS, x, y)] = tile;
  collision[idx(COLS, x, y)] = 1;
};

// ---- walls -----------------------------------------------------------------
fill(1, 1, 16, 1, IT.SHOP_WALL);
for (let x = 1; x <= 16; x++) collision[idx(COLS, x, 1)] = 1;
fill(1, 13, 16, 13, IT.WALL_BASE);
ground[idx(COLS, 9, 13)] = IT.NOREN_DOOR;

hang(3, 1, IT.SHOP_WINDOW);
hang(4, 1, IT.SHOP_WINDOW);
hang(6, 1, IT.PAPER_LANTERN);
hang(8, 1, IT.MENU_BOARD);
hang(10, 1, IT.MENU_BOARD);
hang(12, 1, IT.PAPER_LANTERN);
hang(14, 1, IT.SHOP_WINDOW);
hang(15, 1, IT.SHOP_WINDOW);

// ---- floors ----------------------------------------------------------------
fill(1, 2, 16, 4, IT.FLOOR_WOOD_DARK); // staff side
fill(13, 7, 16, 11, IT.FLOOR_WOOD_DARK); // tea corner
fill(7, 11, 11, 12, IT.DOMA_STONE); // entrance
ground[idx(COLS, 9, 12)] = IT.DOOR_MAT;

// ---- staff side ----------------------------------------------------------------
place(1, 2, IT.POTTED_BAMBOO);
place(16, 2, IT.POTTED_BAMBOO);
for (const x of [6, 7, 11, 12]) place(x, 2, IT.SHELF);
place(3, 3, IT.TEA_SET);
place(14, 3, IT.WAGASHI_TRAY);

// ---- the counter (y5), glass cases in the middle ------------------------------
place(1, 5, IT.SHELF);
place(16, 5, IT.SHELF);
const counter: Array<[number, number]> = [
  [2, IT.COUNTER], [3, IT.TEA_SET], [4, IT.COUNTER], [5, IT.WAGASHI_TRAY], [6, IT.COUNTER],
  [7, IT.DISPLAY_L], [8, IT.DISPLAY_R], [9, IT.DISPLAY_L], [10, IT.DISPLAY_R], [11, IT.DISPLAY_L], [12, IT.DISPLAY_R],
  [13, IT.REGISTER], [14, IT.COUNTER], [15, IT.WAGASHI_TRAY],
];
for (const [x, tile] of counter) place(x, 5, tile);

// ---- customer side -------------------------------------------------------------
// goods shelves on the left wall
for (const y of [7, 8, 9]) place(1, y, IT.SHELF);
place(1, 11, IT.POTTED_BAMBOO);
place(2, 12, IT.PLANT);
// tea corner: two stool + low table + cushion-chair sets
for (const y of [8, 10]) {
  place(13, y, IT.STOOL);
  place(14, y, IT.LOW_TABLE);
  place(15, y, IT.CUSHION_CHAIR);
}
place(16, 7, IT.PLANT);
place(16, 12, IT.POTTED_BAMBOO);
