// Track A owns src/content/maps/. PLACEHOLDER: gray-box board that satisfies
// MapDefinition until the authored takanawa map lands (docs/WORKSPLIT.md, M1).
import type { MapDefinition, Tile } from '../../contracts';
import { ENTITY, PORTAL, SPAWN } from '../../contracts/ids';

const GRID: Tile = [12, 9];
const [COLS, ROWS] = GRID;

const fill = (value: number): number[] => Array.from({ length: COLS * ROWS }, () => value);

/** Blocked border plus one pillar, so collision and camera clamping are visible. */
function buildCollision(): number[] {
  const cells = fill(0);
  for (let x = 0; x < COLS; x++) {
    cells[x] = 1;
    cells[(ROWS - 1) * COLS + x] = 1;
  }
  for (let y = 0; y < ROWS; y++) {
    cells[y * COLS] = 1;
    cells[y * COLS + COLS - 1] = 1;
  }
  cells[4 * COLS + 6] = 1;
  cells[4 * COLS + 5] = 1;
  return cells;
}

export const placeholderMap: MapDefinition = {
  id: 'takanawa',
  tileSize: 16,
  grid: GRID,
  layers: { ground: fill(0), decoration: fill(-1), roof: fill(-1) },
  collision: buildCollision(),
  spawns: {
    [SPAWN.start]: [2, 2],
    [SPAWN.entry]: [2, 2],
    [SPAWN.homeDoor]: [2, 6],
    [SPAWN.shopDoor]: [9, 6],
    [SPAWN.stationDeck]: [5, 3],
    [SPAWN.plaza]: [6, 6],
  },
  portals: [
    { id: PORTAL.homeDoor, tile: [2, 6], toScene: 'home-interior', toSpawn: SPAWN.entry },
    { id: PORTAL.shopDoor, tile: [9, 6], toScene: 'shop-interior', toSpawn: SPAWN.entry },
  ],
  entities: [
    { id: ENTITY.guide, kind: 'npc', tile: [3, 3], facing: 'down' },
    { id: ENTITY.stationZone, kind: 'zone', tile: [5, 3], size: [2, 2] },
  ],
};
