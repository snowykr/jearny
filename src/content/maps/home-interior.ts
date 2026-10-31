import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

const COLS = 16;
const ROWS = 12;

// A cosy one-room flat, seen from above. Interior is x 1..14, y 1..10.
//
//   y0   cap row (tokonoma alcove x7..9 shows the back wall instead)
//   y1   wall face: window over the sink, clock, curtains, shoji; the alcove is walkable
//   y2-5 dark-wood kitchen/dining corner (left), tatami living room with rug + kotatsu (right)
//   y6-9 wood hall, folded futon, bookshelves
//   y9-10 genkan: raised step (y9) then packed-earth entrance with shoe rack and umbrellas
//
// Convention: `ground` holds opaque floor/wall tiles; `decoration` holds wall hangings and furniture.
// Only the exit portal [8,11], `entry` [8,10], `start` [8,6] and the guide [5,4] are contractual,
// and the x=8 column stays open from the alcove (y1) down to the door.
export const homeInterior: MapDefinition = makeRoom({
  id: 'home-interior',
  grid: [COLS, ROWS],
  floor: IT.WOOD_FLOOR,
  wall: IT.WALL_TOP,
  spawns: { [SPAWN.start]: [8, 6], [SPAWN.entry]: [8, 10] },
  portals: [{ id: PORTAL.homeExit, tile: [8, 11], toScene: 'takanawa', toSpawn: SPAWN.homeDoor }],
  entities: [{ id: ENTITY.guide, kind: 'npc', tile: [5, 4], facing: 'down' }],
});

const { ground, decoration } = homeInterior.layers;
const { collision } = homeInterior;

const fill = (x0: number, y0: number, x1: number, y1: number, tile: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[idx(COLS, x, y)] = tile;
};
/** Wall-mounted or wall-height piece: drawn on the decoration layer over the (blocked) wall. */
const hang = (x: number, y: number, tile: number) => {
  decoration[idx(COLS, x, y)] = tile;
};
/** Floor-standing furniture; blocks unless `solid` is false (cushions). */
const place = (x: number, y: number, tile: number, solid = true) => {
  decoration[idx(COLS, x, y)] = tile;
  collision[idx(COLS, x, y)] = solid ? 1 : 0;
};

// ---- walls -----------------------------------------------------------------
// Top: cap row (already WALL_TOP from makeRoom) + a wall-face row. Sides keep the cap tile.
fill(1, 1, 14, 1, IT.WALL);
for (let x = 1; x <= 14; x++) collision[idx(COLS, x, 1)] = 1;
// Skirting line along the front wall (the exit tile is re-set below).
fill(1, 11, 14, 11, IT.WALL_BASE);

// Tokonoma alcove: a recessed, walkable bay in the top wall with a hanging scroll on its back wall.
fill(7, 0, 9, 0, IT.WALL);
fill(7, 1, 9, 1, IT.FLOOR_WOOD_DARK);
for (let x = 7; x <= 9; x++) collision[idx(COLS, x, 1)] = 0;
hang(8, 0, IT.PICTURE_FRAME);
place(7, 1, IT.FLOOR_LAMP);
place(9, 1, IT.PLANT);

// Wall hangings
hang(3, 1, IT.WINDOW_CURTAIN); // above the sink
hang(5, 1, IT.WALL_CLOCK);
hang(11, 1, IT.WINDOW_CURTAIN);
hang(12, 1, IT.WINDOW_CURTAIN);
hang(13, 1, IT.PICTURE_FRAME);
hang(14, 1, IT.WALL_SHOJI);
hang(10, 1, IT.BOOKSHELF);

// ---- floors ----------------------------------------------------------------
fill(1, 2, 6, 5, IT.FLOOR_WOOD_DARK); // kitchen + dining
fill(7, 2, 14, 8, IT.TATAMI); // living room
fill(9, 4, 13, 7, IT.RUG);
fill(1, 6, 6, 10, IT.WOOD_FLOOR); // hall
fill(7, 9, 14, 10, IT.WOOD_FLOOR);
// Genkan: step up at y9, then the packed-earth entrance.
fill(6, 9, 10, 9, IT.GENKAN_STEP);
fill(6, 10, 10, 10, IT.DOMA_STONE);
fill(7, 10, 9, 10, IT.GENKAN);
ground[idx(COLS, 8, 11)] = IT.DOOR_MAT;

// ---- kitchen + dining --------------------------------------------------------
place(1, 2, IT.FRIDGE);
place(2, 2, IT.KITCHEN_COUNTER);
place(3, 2, IT.SINK);
place(4, 2, IT.STOVE);
place(5, 2, IT.KITCHEN_COUNTER);
place(6, 2, IT.PLANT);
place(3, 4, IT.LOW_TABLE);
place(4, 4, IT.LOW_TABLE);
place(3, 5, IT.ZABUTON, false);
place(4, 5, IT.ZABUTON, false);

// ---- living room -------------------------------------------------------------
place(13, 2, IT.TV_STAND);
place(14, 2, IT.FLOOR_LAMP);
place(10, 5, IT.KOTATSU_L);
place(11, 5, IT.KOTATSU_R);
place(9, 5, IT.ZABUTON, false);
place(12, 5, IT.ZABUTON, false);
place(10, 6, IT.ZABUTON, false);
place(11, 6, IT.ZABUTON, false);
place(14, 7, IT.FUTON);
place(14, 8, IT.FUTON);

// ---- hall + entrance ---------------------------------------------------------
place(1, 7, IT.BOOKSHELF);
place(1, 8, IT.BOOKSHELF);
place(1, 9, IT.PLANT);
place(6, 7, IT.FLOOR_LAMP);
place(6, 10, IT.SHOE_RACK);
place(10, 10, IT.UMBRELLA_STAND);
place(14, 10, IT.PLANT);
