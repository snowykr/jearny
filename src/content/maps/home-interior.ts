import { ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

const COLS = 13;
const ROWS = 9;

// Home 1F: genkan + kitchen/dining + living room, all on one 13x9 screen (#78).
// The camera never scrolls indoors; the room is centred in the 240x160 viewport.
//
//   y0   cap row
//   y1   wall face: windows, clock, picture, shoji; the stairs sit at x10
//   y2   kitchen run along the back wall (left), TV corner (right)
//   y3-6 living area; the guide waits at [4,4]
//   y7   genkan step with the shoe rack; entry spawn
//   y8   front wall with the door mat at x6
//
// One floor type (wood); the rug is an accent under the kotatsu. Stairs use the
// existing step tile until the dedicated stair tile from #79 lands.
export const homeInterior: MapDefinition = makeRoom({
  id: 'home-interior',
  grid: [COLS, ROWS],
  floor: IT.WOOD_FLOOR,
  wall: IT.WALL_TOP,
  spawns: { [SPAWN.start]: [6, 5], [SPAWN.entry]: [6, 7], [SPAWN.stairs]: [10, 3] },
  portals: [
    { id: PORTAL.homeExit, tile: [6, 8], toScene: 'takanawa', toSpawn: SPAWN.homeDoor },
    { id: PORTAL.homeStairsUp, tile: [10, 2], toScene: 'home-2f', toSpawn: SPAWN.stairs },
  ],
  entities: [{ id: ENTITY.guide, kind: 'npc', tile: [4, 4], facing: 'down' }],
});

const { ground, decoration } = homeInterior.layers;
const { collision } = homeInterior;

const fill = (x0: number, y0: number, x1: number, y1: number, tile: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[idx(COLS, x, y)] = tile;
};
/** Wall-mounted piece: drawn over the (already blocked) wall face. */
const hang = (x: number, y: number, tile: number) => {
  decoration[idx(COLS, x, y)] = tile;
};
/** Floor-standing furniture; blocks unless `solid` is false (cushions). */
const place = (x: number, y: number, tile: number, solid = true) => {
  decoration[idx(COLS, x, y)] = tile;
  collision[idx(COLS, x, y)] = solid ? 1 : 0;
};

// ---- walls -----------------------------------------------------------------
fill(1, 1, 11, 1, IT.WALL);
for (let x = 1; x <= 11; x++) collision[idx(COLS, x, 1)] = 1;
fill(1, 8, 11, 8, IT.WALL_BASE);

// Wall hangings.
hang(2, 1, IT.WINDOW_CURTAIN);
hang(6, 1, IT.WALL_CLOCK);
hang(9, 1, IT.PICTURE_FRAME);
hang(11, 1, IT.WALL_SHOJI);

// ---- kitchen (back wall) ----------------------------------------------------
place(1, 2, IT.FRIDGE);
place(2, 2, IT.KITCHEN_COUNTER);
place(3, 2, IT.SINK);
place(4, 2, IT.STOVE);
place(2, 5, IT.LOW_TABLE);
place(3, 5, IT.LOW_TABLE);
place(2, 6, IT.ZABUTON, false);
place(3, 6, IT.ZABUTON, false);

// ---- living room ------------------------------------------------------------
fill(7, 4, 9, 5, IT.RUG);
place(7, 4, IT.KOTATSU_L);
place(8, 4, IT.KOTATSU_R);
place(7, 5, IT.ZABUTON, false);
place(8, 5, IT.ZABUTON, false);
place(1, 5, IT.BOOKSHELF);
place(11, 2, IT.TV_STAND);
place(11, 3, IT.BOOKSHELF);
place(1, 3, IT.PLANT);
place(1, 6, IT.FLOOR_LAMP);
place(11, 6, IT.PLANT);

// ---- genkan + front wall ----------------------------------------------------
fill(5, 7, 7, 7, IT.GENKAN_STEP);
ground[idx(COLS, 6, 8)] = IT.DOOR_MAT;
place(4, 7, IT.SHOE_RACK);
place(8, 7, IT.UMBRELLA_STAND);

// Stairs up (top-right corner). Ground step tile; the portal is opened by makeRoom.
ground[idx(COLS, 10, 2)] = IT.GENKAN_STEP;

