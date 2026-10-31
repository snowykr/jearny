import { PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { IT } from './tiles';
import { idx, makeRoom } from './util';

const COLS = 11;
const ROWS = 8;

// The player's bedroom on 2F, one 11x8 screen (#78). Reached only by the stairs,
// so there is no outdoor portal and no bottom exit: the stairs in the top-right
// corner are the only door.
//
//   y0   cap row
//   y1   wall face with a window, clock and picture; the stairs sit at x8
//   y2-6 tatami room: futon against the left wall, low table, shelf, lamp
//   y7   side/front wall (solid)
//
// Stairs use the existing step tile until the dedicated stair tile from #79 lands.
export const home2f: MapDefinition = makeRoom({
  id: 'home-2f',
  grid: [COLS, ROWS],
  floor: IT.TATAMI,
  wall: IT.WALL_TOP,
  spawns: { [SPAWN.stairs]: [8, 2] },
  portals: [{ id: PORTAL.homeStairsDown, tile: [8, 1], toScene: 'home-interior', toSpawn: SPAWN.stairs }],
});

const { ground, decoration } = home2f.layers;
const { collision } = home2f;

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
fill(1, 1, 9, 1, IT.WALL);
for (let x = 1; x <= 9; x++) collision[idx(COLS, x, 1)] = 1;
fill(1, 7, 9, 7, IT.WALL_BASE);

// Stairs down: open the wall-face cell and mark it with the step tile.
ground[idx(COLS, 8, 1)] = IT.FLOOR_WOOD_DARK; // recessed stairwell until #79's tile is wired
collision[idx(COLS, 8, 1)] = 0;

// Wall hangings.
hang(3, 1, IT.WINDOW_CURTAIN);
hang(5, 1, IT.WALL_CLOCK);
hang(6, 1, IT.PICTURE_FRAME);

// ---- bedroom ---------------------------------------------------------------
place(1, 2, IT.FUTON);
place(1, 3, IT.FUTON);
place(1, 5, IT.BOOKSHELF);
place(1, 6, IT.PLANT);
fill(3, 3, 5, 4, IT.RUG);
place(3, 3, IT.LOW_TABLE);
place(5, 3, IT.CUSHION_CHAIR);
place(3, 4, IT.ZABUTON, false);
place(9, 2, IT.FLOOR_LAMP);
place(9, 4, IT.TV_STAND);
place(9, 6, IT.PLANT);
