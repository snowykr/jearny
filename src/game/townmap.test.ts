// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { maps } from '../content/maps';
import { createInitialSnapshot } from '../domain';
import { content } from '../content';
import { entranceFor, mountTownMap, townMapFrame, townMapLegend, TOWN_SCALE } from './townmap';
import type { TownMap } from './townmap';

const town = maps.takanawa;
let mounted: TownMap | null = null;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | null = null;

afterEach(() => {
  mounted?.dispose();
  mounted = null;
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    originalGetContext = null;
  }
});

describe('town map geometry', () => {
  it('draws the authored map at 3 px per tile', () => {
    expect(townMapFrame(town)).toMatchObject({ w: 128 * TOWN_SCALE, h: 96 * TOWN_SCALE, scale: 3 });
    expect(TOWN_SCALE).toBe(3);
  });

  it('maps an interior back to the outdoor door that leads into it', () => {
    expect(entranceFor(town, 'home-interior')).toEqual([17, 40]);
    expect(entranceFor(town, 'shop-interior')).toEqual([17, 16]);
    expect(entranceFor(maps['home-interior'], 'takanawa')).toEqual([8, 11]);
  });

  it('legends every place, 泉岳寺 included', () => {
    expect(townMapLegend(town).map((p) => p.name)).toEqual([
      '高輪ゲートウェイ駅', '自宅', '松島屋', '泉岳寺（参道）',
    ]);
  });
});

describe('town map panel', () => {
  it('mounts a framed canvas, the legend and the how-to note', () => {
    // jsdom has no canvas backend; the panel must still build without throwing.
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof originalGetContext;

    const player = { sceneId: 'takanawa' as const, tile: [64, 48] as [number, number], facing: 'up' as const };
    mounted = mountTownMap(document, {
      getPlayer: () => player,
      getSnapshot: () => createInitialSnapshot('townmap-test', content.version),
    });
    document.body.append(mounted.el);

    const panel = document.querySelector<HTMLElement>('[data-testid="town-map"]');
    expect(panel).not.toBeNull();
    const canvas = panel?.querySelector('canvas');
    expect(canvas?.width).toBe(128 * TOWN_SCALE);
    expect(canvas?.height).toBe(96 * TOWN_SCALE);
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(panel?.querySelectorAll('.jr-townmap-legend li')).toHaveLength(4);
    expect(panel?.textContent).toContain('松島屋');
    expect(panel?.textContent).toContain('泉岳寺');
    expect(panel?.textContent).toContain('赤い矢印');

    mounted.refresh(); // repaint with the current pose is safe to call twice
  });

  it('removes its own style tag on dispose', () => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof originalGetContext;
    mounted = mountTownMap(document, {
      getPlayer: () => null,
      getSnapshot: () => createInitialSnapshot('townmap-test', content.version),
    });
    document.body.append(mounted.el);
    expect(document.querySelector('style[data-jr-townmap]')).not.toBeNull();
    mounted.dispose();
    expect(document.querySelector('style[data-jr-townmap]')).toBeNull();
    mounted = null;
  });
});
