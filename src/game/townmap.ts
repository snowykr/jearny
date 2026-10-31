// Full-screen town map (#66): the マップ tab of the start menu (#65).
// Same data as the minimap, drawn at 3 px per tile so the district reads at a glance:
// ground colours sampled from the tileset, building glyphs, the 泉岳寺 approach, the
// quest target and the player's facing. Read-only; nothing here touches the session.
import type { GameSnapshot, MapDefinition, SceneId, Tile } from '../contracts';
import { maps } from '../content/maps';
import type { Dir } from './input';
import { buildBaseImage, drawPoiGlyph, facingVector, poiGlyph, questTargetPoi, worldToMinimap } from './minimap';
import { allPois } from './pois';
import type { Poi } from './pois';

/** Pixels per tile on the full map. 128x96 tiles -> 384x288, which fits the menu window. */
export const TOWN_SCALE = 3;

/** Shown next to the marker when the player is indoors; 2F is still home, not the shop. */
const INSIDE_LABEL: Partial<Record<SceneId, string>> = {
  'home-interior': '自宅の中',
  'home-2f': '自宅 2Fの中',
  'shop-interior': '松島屋の中',
};

export interface TownMapFrame {
  w: number;
  h: number;
  scale: number;
  cols: number;
  rows: number;
}

export function townMapFrame(map: Pick<MapDefinition, 'grid'>): TownMapFrame {
  const [cols, rows] = map.grid;
  return { w: cols * TOWN_SCALE, h: rows * TOWN_SCALE, scale: TOWN_SCALE, cols, rows };
}

export interface TownMapPlayer {
  sceneId: SceneId;
  /** Fractional tile position; the map is static so the integer tile is enough. */
  tile: Tile | [number, number];
  facing?: Dir;
}

/** Outdoor tile of the portal leading into `sceneId`, so an inside player still has a marker. */
export function entranceFor(map: MapDefinition, sceneId: SceneId, depth = 0): Tile | null {
  const portal = map.portals.find((p) => p.toScene === sceneId);
  if (portal) return portal.tile;
  if (depth > 0) return null;
  // A room reached through another room (home 2F) still points at the outdoor door.
  const scene = maps[sceneId];
  if (!scene) return null;
  for (const step of scene.portals) {
    if (step.toScene === sceneId) continue;
    const outer = entranceFor(map, step.toScene, depth + 1);
    if (outer) return outer;
  }
  return null;
}

/** Places to legend: every POI plus the landmark, in map order. */
export function townMapLegend(map: MapDefinition): Poi[] {
  return allPois(map);
}

export interface TownMapOptions {
  getPlayer: () => TownMapPlayer | null;
  getSnapshot: () => GameSnapshot;
}

export interface TownMap {
  el: HTMLElement;
  /** Repaint with the current player/snapshot. Safe to call while hidden. */
  refresh: () => void;
  dispose: () => void;
}

const CSS = `
.jr-townmap{display:flex;flex-direction:column;gap:8px;align-items:stretch;color:#f7f3e6}
.jr-townmap-frame{align-self:center;max-width:100%;border:3px solid #0b0c14;background:#171a28;
  box-shadow:0 0 0 2px #d8d2c0,4px 4px 0 rgba(0,0,0,.45)}
.jr-townmap-canvas{display:block;width:100%;max-width:100%;height:auto;image-rendering:pixelated}
.jr-townmap-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:0;list-style:none;font-size:12px;line-height:1.8}
.jr-townmap-legend li{display:flex;align-items:center;gap:4px}
.jr-townmap-swatch{display:inline-block;width:10px;height:10px;border:2px solid #0b0c14}
.jr-townmap-note{margin:0;color:#b9bdd4;font-size:12px}
`;

