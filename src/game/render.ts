// Draws one frame of a scene: ground → decoration → Y-sorted buildings/characters → roof.
// Only tiles inside the 240×160 viewport are touched, so the 128×96 map stays cheap.
// Every sprite has a flat-colour fallback for when the art has not landed (hasAsset false).
import type { Color, KAPLAYCtx } from 'kaplay';
import type { EntityAnchor } from '../contracts';
import { TILESET_FOR_SCENE } from '../content/maps/tiles';
import { ASSETS, DEFAULT_CELL, SHEET_COLS, characterCell, hasAsset } from './assets';
import { visibleTiles } from './camera';
import type { Dir } from './input';
import { playerDrawPixel, walkColumn } from './player';
import type { SceneRuntime } from './scene';

/** Ground shadow under every character: 10×4 px ellipse, ~25% black. */
const SHADOW_W = 10;
const SHADOW_H = 4;
const SHADOW_OPACITY = 0.25;
/** Walk sheet rows: down, left, right, up. */
const FACING_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

type RGB = [number, number, number];

// Fallback colours keyed by tile index (see tiles.ts T / IT).
const OUTDOOR: Record<number, RGB> = {
  0: [112, 160, 88], 1: [104, 152, 80], 2: [120, 168, 96], 3: [200, 196, 184], 4: [72, 72, 80],
  5: [90, 90, 98], 6: [90, 90, 98], 7: [90, 90, 98], 8: [90, 90, 98], 9: [225, 225, 225], 10: [225, 225, 225],
  11: [96, 80, 64], 12: [96, 80, 64], 13: [170, 170, 178], 14: [140, 140, 150], 15: [150, 150, 160],
  16: [48, 104, 56], 17: [40, 88, 48], 18: [40, 88, 48], 19: [40, 88, 48], 20: [40, 88, 48],
  21: [60, 60, 70], 22: [200, 60, 60], 23: [140, 100, 60], 24: [190, 170, 130], 25: [130, 130, 130],
  26: [150, 120, 80], 27: [220, 120, 160], 28: [210, 190, 160], 29: [80, 140, 200], 30: [170, 160, 150], 31: [180, 180, 180],
};
const INDOOR: Record<number, RGB> = {
  0: [200, 190, 120], 1: [170, 130, 90], 2: [225, 215, 200], 3: [150, 200, 230], 4: [120, 80, 50],
  5: [230, 150, 160], 6: [150, 140, 130], 7: [100, 70, 60], 8: [200, 180, 150], 9: [220, 170, 90],
  10: [220, 170, 90], 11: [150, 100, 60], 12: [60, 80, 150], 13: [90, 90, 100], 14: [130, 90, 60], 15: [60, 140, 70],
};

const colorCache = new Map<string, Color>();
function cached(k: KAPLAYCtx, key: string, rgb: RGB): Color {
  let c = colorCache.get(key);
  if (!c) colorCache.set(key, (c = k.rgb(rgb[0], rgb[1], rgb[2])));
  return c;
}
const hashRgb = (s: string): RGB => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return [80 + (h & 127), 80 + ((h >> 7) & 127), 80 + ((h >> 14) & 127)];
};

/**
 * Top-left of a character cell so that its bottom-centre sits on the bottom edge of the tile at
 * (tileX, tileBottom), centred horizontally. Always integers: no sub-pixel drawing, no scaling.
 */
export function footAnchoredOrigin(tileX: number, tileBottom: number, tileSize: number, cellW: number, cellH: number): [number, number] {
  return [Math.floor(tileX + (tileSize - cellW) / 2), tileBottom - cellH];
}

interface Drawable {
  foot: number;
  draw(): void;
}

