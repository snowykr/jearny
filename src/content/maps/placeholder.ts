// Track A owns src/content/maps/. PLACEHOLDER: a walled 30x20 room so the
// engine boots. Replace with the authored takanawa / interior maps.
import type { MapDefinition } from '../../contracts';

const cols = 30;
const rows = 20;
const collision = Array.from({ length: cols * rows }, (_, i) => {
  const x = i % cols;
  const y = Math.floor(i / cols);
  return x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 1 : 0;
});

export const placeholderMap: MapDefinition = {
  id: 'home-interior',
  tileSize: 16,
  grid: [cols, rows],
  layers: { ground: Array(cols * rows).fill(0), decoration: Array(cols * rows).fill(-1), roof: Array(cols * rows).fill(-1) },
  collision,
  spawns: { start: [5, 5] },
  portals: [],
  entities: [],
};