export function mountTownMap(doc: Document, opts: TownMapOptions): TownMap {
  const style = doc.createElement('style');
  style.dataset.jrTownmap = '';
  style.textContent = CSS;

  const el = doc.createElement('div');
  el.className = 'jr-townmap';
  el.dataset.testid = 'town-map';

  const frameEl = doc.createElement('div');
  frameEl.className = 'jr-townmap-frame';

  const map = maps.takanawa;
  const frame = townMapFrame(map);
  const canvas = doc.createElement('canvas');
  canvas.className = 'jr-townmap-canvas';
  canvas.width = frame.w;
  canvas.height = frame.h;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '高輪ゲートウェイ周辺の全体マップ');
  frameEl.append(canvas);

  const legend = doc.createElement('ul');
  legend.className = 'jr-townmap-legend';
  for (const poi of townMapLegend(map)) {
    const li = doc.createElement('li');
    const swatch = doc.createElement('span');
    swatch.className = 'jr-townmap-swatch';
    swatch.style.background = poi.color;
    li.dataset.poi = poi.id;
    li.append(swatch, doc.createTextNode(poi.name));
    legend.append(li);
  }
  // The two dynamic symbols are not POIs; without a row they are unexplained.
  for (const [id, name, color] of [
    ['you', 'いまいる場所', '#ff4d4d'],
    ['quest', '次の目的地', '#ffd54a'],
  ] as const) {
    const li = doc.createElement('li');
    const swatch = doc.createElement('span');
    swatch.className = 'jr-townmap-swatch';
    swatch.style.background = color;
    li.dataset.symbol = id;
    li.append(swatch, doc.createTextNode(name));
    legend.append(li);
  }

  const note = doc.createElement('p');
  note.className = 'jr-townmap-note';
  note.textContent = '赤い点がいまいる場所（建物の中では入口）。白い矢印は向き。M → メニュー → マップでいつでも開けます。';

  el.append(style, frameEl, legend, note);

  const ctx = canvas.getContext('2d');
  let base: HTMLCanvasElement | null = null;
  let lastAria = '';

  const baseCanvas = (): HTMLCanvasElement | null => {
    if (base) return base;
    const img = buildBaseImage(map);
    const c = doc.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cctx = c.getContext('2d');
    if (!cctx) return null;
    cctx.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
    base = c;
    return base;
  };

  const refresh = (): void => {
    if (!ctx) return;
    const img = baseCanvas();
    if (!img) return;
    const player = opts.getPlayer();
    const snapshot = opts.getSnapshot();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(img, 0, 0, frame.w, frame.h);

    // Places: footprint tint, glyph, outlined label.
    ctx.font = '700 11px "DotGothic16", "Hiragino Sans", "Noto Sans JP", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const target = questTargetPoi(snapshot);
    for (const poi of townMapLegend(map)) {
      const [mx, my] = worldToMinimap(poi.center, frame);
      if (poi.id === target) {
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,213,74,.95)';
        ctx.stroke();
      }
      const gw = poi.rect.w * TOWN_SCALE;
      const gh = poi.rect.h * TOWN_SCALE;
      const landmark = poi.id.startsWith('landmark:');
      drawPoiGlyph(ctx, poiGlyph(poi.id), mx, my, landmark ? 12 : Math.max(10, Math.min(22, Math.min(gw, gh) * 0.8)), poi.color);
      const label = poi.label;
      const right = mx + 10 + ctx.measureText(label).width <= frame.w - 2;
      ctx.textAlign = right ? 'left' : 'right';
      const lx = right ? mx + 8 : mx - 8;
      const ly = Math.min(Math.max(my - 11, 8), frame.h - 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#20182a';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx, ly);
    }

    // Player marker: the arrow points where the character faces; inside, mark the entrance instead
    // and name the room by scene (home is not a shop).
    let marker: [number, number] | null = null;
    let facing: Dir | null = null;
    let inside: string | null = null;
    if (player?.sceneId === 'takanawa') {
      marker = worldToMinimap([player.tile[0] + 0.5, player.tile[1] + 0.5], frame);
      facing = player.facing ?? null;
    } else if (player) {
      const door = entranceFor(map, player.sceneId);
      if (door) {
        marker = worldToMinimap([door[0] + 0.5, door[1] + 0.5], frame);
        inside = INSIDE_LABEL[player.sceneId] ?? null;
      }
    }
    if (marker) {
      const [px, py] = marker;
      if (facing) {
        const [dx, dy] = facingVector(facing);
        const tipX = px + dx * 11;
        const tipY = py + dy * 11;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dx * 6 - dy * 5, tipY - dy * 6 + dx * 5);
        ctx.lineTo(tipX - dx * 6 + dy * 5, tipY - dy * 6 - dx * 5);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4d4d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      if (inside) {
        ctx.textAlign = 'left';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#20182a';
        ctx.strokeText(inside, px + 8, py - 10);
        ctx.fillStyle = '#fff';
        ctx.fillText(inside, px + 8, py - 10);
      }
    }

    const aria = player?.sceneId === 'takanawa'
      ? '高輪ゲートウェイ周辺の全体マップ。家、駅、松島屋、泉岳寺の参道がのっています。赤い点がいまいる場所、黄色い輪が次の目的地です。'
      : `高輪ゲートウェイ周辺の全体マップ。${inside ?? '建物の中'}の入口にいます。`;
    if (aria !== lastAria) {
      lastAria = aria;
      canvas.setAttribute('aria-label', aria);
    }
  };

  refresh();

  return {
    el,
    refresh,
    dispose() {
      el.remove();
      style.remove();
    },
  };
}