export function drawScene(k: KAPLAYCtx, rt: SceneRuntime, cam: [number, number]): void {
  const { map } = rt;
  const ts = map.tileSize;
  const [cols] = map.grid;
  const tileset = TILESET_FOR_SCENE[map.id];
  const palette = tileset === 'tiles-outdoor' ? OUTDOOR : INDOOR;
  const useSheet = hasAsset(tileset);
  const { x0, y0, x1, y1 } = visibleTiles(cam, map.grid, ts);

  const tileAt = (layer: number[], kind: 'ground' | 'decoration' | 'roof') => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = layer[y * cols + x];
        if (i === undefined || i < 0) continue;
        if (useSheet) {
          k.drawSprite({ sprite: tileset, frame: i, pos: k.vec2(x * ts, y * ts) });
        } else {
          const rgb = palette[i] ?? hashRgb(`${tileset}:${i}`);
          const inset = kind === 'decoration' ? 2 : 0;
          k.drawRect({
            pos: k.vec2(x * ts + inset, y * ts + inset),
            width: ts - inset * 2,
            height: ts - inset * 2,
            color: cached(k, `${tileset}:${i}`, rgb),
            opacity: kind === 'roof' ? 0.85 : 1,
          });
        }
      }
    }
  };

  tileAt(map.layers.ground, 'ground');
  tileAt(map.layers.decoration, 'decoration');

  // Y-sorted layer: buildings (foot = bottom of footprint), NPCs and the player.
  const items: Drawable[] = [];
  const minX = cam[0] - 120 - 192;
  const maxX = cam[0] + 120 + 192;
  const minY = cam[1] - 80 - 128;
  const maxY = cam[1] + 80 + 128;
  for (const e of map.entities) {
    if (e.kind === 'zone') continue;
    const px = e.tile[0] * ts;
    const py = e.tile[1] * ts;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;
    if (e.kind === 'building') items.push({ foot: (e.tile[1] + (e.size?.[1] ?? 1)) * ts, draw: () => drawBuilding(k, e, ts) });
    else items.push({ foot: py + ts, draw: () => drawCharacter(k, charSprite(e), px, py + ts, ts, rt.npcFacing(e.id) ?? e.facing ?? 'down', 0, hashRgb(e.id)) });
  }
  const [ppx, ppy] = playerDrawPixel(rt.player, ts);
  const [bx, by] = rt.bumpOffset();
  items.push({
    foot: ppy + ts,
    draw: () => drawCharacter(k, 'char-player', ppx + bx, ppy + ts + by, ts, rt.player.facing, walkColumn(rt.player), [96, 150, 210]),
  });
  items.sort((a, b) => a.foot - b.foot);
  for (const it of items) it.draw();

  tileAt(map.layers.roof, 'roof');
}

const charSprite = (e: EntityAnchor) => `char-${e.id.slice(e.id.indexOf(':') + 1)}`;

/** Bottom-aligned to the footprint, centred horizontally. */
function drawBuilding(k: KAPLAYCtx, e: EntityAnchor, ts: number): void {
  const [w, h] = e.size ?? [1, 1];
  const fw = w * ts;
  const fh = h * ts;
  const sprite = e.assetId;
  if (sprite && hasAsset(sprite)) {
    const dims = (ASSETS.buildings as Record<string, readonly [number, number]>)[sprite] ?? [fw, fh];
    k.drawSprite({ sprite, pos: k.vec2(e.tile[0] * ts + (fw - dims[0]) / 2, (e.tile[1] + h) * ts - dims[1]) });
    return;
  }
  k.drawRect({ pos: k.vec2(e.tile[0] * ts, e.tile[1] * ts), width: fw, height: fh, color: cached(k, 'missing', [200, 0, 200]), outline: { width: 1, color: k.rgb(60, 0, 60) } });
}

/** (tileX, bottomY) is the tile's bottom-left; the sheet's real cell sits on it by the feet. `col` is 0 idle, 1/2 walk. */
function drawCharacter(k: KAPLAYCtx, sprite: string, tileX: number, bottomY: number, ts: number, facing: Dir, col: number, fallback: RGB): void {
  const loadedSprite = hasAsset(sprite);
  const [cw, ch] = loadedSprite ? characterCell(sprite) : DEFAULT_CELL;
  const [x, y] = footAnchoredOrigin(tileX, bottomY, ts, cw, ch);
  k.drawEllipse({
    pos: k.vec2(x + cw / 2, bottomY - 1),
    radiusX: SHADOW_W / 2,
    radiusY: SHADOW_H / 2,
    color: cached(k, 'shadow', [0, 0, 0]),
    opacity: SHADOW_OPACITY,
  });
  if (loadedSprite) {
    k.drawSprite({ sprite, frame: FACING_ROW[facing] * SHEET_COLS + col, pos: k.vec2(x, y) });
    return;
  }
  // 16×20 placeholder: 8×8 head over a 10×9 body so the silhouette matches the chibi spec.
  const outline = k.rgb(20, 20, 30);
  k.drawRect({ pos: k.vec2(x + 3, y + 10), width: cw - 6, height: ch - 11, color: cached(k, `c:${fallback}`, fallback), outline: { width: 1, color: outline } });
  k.drawRect({ pos: k.vec2(x + 4, y + 1), width: 8, height: 9, color: cached(k, 'c:head', [236, 200, 170]), outline: { width: 1, color: outline } });
  // Facing marker (eyes) so direction is readable on the placeholder.
  const eyeX = facing === 'left' ? x + 5 : facing === 'right' ? x + 9 : x + 6;
  const eyeY = y + 5;
  if (facing !== 'up') k.drawRect({ pos: k.vec2(eyeX, eyeY), width: 2, height: 2, color: outline });
}
