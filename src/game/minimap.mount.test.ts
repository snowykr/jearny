// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '../domain';
import { mountMinimap } from './minimap';

type Ctx = CanvasRenderingContext2D;

const strokes: string[] = [];
const calls: string[] = [];
let frame: FrameRequestCallback | null = null;

function recordingContext(canvas: HTMLCanvasElement): Ctx {
  const state: Record<string | symbol, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 24 });
      if (prop === 'canvas') return canvas;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(String(prop));
        if (prop === 'strokeText' && typeof args[0] === 'string') strokes.push(args[0]);
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as Ctx;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;

class StubImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

function mount(ctxFor: (canvas: HTMLCanvasElement) => Ctx | null = recordingContext) {
  vi.stubGlobal('ImageData', StubImageData);
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    return ctxFor(this);
  } as typeof originalGetContext;
  const root = document.createElement('div');
  document.body.append(root);
  frame = null;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frame = cb;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const unmount = mountMinimap(root, {
    getPlayer: () => ({ sceneId: 'takanawa', tile: [64, 48], facing: 'up' }),
    getSnapshot: () => createInitialSnapshot('minimap-test', 'test'),
  });
  const step = () => {
    const cb = frame;
    frame = null;
    cb?.(1000);
  };
  return { root, unmount, step };
}

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  document.body.innerHTML = '';
  strokes.length = 0;
  calls.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('minimap mount', () => {
  it('sizes the canvas, labels the location and draws the POIs', () => {
    const { root, step, unmount } = mount();
    step();

    const canvas = root.querySelector('canvas') as HTMLCanvasElement;
    // jsdom reports 1024px wide; minimapWidth caps the outdoor map at 200px.
    expect(canvas.style.width).toBe('200px');
    expect(root.querySelector('.jr-minimap-label')?.textContent).toBe('高輪ゲートウェイ周辺');
    expect(canvas.getAttribute('aria-label')).toContain('ミニマップ');
    expect(calls).toContain('drawImage');
    expect(strokes).toContain('泉岳寺');
    unmount();
  });

  it('toggles the panel and reports it through aria-expanded', () => {
    const { root, unmount } = mount();
    const toggle = root.querySelector('.jr-minimap-toggle') as HTMLButtonElement;
    const panel = root.querySelector('.jr-minimap-panel') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(panel.hidden).toBe(false);
    unmount();
  });

  it('keeps the DOM usable when 2D is unavailable', () => {
    const { root, unmount } = mount(() => null);
    expect(root.querySelector('.jr-minimap-label')?.textContent).toBe('高輪ゲートウェイ周辺');
    expect(root.querySelector('.jr-minimap-toggle')).not.toBeNull();
    expect(() => unmount()).not.toThrow();
  });
});
