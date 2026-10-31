import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

const COLS = 13;
const ROWS = 9;

// A one-screen wagashi shop (#78). The camera is fixed; the counter spans the
// upper third and the shopkeeper stands fully visible behind it.
//
//   y0   cap row
//   y1   shop-wall face: windows, lanterns, menu board
//   y2-3 staff side; the shopkeeper is at [5,3] (2x1 collision)
//   y4   the glass counter, x1..11, sealed at both ends
//   y5-7 customer floor: shelves on the left, tea corner on the right
//   y8   front wall with the noren door at x6
export const shopInterior: MapDefinition = makeRoom({
  id: 'shop-interior',
  grid: [COLS, ROWS],
  floor: IT.SHOP_FLOOR,
  wall: IT.WALL_TOP,
  spawns: { [SPAWN.entry]: [6, 7] },
  portals: [{ id: PORTAL.shopExit, tile: [6, 8], toScene: 'takanawa', toSpawn: SPAWN.shopDoor }],
  entities: [{ id: ENTITY.shopkeeper, kind: 'npc', tile: [5, 3], size: [2, 2], facing: 'down' }],
});

const { ground, decoration } = shopInterior.layers;
const { collision } = shopInterior;

const fill = (x0: number, y0: number, x1: number, y1: number, tile: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[idx(COLS, x, y)] = tile;
};
const hang = (x: number, y: number, tile: number) => {
  decoration[idx(COLS, x, y)] = tile;
};
const place = (x: number, y: number, tile: number, solid = true) => {
  decoration[idx(COLS, x, y)] = tile;
  collision[idx(COLS, x, y)] = solid ? 1 : 0;
};

// ---- walls -----------------------------------------------------------------
fill(1, 1, 11, 1, IT.SHOP_WALL);
for (let x = 1; x <= 11; x++) collision[idx(COLS, x, 1)] = 1;
fill(1, 8, 11, 8, IT.WALL_BASE);
ground[idx(COLS, 6, 8)] = IT.NOREN_DOOR;

hang(2, 1, IT.SHOP_WINDOW);
hang(3, 1, IT.SHOP_WINDOW);
hang(5, 1, IT.MENU_BOARD);
hang(6, 1, IT.MENU_BOARD);
hang(8, 1, IT.PAPER_LANTERN);
hang(9, 1, IT.PAPER_LANTERN);
hang(10, 1, IT.SHOP_WINDOW);
hang(11, 1, IT.SHOP_WINDOW);

// ---- staff side -------------------------------------------------------------
place(1, 2, IT.POTTED_BAMBOO);
place(11, 2, IT.POTTED_BAMBOO);
place(2, 3, IT.SHELF);
place(1, 3, IT.TEA_SET);
place(10, 3, IT.WAGASHI_TRAY);

// ---- counter (y4) -----------------------------------------------------------
const counter: Array<[number, number]> = [
  [1, IT.SHELF], [2, IT.COUNTER], [3, IT.WAGASHI_TRAY], [4, IT.COUNTER],
  [5, IT.DISPLAY_L], [6, IT.DISPLAY_R], [7, IT.DISPLAY_L], [8, IT.DISPLAY_R],
  [9, IT.REGISTER], [10, IT.COUNTER], [11, IT.SHELF],
];
for (const [x, tile] of counter) place(x, 4, tile);

// ---- customer floor ---------------------------------------------------------
for (const y of [5, 6]) place(1, y, IT.SHELF);
place(10, 5, IT.STOOL);
place(10, 6, IT.LOW_TABLE);
place(11, 6, IT.CUSHION_CHAIR);
place(9, 7, IT.STOOL);
place(8, 7, IT.PLANT);
place(11, 7, IT.POTTED_BAMBOO);
