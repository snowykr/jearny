import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W, cameraCenter, visibleTiles } from './camera';

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
});
