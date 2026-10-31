// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { maps } from '../content/maps';
import { createInitialSnapshot } from '../domain';
import { content } from '../content';
import { entranceFor, mountTownMap, townMapFrame, townMapLegend, TOWN_SCALE } from './townmap';
import type { TownMap, TownMapPlayer } from './townmap';

const town = maps.takanawa;
let mounted: TownMap | null = null;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | null = null;

interface Op { op: string; args: unknown[] }

/** Records canvas calls so the paint paths can be asserted without a real backend. */
function recordingContext(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const rec = (op: string) => (...args: unknown[]) => {
    ops.push({ op, args });
  };
  const ctx = {
    measureText: (text: string) => ({ width: text.length * 6 }),
    putImageData: rec('putImageData'),
    clearRect: rec('clearRect'),
    drawImage: rec('drawImage'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    rect: rec('rect'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    strokeText: rec('strokeText'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function stubCanvas(ops: { ctx: CanvasRenderingContext2D }): void {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => ops.ctx) as unknown as typeof originalGetContext;
  // jsdom has no ImageData; the base-image path constructs it before putImageData.
  vi.stubGlobal('ImageData', class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  });
}

function player(overrides: Partial<TownMapPlayer> = {}): TownMapPlayer {
  return { sceneId: 'takanawa', tile: [64, 48], facing: 'up', ...overrides };
}

function texts(ops: Op[]): string[] {
  return ops.filter((o) => o.op === 'fillText' || o.op === 'strokeText').map((o) => String(o.args[0]));
}

function mountWith(getPlayer: () => TownMapPlayer | null) {
  mounted = mountTownMap(document, {
    getPlayer,
    getSnapshot: () => createInitialSnapshot('townmap-test', content.version),
  });
  document.body.append(mounted.el);
  return mounted;
}

afterEach(() => {
  mounted?.dispose();
  mounted = null;
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    originalGetContext = null;
  }
  vi.unstubAllGlobals();
});

describe('town map geometry', () => {
  it('draws the authored map at 3 px per tile', () => {
    expect(townMapFrame(town)).toMatchObject({ w: 128 * TOWN_SCALE, h: 96 * TOWN_SCALE, scale: 3 });
    expect(TOWN_SCALE).toBe(3);
  });

  it('maps an interior back to the outdoor door that leads into it', () => {
    expect(entranceFor(town, 'home-interior')).toEqual([17, 40]);
    expect(entranceFor(town, 'shop-interior')).toEqual([17, 16]);
    expect(entranceFor(maps['home-interior'], 'takanawa')).toEqual([6, 8]);
    expect(entranceFor(town, 'home-2f')).toEqual([17, 40]); // via the 1F door
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
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    mountWith(() => player());

    const panel = document.querySelector<HTMLElement>('[data-testid="town-map"]');
    expect(panel).not.toBeNull();
    const canvas = panel?.querySelector('canvas');
    expect(canvas?.width).toBe(384);
    expect(canvas?.height).toBe(288);
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(panel?.querySelectorAll('.jr-townmap-legend li')).toHaveLength(6); // 4 places + you + quest
    expect(panel?.querySelectorAll('.jr-townmap-legend [data-symbol]')).toHaveLength(2);
    expect(panel?.textContent).toContain('松島屋');
    expect(panel?.textContent).toContain('泉岳寺');
    expect(panel?.textContent).toContain('白い矢印');
    expect(panel?.textContent).toContain('メニュー');

    mounted?.refresh(); // repaint with the current pose is safe to call twice
  });

  it('paints the facing arrow at the player tile and rings the quest target', () => {
    const { ctx, ops } = recordingContext();
    stubCanvas({ ctx });
    mountWith(() => player({ tile: [64, 48], facing: 'up' }));

    // 3 px/tile: tile 64.5 -> 193.5 px, 48.5 -> 145.5 px; facing up points 11 px north.
    const lines = ops.filter((o) => o.op === 'lineTo').map((o) => o.args);
    expect(lines).toContainEqual([193.5, 134.5]);
    const rings = ops.filter((o) => o.op === 'arc' && o.args[2] === 12);
    expect(rings).toHaveLength(1); // the home quest target, [17.5, 37] -> [52.5, 111]
    expect(rings[0]?.args.slice(0, 2)).toEqual([52.5, 111]);
    expect(texts(ops)).toContain('泉岳寺');
  });

  it('labels the door by scene: home is not a shop', () => {
    for (const [sceneId, label] of [
      ['home-interior', '自宅の中'],
      ['home-2f', '自宅 2Fの中'],
      ['shop-interior', '松島屋の中'],
    ] as const) {
      const { ctx, ops } = recordingContext();
      stubCanvas({ ctx });
      mounted?.dispose();
      mounted = null;
      mountWith(() => player({ sceneId, tile: [8, 9] }));
      expect(texts(ops)).toContain(label);
      // Home door [17,40] -> [52.5, 121.5]; shop door [17,16] -> [52.5, 51].
      const dot = ops.filter((o) => o.op === 'arc' && o.args[2] === 5);
      expect(dot).toHaveLength(1);
      expect(dot[0]?.args[0]).toBe(52.5);
      HTMLCanvasElement.prototype.getContext = originalGetContext as typeof HTMLCanvasElement.prototype.getContext;
    }
  });

  it('never leaves a marker or a style tag behind after dispose', () => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    mountWith(() => null);
    const el = mounted?.el as HTMLElement;
    expect(document.querySelector('style[data-jr-townmap]')).not.toBeNull();
    mounted?.dispose();
    mounted = null;
    expect(el.isConnected).toBe(false);
    expect(document.querySelector('[data-testid="town-map"]')).toBeNull();
    expect(document.querySelector('style[data-jr-townmap]')).toBeNull();
  });
});
