// Logical viewport and camera clamping. Pure, so it is unit-testable without KAPLAY.
import type { MapDefinition } from '../contracts';
import { ASSETS } from './assets';

export const VIEW_W = 240;
export const VIEW_H = 160;

const axis = (p: number, size: number, view: number) =>
  size <= view ? size / 2 : Math.min(Math.max(p, view / 2), size - view / 2);

/** Camera centre (integer pixels): follows `focus`, clamped to the map; small maps are centred. */
export function cameraCenter(focus: [number, number], mapPx: [number, number]): [number, number] {
  return [Math.round(axis(focus[0], mapPx[0], VIEW_W)), Math.round(axis(focus[1], mapPx[1], VIEW_H))];
}

/** Inclusive-exclusive tile range visible from `cam`, clamped to the grid. */
export function visibleTiles(cam: [number, number], grid: [number, number], ts: number) {
  return {
    x0: Math.max(0, Math.floor((cam[0] - VIEW_W / 2) / ts)),
    y0: Math.max(0, Math.floor((cam[1] - VIEW_H / 2) / ts)),
    x1: Math.min(grid[0], Math.ceil((cam[0] + VIEW_W / 2) / ts)),
    y1: Math.min(grid[1], Math.ceil((cam[1] + VIEW_H / 2) / ts)),
  };
}

/** Pixel rectangle (x0,y0 inclusive; x1,y1 exclusive). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where each building sprite is drawn: bottom-aligned to its footprint, centred horizontally. */
export function buildingRects(map: MapDefinition): Rect[] {
  const ts = map.tileSize;
  const dims = ASSETS.buildings as Record<string, readonly [number, number]>;
  const rects: Rect[] = [];
  for (const e of map.entities) {
    if (e.kind !== 'building') continue;
    const [w, h] = e.size ?? [1, 1];
    const [sw, sh] = (e.assetId && dims[e.assetId]) || [w * ts, h * ts];
    const cx = e.tile[0] * ts + (w * ts) / 2;
    const bottom = (e.tile[1] + h) * ts;
    rects.push({ x0: cx - sw / 2, y0: bottom - sh, x1: cx + sw / 2, y1: bottom });
  }
  return rects;
}

/** Margins around a tall building the camera tries to show, in pixels. */
const TOP_MARGIN = 8;
const FOOT_MARGIN = 6;
/** The lift is full strength this close to a building and fades to nothing over the next stretch (no camera pops). */
const NEAR_Y = 48;
const FADE_Y = 96;
const NEAR_X = 24;
const FADE_X = 48;

const ramp = (v: number, full: number, fade: number) => 1 - Math.min(Math.max((v - full) / fade, 0), 1);

/**
 * Top edge of the view. Starts from `baseTop` (the plain follow camera) and, near a building
 * that is taller than the view leaves room for, lifts the view so the building's top is
 * visible while the player's feet stay on screen. Never moves the view down.
 */
export function liftForBuildings(baseTop: number, playerTopLeft: [number, number], ts: number, rects: readonly Rect[]): number {
  const [px, py] = playerTopLeft;
  const cx = px + ts / 2;
  const feet = py + ts;
  let top = baseTop;
  for (const r of rects) {
    const wy = ramp(py - r.y1, NEAR_Y, FADE_Y);
    const wx = ramp(Math.max(r.x0 - cx, cx - r.x1, 0), NEAR_X, FADE_X);
    const w = wy * wx;
    if (w <= 0) continue;
    const want = Math.max(r.y0 - TOP_MARGIN, feet + FOOT_MARGIN - VIEW_H);
    if (want < top) top += w * (want - top);
  }
  return top;
}

/** Camera centre for a scene: follows the player (integer `playerTopLeft`), keeps tall buildings in view, clamps to the map. */
export function sceneCamera(map: MapDefinition, playerTopLeft: [number, number]): [number, number] {
  const ts = map.tileSize;
  const mapPx: [number, number] = [map.grid[0] * ts, map.grid[1] * ts];
  const [cx, cy] = cameraCenter([playerTopLeft[0] + ts / 2, playerTopLeft[1] + ts / 2], mapPx);
  if (mapPx[1] <= VIEW_H) return [cx, cy];
  const top = liftForBuildings(cy - VIEW_H / 2, playerTopLeft, ts, buildingRects(map));
  const clamped = Math.min(Math.max(top, 0), mapPx[1] - VIEW_H);
  return [cx, Math.round(clamped + VIEW_H / 2)];
}
