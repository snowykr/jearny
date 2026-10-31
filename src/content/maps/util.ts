// Helpers for authoring maps. Rows are [cols * rows] arrays, row-major.
import type { EntityAnchor, MapDefinition, Portal, SceneId, Tile } from '../../contracts';

export const idx = (cols: number, x: number, y: number) => y * cols + x;

/** Walled rectangular room filled with `floor`; used by placeholders and interiors. */
export function makeRoom(opts: {
  id: SceneId;
  grid: Tile;
  floor: number;
  wall?: number;
  spawns: Record<string, Tile>;
  portals?: Portal[];
  entities?: EntityAnchor[];
}): MapDefinition {
  const [cols, rows] = opts.grid;
  const n = cols * rows;
  const ground = Array<number>(n).fill(opts.floor);
  const collision = Array<number>(n).fill(0);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        collision[idx(cols, x, y)] = 1;
        if (opts.wall !== undefined) ground[idx(cols, x, y)] = opts.wall;
      }
  // Portals sit in the wall; open them.
  for (const p of opts.portals ?? []) collision[idx(cols, p.tile[0], p.tile[1])] = 0;
  return {
    id: opts.id,
    tileSize: 16,
    grid: opts.grid,
    layers: { ground, decoration: Array<number>(n).fill(-1), roof: Array<number>(n).fill(-1) },
    collision,
    spawns: opts.spawns,
    portals: opts.portals ?? [],
    entities: opts.entities ?? [],
  };
}
