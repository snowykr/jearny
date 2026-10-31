import { describe, expect, it } from 'vitest';
import { BUILDING } from '../contracts';
import { maps } from '../content/maps';
import { VIEW_H, VIEW_W, buildingRects, cameraCenter, sceneCamera, visibleTiles } from './camera';
import { playerDrawPixel } from './player';
import type { PlayerState } from './player';

describe('camera', () => {
  const big: [number, number] = [128 * 16, 96 * 16];

  it('follows the player in the middle of a big map', () => {
    expect(cameraCenter([1000, 700], big)).toEqual([1000, 700]);
  });

  it('clamps to the map bounds', () => {
    expect(cameraCenter([0, 0], big)).toEqual([VIEW_W / 2, VIEW_H / 2]);
    expect(cameraCenter([5000, 5000], big)).toEqual([big[0] - VIEW_W / 2, big[1] - VIEW_H / 2]);
  });

  it('centres maps smaller than the viewport', () => {
    expect(cameraCenter([10, 10], [160, 96])).toEqual([80, 48]);
  });

  it('only visits a viewport-sized window of tiles', () => {
    const v = visibleTiles([1000, 700], [128, 96], 16);
    expect((v.x1 - v.x0) * (v.y1 - v.y0)).toBeLessThanOrEqual(17 * 12);
    expect(visibleTiles([0, 0], [128, 96], 16)).toMatchObject({ x0: 0, y0: 0 });
  });

  describe('sceneCamera', () => {
    const tk = maps.takanawa;
    const tl = (tile: [number, number]): [number, number] => [tile[0] * 16, tile[1] * 16];
    const top = (c: [number, number]) => c[1] - VIEW_H / 2;
    const station = buildingRects(tk).find((r) => r.x1 - r.x0 === 192)!;

    it('finds the station sprite rect: 192×128, bottom-aligned to its foot row', () => {
      expect(station).toEqual({ x0: 58 * 16, y0: 40 * 16, x1: 58 * 16 + 192, y1: 48 * 16 });
    });

    it('shows the whole station roof at the station-deck spawn while the player stays on screen', () => {
      const p = tl(tk.spawns['station-deck']!);
      const c = sceneCamera(tk, p);
      expect(top(c)).toBeLessThanOrEqual(station.y0 + 31); // first opaque row of the current station art
      expect(p[1] + 16).toBeLessThanOrEqual(top(c) + VIEW_H); // feet inside the view
      expect(top(c)).toBeLessThan(cameraCenter([p[0] + 8, p[1] + 8], [128 * 16, 96 * 16])[1] - VIEW_H / 2);
    });

    it('does not lift when far from any building and matches the plain follow camera', () => {
      const p = tl([100, 70]);
      expect(sceneCamera(tk, p)).toEqual(cameraCenter([p[0] + 8, p[1] + 8], [128 * 16, 96 * 16]));
    });

    it('eases in: camera top moves less than 2 tiles per tile walked toward the station (no pop)', () => {
      let prev = top(sceneCamera(tk, tl([64, 70])));
      for (let ty = 69; ty >= 50; ty--) {
        const t = top(sceneCamera(tk, tl([64, ty])));
        expect(Math.abs(t - prev)).toBeLessThanOrEqual(32);
        prev = t;
      }
    });

    it('stays inside the map and on integer pixels', () => {
      for (const tile of [[0, 0], [127, 95], [64, 49], [18, 41]] as [number, number][]) {
        const [cx, cy] = sceneCamera(tk, tl(tile));
        expect(Number.isInteger(cx) && Number.isInteger(cy)).toBe(true);
        expect(cy - VIEW_H / 2).toBeGreaterThanOrEqual(0);
        expect(cy + VIEW_H / 2).toBeLessThanOrEqual(96 * 16);
      }
    });

    it('keeps the home building in view from its door', () => {
      const home = buildingRects(tk).find((r) => r.x1 - r.x0 === 80 && r.y1 - r.y0 === 96)!;
      expect(top(sceneCamera(tk, tl(tk.spawns['home-door']!)))).toBeLessThanOrEqual(home.y0);
    });

    it('marks the collision rect when a building has no sprite yet', () => {
      const missing = {
        ...maps.takanawa,
        entities: [{ id: BUILDING.home, kind: 'building' as const, tile: [3, 4] as [number, number], size: [2, 3] as [number, number], footRow: 9, assetId: 'not-exported' }],
      };
      expect(buildingRects(missing)).toEqual([{ x0: 48, y0: 64, x1: 80, y1: 112 }]);
    });

    it('keeps interiors that fit the view centred', () => {
      const small = { ...maps['home-interior'], grid: [14, 9] as [number, number] };
      expect(sceneCamera(small, [16, 16])).toEqual([112, 72]);
    });

    it('never scrolls indoors: every room camera is the room centre (#78)', () => {
      for (const id of ['home-interior', 'home-2f', 'shop-interior'] as const) {
        const map = maps[id];
        const [cols, rows] = map.grid;
        const centre: [number, number] = [(cols * 16) / 2, (rows * 16) / 2];
        expect(sceneCamera(map, [0, 0])).toEqual(centre);
        expect(sceneCamera(map, [cols * 16 - 16, rows * 16 - 16])).toEqual(centre);
      }
    });
  });

  it('playerDrawPixel rounds the tween so camera and sprite agree', () => {
    const p = { tile: [3, 3], facing: 'right', to: [4, 3], progress: 0.3, parity: 0, turnTimer: 0 } as PlayerState;
    const [x, y] = playerDrawPixel(p, 16);
    expect([x, y]).toEqual([53, 48]); // 3*16 + 0.3*16 = 52.8
  });
});
