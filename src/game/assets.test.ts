import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KAPLAYCtx } from 'kaplay';
import {
  applyAlphaThreshold,
  assertAspect,
  buildPalette,
  countColors,
  cropImage,
  makeImage,
  processImage,
  quantize,
  resizeNearest,
  runtimeSizeFor,
  type AssetMeta,
  type RgbaImage,
} from '../../tools/art/lib.mjs';
import {
  ASSETS, DEFAULT_CELL, cellSizeOfSheet, characterCell, hasAsset, loadAssets, placeholderComps, spriteOrPlaceholder, spriteUrl,
} from './assets';

/** Deterministic pseudo-random RGBA image (LCG) so tests need no fixtures. */
function noise(w: number, h: number, seed = 1, alphaLevels = [0, 60, 127, 128, 200, 255]): RgbaImage {
  const img = makeImage(w, h);
  let s = seed;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = next() >>> 24;
    img.data[i * 4 + 1] = next() >>> 24;
    img.data[i * 4 + 2] = next() >>> 24;
    img.data[i * 4 + 3] = alphaLevels[next() % alphaLevels.length]!;
  }
  return img;
}

const bytes = (img: RgbaImage) => Array.from(img.data).join(',');

describe('export helpers', () => {
  it('resizeNearest is deterministic and only reuses source pixels', () => {
    const src = noise(48, 32);
    const a = resizeNearest(src, 12, 8);
    const b = resizeNearest(src, 12, 8);
    expect(a.width).toBe(12);
    expect(a.height).toBe(8);
    expect(bytes(a)).toBe(bytes(b));
    // 4x down: dest (0,0) samples source pixel (2,2).
    expect(Array.from(a.data.slice(0, 4))).toEqual(Array.from(src.data.slice((2 * 48 + 2) * 4, (2 * 48 + 2) * 4 + 4)));
  });

  it('resizeNearest upscales by pixel replication', () => {
    const src = noise(2, 2, 7);
    const up = resizeNearest(src, 4, 4);
    expect(Array.from(up.data.slice(0, 4))).toEqual(Array.from(up.data.slice(4, 8)));
    expect(Array.from(up.data.slice(0, 4))).toEqual(Array.from(src.data.slice(0, 4)));
  });

  it('applyAlphaThreshold yields only 0 or 255 and clears hidden RGB', () => {
    const img = applyAlphaThreshold(noise(16, 16));
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      expect([0, 255]).toContain(a);
      if (a === 0) expect([img.data[i], img.data[i + 1], img.data[i + 2]]).toEqual([0, 0, 0]);
    }
    const edge = makeImage(2, 1);
    edge.data.set([10, 20, 30, 127, 10, 20, 30, 128]);
    applyAlphaThreshold(edge);
    expect(Array.from(edge.data)).toEqual([0, 0, 0, 0, 10, 20, 30, 255]);
  });

  it('quantize caps the palette at 24 colours, deterministically', () => {
    const base = applyAlphaThreshold(noise(64, 64, 3));
    expect(countColors(base)).toBeGreaterThan(24);
    const a = quantize(structuredClone(base));
    const b = quantize(structuredClone(base));
    expect(countColors(a)).toBeLessThanOrEqual(24);
    expect(bytes(a)).toBe(bytes(b));
    // Alpha is untouched by quantization.
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(base.data[i]);
  });

  it('quantize leaves images that already fit the palette unchanged', () => {
    const img = makeImage(2, 1);
    img.data.set([1, 2, 3, 255, 200, 100, 50, 255]);
    expect(buildPalette(img)).toHaveLength(2);
    const copy = structuredClone(img);
    expect(bytes(quantize(img))).toBe(bytes(copy));
  });

  it('assertAspect throws past 2% stretch and passes within it', () => {
    expect(() => assertAspect(1536, 1024, 192, 128)).not.toThrow();
    expect(() => assertAspect(1000, 1000, 100, 101)).not.toThrow();
    expect(() => assertAspect(1000, 1000, 100, 103)).toThrow(/stretched/);
    expect(() => assertAspect(1536, 1024, 192, 192)).toThrow(/stretched/);
  });

  it('cropImage copies the rect and rejects out-of-bounds', () => {
    const src = noise(8, 8, 5);
    const c = cropImage(src, [2, 3, 4, 2]);
    expect([c.width, c.height]).toEqual([4, 2]);
    expect(Array.from(c.data.slice(0, 4))).toEqual(Array.from(src.data.slice((3 * 8 + 2) * 4, (3 * 8 + 2) * 4 + 4)));
    expect(() => cropImage(src, [6, 6, 4, 4])).toThrow(/outside/);
  });

  it('runtimeSizeFor derives sheet sizes from cells and rejects mismatches', () => {
    const char: AssetMeta = { id: 'char-x', kind: 'character', source: 'x.png' };
    expect(runtimeSizeFor(char)).toEqual([48, 96]);
    expect(runtimeSizeFor({ id: 't', kind: 'tileset', source: 'x.png', sliceX: 8, sliceY: 6 })).toEqual([128, 96]);
    expect(() => runtimeSizeFor({ ...char, runtimeSize: [48, 95] })).toThrow();
    expect(() => runtimeSizeFor({ id: 'b', kind: 'building', source: 'x.png' })).toThrow();
  });

  it('processImage runs the full pipeline deterministically and refuses a stretch', () => {
    const src = noise(96, 64, 9);
    const meta: AssetMeta = { id: 'b', kind: 'building', source: 'x.png', runtimeSize: [24, 16] };
    const a = processImage(src, meta);
    expect([a.width, a.height]).toEqual([24, 16]);
    expect(countColors(a)).toBeLessThanOrEqual(24);
    expect(bytes(a)).toBe(bytes(processImage(src, meta)));
    expect(() => processImage(src, { ...meta, runtimeSize: [24, 24] })).toThrow(/stretched/);
  });
});

