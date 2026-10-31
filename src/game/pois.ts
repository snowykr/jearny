// Named places drawn on the minimap and the town map (#40, #66). Pure data + geometry:
// the DOM/canvas overlays only paint what these functions return.
import { BUILDING } from '../contracts';
import type { MapDefinition } from '../contracts';

export interface Poi {
  id: string;
  /** Short on-map label. */
  label: string;
  /** Spoken name for the accessible label. */
  name: string;
  /** Centre in (fractional) tile coordinates. */
  center: [number, number];
  /** Footprint colour (outdoor buildings) or the marker colour (landmarks). */
  color: string;
  /** Building footprint: top-left tile and size. */
  rect: { x: number; y: number; w: number; h: number };
}

const POI_DEFS: Record<string, { label: string; name: string; color: string }> = {
  [BUILDING.home]: { label: '家', name: '自宅', color: '#d0675a' },
  [BUILDING.station]: { label: '駅', name: '高輪ゲートウェイ駅', color: '#6b92c6' },
  [BUILDING.matsushimaya]: { label: '松島屋', name: '松島屋', color: '#dba04c' },
};

/** POIs placed from the map's building entities. Entities without a definition are not POIs. */
export function poisForMap(map: MapDefinition): Poi[] {
  const out: Poi[] = [];
  for (const e of map.entities) {
    const def = POI_DEFS[e.id];
    if (e.kind !== 'building' || !def) continue;
    const [w, h] = e.size ?? [1, 1];
    out.push({
      id: e.id, ...def, center: [e.tile[0] + w / 2, e.tile[1] + h / 2],
      rect: { x: e.tile[0], y: e.tile[1], w, h },
    });
  }
  return out;
}

/**
 * 泉岳寺 approach, from content/world-plan.json anchors[id=sengakuji_approach].tile.
 * Kept as a constant here (world-plan is planning data, not game content) and pinned by
 * a test: the anchor must match the plan and sit on an authored TEMPLE_PATH tile.
 */
export const TEMPLE_APPROACH_TILE: [number, number] = [34, 24];

/** The 泉岳寺 approach marker; the temple itself is off-map. Null for other scenes. */
export function templeApproach(map: MapDefinition): Poi | null {
  if (map.id !== 'takanawa') return null;
  const [x, y] = TEMPLE_APPROACH_TILE;
  return {
    id: 'landmark:temple-approach',
    label: '泉岳寺',
    name: '泉岳寺（参道）',
    center: [x + 0.5, y + 0.5],
    color: '#b4553c',
    rect: { x, y, w: 1, h: 1 },
  };
}

/** Every place the overlays draw: building POIs plus the 泉岳寺 approach landmark. */
export function allPois(map: MapDefinition): Poi[] {
  const temple = templeApproach(map);
  return temple ? [...poisForMap(map), temple] : poisForMap(map);
}

/** Nearest POI to a tile, by distance to its footprint centre (in tiles). */
export function nearestPoi(pois: readonly Poi[], tile: readonly [number, number]): { poi: Poi; distance: number } | null {
  let best: { poi: Poi; distance: number } | null = null;
  for (const poi of pois) {
    const d = Math.hypot(poi.center[0] - tile[0], poi.center[1] - tile[1]);
    if (!best || d < best.distance) best = { poi, distance: d };
  }
  return best;
}
