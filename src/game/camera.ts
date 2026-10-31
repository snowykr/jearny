// Logical viewport and camera clamping. Pure, so it is unit-testable without KAPLAY.
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