function fakeKaplay(): KAPLAYCtx {
  const comp = (name: string) => vi.fn((...args: unknown[]) => ({ id: name, args }));
  return {
    loadSprite: vi.fn(),
    rect: comp('rect'),
    color: comp('color'),
    outline: comp('outline'),
    sprite: comp('sprite'),
    rgb: vi.fn(() => ({})),
    vec2: vi.fn(() => ({})),
    drawText: vi.fn(),
  } as unknown as KAPLAYCtx;
}

describe('asset loader', () => {
  it('builds sprite URLs from the deployment base so a sub-path site still finds the files', () => {
    expect(spriteUrl('home', '/')).toBe('/sprites/home.png');
    expect(spriteUrl('home', '/jearny/')).toBe('/jearny/sprites/home.png');
    expect(spriteUrl('home', '/jearny')).toBe('/jearny/sprites/home.png'); // base without a trailing slash
    expect(spriteUrl('char-player', './')).toBe('./sprites/char-player.png');
  });

  it('loadAssets never throws when every sprite is missing; hasAsset is false', async () => {
    // Node has no Image, so every load fails — exactly the "files deleted" path.
    const k = fakeKaplay();
    await expect(loadAssets(k)).resolves.toBeUndefined();
    for (const id of [...Object.keys(ASSETS.buildings), ...Object.keys(ASSETS.tilesets), ...ASSETS.characters]) {
      expect(hasAsset(id)).toBe(false);
    }
  });

  it('loads buildings, tilesets and characters with the right slicing when decoding succeeds', async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const k = fakeKaplay();
      await loadAssets(k);
      const calls = (k.loadSprite as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, unknown, Record<string, unknown>?][];
      expect(calls).toHaveLength(Object.keys(ASSETS.buildings).length
        + Object.keys(ASSETS.tilesets).length + ASSETS.characters.length);
      expect(calls.find((c) => c[0] === 'station')?.[2]).toBeUndefined();
      expect(calls.find((c) => c[0] === 'tiles-outdoor')?.[2]).toEqual({ sliceX: 8, sliceY: 6 });
      const player = calls.find((c) => c[0] === 'char-player')?.[2] as { sliceX: number; sliceY: number; anims: Record<string, unknown> };
      expect([player.sliceX, player.sliceY]).toEqual([3, 4]);
      for (const dir of ['down', 'left', 'right', 'up']) {
        expect(player.anims).toHaveProperty(`walk-${dir}`);
        expect(player.anims).toHaveProperty(`idle-${dir}`);
      }
      expect(hasAsset('station')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('declares every neighbourhood pack building at its registry runtime size', () => {
    // The renderer falls back to a magenta placeholder for a sprite missing from ASSETS, so a pack
    // building placed on the map must be listed here with exactly the size its meta exports.
    const metaDir = fileURLToPath(new URL('../../assets/source/meta/', import.meta.url));
    const pack = ['house-2', 'house-3', 'apartment-small', 'apartment-mid', 'cafe', 'konbini', 'koban',
      'office-tower', 'sengakuji-gate', 'sengakuji-hall', 'bicycle-parking'];
    for (const id of pack) {
      const meta = JSON.parse(readFileSync(join(metaDir, `${id}.json`), 'utf8')) as { runtimeSize: [number, number] };
      expect(ASSETS.buildings[id as keyof typeof ASSETS.buildings], id).toEqual(meta.runtimeSize);
    }
  });

  it('cellSizeOfSheet reads the real cell size of 3×4 sheets', () => {
    expect(cellSizeOfSheet(48, 96)).toEqual([16, 24]); // legacy
    expect(cellSizeOfSheet(48, 80)).toEqual([16, 20]); // chibi spec
    expect(cellSizeOfSheet(0, 0)).toBeNull();
    expect(cellSizeOfSheet(Number.NaN, 80)).toBeNull();
    expect(cellSizeOfSheet(2, 3)).toBeNull();
  });

  it('records each character sheet size from the decoded image; unknown sheets use the 16×20 default', async () => {
    const sizes: Record<string, [number, number]> = { 'char-player': [48, 80], 'char-guide': [48, 96] };
    class SizedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 0;
      height = 0;
      set src(url: string) {
        const [w, h] = sizes[url.replace('/sprites/', '').replace('.png', '')] ?? [48, 80];
        this.width = w;
        this.height = h;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', SizedImage);
    try {
      await loadAssets(fakeKaplay());
      expect(characterCell('char-player')).toEqual([16, 20]);
      expect(characterCell('char-guide')).toEqual([16, 24]);
      expect(characterCell('char-shopkeeper')).toEqual([16, 20]);
      expect(characterCell('char-nobody')).toEqual(DEFAULT_CELL);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a failing loadSprite does not throw and leaves the asset unloaded', async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const k = fakeKaplay();
      (k.loadSprite as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      await expect(loadAssets(k)).resolves.toBeUndefined();
      expect(hasAsset('station')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('spriteOrPlaceholder falls back to a magenta rect with a label when the asset is missing', () => {
    const k = fakeKaplay();
    const comps = spriteOrPlaceholder(k, 'station', 192, 128);
    expect(k.sprite).not.toHaveBeenCalled();
    expect(k.rect).toHaveBeenCalledWith(192, 128);
    expect(k.color).toHaveBeenCalledWith(255, 0, 255);
    expect(comps.map((c) => c.id)).toContain('placeholder-label');
  });

  it('placeholderComps draws its label via drawText', () => {
    const k = fakeKaplay();
    const label = placeholderComps(k, 40, 20, 'npc:guide').find((c) => c.id === 'placeholder-label');
    (label as { draw: () => void }).draw();
    expect((k.drawText as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ text: 'npc:guide' });
  });
});
