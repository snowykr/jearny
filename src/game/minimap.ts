// Minimap overlay (#40): a DOM canvas in the top-right of #ui-root. The pure parts (tile
// category -> colour, POI placement, world -> minimap transform, quest target, labels) are
// exported and unit-tested; the DOM part (mountMinimap) only paints what they compute.
// The player position comes from the runtime through the `getPlayer` getter; nothing polls the DOM.
import { BUILDING, QUEST } from '../contracts';
import type { GameSnapshot, MapDefinition, SceneId, Tile } from '../contracts';
import { maps } from '../content/maps';
import { IT, T } from '../content/maps/tiles';
import { VIEW_H, VIEW_W, cameraCenter } from './camera';
import type { Dir } from './input';
import { CATEGORY_COLOR } from './map-colors';
import type { TileCategory } from './map-colors';
import { allPois, nearestPoi, poisForMap } from './pois';
import type { Poi } from './pois';

export { CATEGORY_COLOR } from './map-colors';
export { nearestPoi, poisForMap } from './pois';
export type { TileCategory } from './map-colors';

// ---------------------------------------------------------------- tile categories

const OUTDOOR_GROUND: Record<number, TileCategory> = {
  [T.GRASS_A]: 'grass', [T.GRASS_B]: 'grass', [T.GRASS_C]: 'grass', [T.SIDEWALK]: 'sidewalk', [T.ROAD]: 'road',
  [T.ROAD_EDGE_N]: 'road', [T.ROAD_EDGE_S]: 'road', [T.ROAD_EDGE_E]: 'road', [T.ROAD_EDGE_W]: 'road', [T.CURB]: 'sidewalk',
  [T.CROSSING_H]: 'crossing', [T.CROSSING_V]: 'crossing', [T.RAIL_H]: 'rail', [T.RAIL_V]: 'rail',
  [T.DECK]: 'deck', [T.DECK_EDGE]: 'deck', [T.STAIRS]: 'deck', [T.PLAZA]: 'plaza', [T.TEMPLE_PATH]: 'path',
  [T.WATER]: 'water', [T.GRAVEL]: 'gravel', [T.HEDGE]: 'hedge', [T.STONE_WALL]: 'gravel',
};
const TREE_TILES: ReadonlySet<number> = new Set([T.TREE_TL, T.TREE_TR, T.TREE_BL, T.TREE_BR]);

const INDOOR_FLOOR: Record<number, TileCategory> = {
  [IT.TATAMI]: 'floor-tatami', [IT.WOOD_FLOOR]: 'floor-wood', [IT.FLOOR_WOOD_DARK]: 'floor-wood',
  [IT.SHOP_FLOOR]: 'floor-shop', [IT.GENKAN]: 'floor-stone', [IT.DOOR_MAT]: 'floor-stone',
  [IT.DOMA_STONE]: 'floor-stone', [IT.GENKAN_STEP]: 'floor-stone', [IT.NOREN_DOOR]: 'floor-stone', [IT.RUG]: 'floor-tatami',
};
const INDOOR_WALL: ReadonlySet<number> = new Set([
  IT.WALL, IT.WINDOW, IT.WALL_TOP, IT.WALL_BASE, IT.WALL_SHOJI, IT.WINDOW_CURTAIN, IT.SHOP_WALL, IT.SHOP_WINDOW,
]);

/** Category of an outdoor cell. Trees (roof/decoration layers) read over the ground. */
export function outdoorCategory(ground: number, decoration = -1, roof = -1): TileCategory {
  if (TREE_TILES.has(roof) || TREE_TILES.has(decoration)) return 'tree';
  return OUTDOOR_GROUND[ground] ?? 'grass';
}

/** Category of an interior cell: walls (ground wall tiles or the room border), furniture (any decoration), else floor. */
export function indoorCategory(ground: number, decoration: number, onBorder: boolean): TileCategory {
  if (onBorder || INDOOR_WALL.has(ground)) return 'wall';
  if (decoration >= 0) return 'furniture';
  return INDOOR_FLOOR[ground] ?? 'floor-wood';
}

// ---------------------------------------------------------------- quest target

/**
 * The next destination for the first-trip quest, as a POI id, or null for none.
 * Heuristic over the snapshot: start by talking to the guide at home, visit the station,
 * order at the shop, then report home. Flag names follow `GameSnapshot.flags` docs.
 */
export function questTargetPoi(snapshot: Pick<GameSnapshot, 'quests' | 'flags'>): string | null {
  const status = snapshot.quests[QUEST.firstTrip] ?? 'not_started';
  switch (status) {
    case 'not_started':
    case 'ready_to_return':
      return BUILDING.home;
    case 'active':
      if (!snapshot.flags['visited:station']) return BUILDING.station;
      if (!snapshot.flags['conversationPassed:shop_order']) return BUILDING.matsushimaya;
      return BUILDING.home;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- labels

const LOCATION_LABEL: Record<SceneId, string> = {
  takanawa: '高輪ゲートウェイ周辺',
  'home-interior': '自宅 1F',
  'home-2f': '自宅 2F',
  'shop-interior': '松島屋（店内）',
};

export const locationLabel = (sceneId: SceneId): string => LOCATION_LABEL[sceneId];

/** Accessible name for the minimap canvas (the visible label stays real text next to it). */
export function ariaLabel(sceneId: SceneId, nearest: { poi: Poi; distance: number } | null): string {
  const base = `ミニマップ：${locationLabel(sceneId)}`;
  if (!nearest) return base;
  return `${base}。いちばん近い場所：${nearest.poi.name}（約${Math.round(nearest.distance)}マス）`;
}

// ---------------------------------------------------------------- transforms

export interface Frame {
  /** Minimap size in canvas pixels. */
  w: number;
  h: number;
  /** Map grid in tiles. */
  cols: number;
  rows: number;
}

/** World tile coordinates (fractional OK) -> minimap canvas pixels. */
export function worldToMinimap(tile: readonly [number, number], f: Frame): [number, number] {
  return [(tile[0] / f.cols) * f.w, (tile[1] / f.rows) * f.h];
}

/** The game viewport (240x160 around the clamped camera) as a minimap rectangle. */
export function viewportRect(
  playerTile: readonly [number, number], map: Pick<MapDefinition, 'grid' | 'tileSize'>, f: Frame,
): { x: number; y: number; w: number; h: number } {
  const ts = map.tileSize;
  const mapPx: [number, number] = [map.grid[0] * ts, map.grid[1] * ts];
  const [cx, cy] = cameraCenter([(playerTile[0] + 0.5) * ts, (playerTile[1] + 0.5) * ts], mapPx);
  const [x, y] = worldToMinimap([(cx - VIEW_W / 2) / ts, (cy - VIEW_H / 2) / ts], f);
  const [w, h] = worldToMinimap([VIEW_W / ts, VIEW_H / ts], f);
  return { x, y, w: Math.min(w, f.w), h: Math.min(h, f.h) };
}

/** Largest minimap width: 25% of the viewport, capped at 200 css px (and never below a readable 96). */
export function minimapWidth(viewportW: number): number {
  return Math.round(Math.max(96, Math.min(200, viewportW * 0.25)));
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Base image at 1 px per tile as RGBA bytes (cols*rows pixels): ground colours by category,
 * then building footprints (outdoor) with a darker 1 px outline. Rendered once per map.
 */
export function buildBaseImage(map: MapDefinition): { data: Uint8ClampedArray; width: number; height: number } {
  const [cols, rows] = map.grid;
  const data = new Uint8ClampedArray(cols * rows * 4);
  const outdoor = map.id === 'takanawa';
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const [r, g, b] = hexToRgb(hex);
    const o = (y * cols + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const g = map.layers.ground[i] ?? -1;
      const d = map.layers.decoration[i] ?? -1;
      const cat = outdoor
        ? outdoorCategory(g, d, map.layers.roof[i] ?? -1)
        : indoorCategory(g, d, x === 0 || y === 0 || x === cols - 1 || y === rows - 1);
      put(x, y, CATEGORY_COLOR[cat]);
    }
  }
  if (outdoor) {
    for (const poi of poisForMap(map)) {
      const { x, y, w, h } = poi.rect;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          // Small buildings are all fill: an outline would swallow most of a 5-6 tile footprint.
          const edge = Math.min(w, h) >= 7 && (xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1);
          put(xx, yy, edge ? '#3a2a22' : poi.color);
        }
      }
    }
  }
  return { data, width: cols, height: rows };
}

// ---------------------------------------------------------------- icons

/** Marker shape per place. Keeping it a union makes the two overlays draw the same symbols. */
export type PoiGlyph = 'house' | 'station' | 'shop' | 'temple';

export function poiGlyph(id: string): PoiGlyph {
  switch (id) {
    case BUILDING.home:
      return 'house';
    case BUILDING.station:
      return 'station';
    case BUILDING.matsushimaya:
      return 'shop';
    default:
      return 'temple';
  }
}

/** Unit vector for a facing direction, used to point the player arrow. */
export function facingVector(facing: Dir): [number, number] {
  switch (facing) {
    case 'up': return [0, -1];
    case 'down': return [0, 1];
    case 'left': return [-1, 0];
    default: return [1, 0];
  }
}

/** A footprint of `w`x`h` minimap px is big enough for a readable glyph. */
export function glyphFits(w: number, h: number): boolean {
  return Math.min(w, h) >= 6;
}

/** Draws the small building symbol centred on (cx, cy). Pure canvas calls, no state. */
export function drawPoiGlyph(
  ctx: CanvasRenderingContext2D, glyph: PoiGlyph, cx: number, cy: number, size: number, color: string,
): void {
  const s = Math.max(5, Math.round(size));
  const half = s / 2;
  const left = Math.round(cx - half);
  const top = Math.round(cy - half);
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#20182a';
  ctx.fillStyle = color;
  ctx.beginPath();
  if (glyph === 'house') {
    // Gable roof over a body: two solid masses, one outline pass.
    ctx.moveTo(left, top + s * 0.45);
    ctx.lineTo(left + half, top);
    ctx.lineTo(left + s, top + s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(left + s * 0.15, top + s * 0.45, s * 0.7, s * 0.5);
    ctx.strokeRect(left + s * 0.15, top + s * 0.45, s * 0.7, s * 0.5);
    return;
  }
  if (glyph === 'temple') {
    // Torii: two posts and two lintels, the 泉岳寺 approach marker.
    ctx.fillRect(left + s * 0.05, top + s * 0.1, s * 0.9, s * 0.22);
    ctx.strokeRect(left + s * 0.05, top + s * 0.1, s * 0.9, s * 0.22);
    ctx.fillRect(left + s * 0.2, top + s * 0.32, s * 0.18, s * 0.62);
    ctx.strokeRect(left + s * 0.2, top + s * 0.32, s * 0.18, s * 0.62);
    ctx.fillRect(left + s * 0.62, top + s * 0.32, s * 0.18, s * 0.62);
    ctx.strokeRect(left + s * 0.62, top + s * 0.32, s * 0.18, s * 0.62);
    return;
  }
  // station / shop: a platform block; the station gets a track, the shop an awning stripe.
  ctx.rect(left, top + s * 0.2, s, s * 0.65);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#20182a';
  if (glyph === 'station') {
    ctx.fillRect(left + s * 0.15, top + s * 0.62, s * 0.7, s * 0.12);
  } else {
    for (let i = 0; i < 3; i++) ctx.fillRect(left + s * (0.12 + i * 0.26), top + s * 0.3, s * 0.12, s * 0.28);
  }
}

// ---------------------------------------------------------------- DOM overlay

export interface MinimapPlayer {
  sceneId: SceneId;
  /** Fractional tile position (mid-step is interpolated). */
  tile: Tile | [number, number];
  /** Direction the player faces; drawn as an arrow so the map answers "which way am I looking". */
  facing?: Dir;
}

export interface MinimapOptions {
  /** Current scene and player tile from the game runtime; null while no scene is mounted. */
  getPlayer: () => MinimapPlayer | null;
  getSnapshot: () => GameSnapshot;
}

const CSS = `
.jr-minimap{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));
  z-index:10;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-family:"DotGothic16","Hiragino Kaku Gothic ProN","Noto Sans JP",ui-monospace,monospace;
  pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.jr-minimap *{box-sizing:border-box}
.jr-minimap-toggle{pointer-events:auto;min-width:44px;height:28px;padding:0 8px;border:2px solid #0b0c14;
  background:#2b2d42;color:#ffd54a;font:700 12px/1 "DotGothic16",ui-monospace,monospace;cursor:pointer;image-rendering:pixelated;
  box-shadow:inset -2px -2px 0 #14151f,inset 2px 2px 0 #4a4e6d}
.jr-minimap-toggle:focus-visible{outline:3px solid #ffd54a;outline-offset:2px}
.jr-minimap-toggle[aria-expanded="true"]{background:#3a3f5c;color:#fff}
.jr-minimap-panel{position:relative;border:3px solid #0b0c14;background:#171a28;padding:0;line-height:0;
  box-shadow:0 0 0 2px #d8d2c0,3px 3px 0 rgba(0,0,0,.55)}
.jr-minimap-panel[hidden]{display:none}
.jr-minimap-canvas{display:block;image-rendering:pixelated}
.jr-minimap-label{display:block;padding:2px 4px;background:#2b2d42;border-top:2px solid #0b0c14;color:#f7f3e6;
  font:700 11px/1.3 "DotGothic16","Hiragino Kaku Gothic ProN","Noto Sans JP",ui-monospace,monospace;
  text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

/** Mounts the minimap into `root`. Returns an unmount function. */
export function mountMinimap(root: HTMLElement, opts: MinimapOptions): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

  const style = doc.createElement('style');
  style.textContent = CSS;
  const wrap = doc.createElement('div');
  wrap.className = 'jr-minimap';
  wrap.dataset.testid = 'minimap';

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'jr-minimap-toggle';
  toggle.textContent = 'MAP';
  toggle.setAttribute('aria-label', 'ミニマップを表示・非表示');
  toggle.setAttribute('aria-expanded', 'true');

  const panel = doc.createElement('div');
  panel.className = 'jr-minimap-panel';
  panel.id = 'jr-minimap-panel';
  toggle.setAttribute('aria-controls', panel.id);

  const canvas = doc.createElement('canvas');
  canvas.className = 'jr-minimap-canvas';
  canvas.setAttribute('role', 'img');
  const label = doc.createElement('span');
  label.className = 'jr-minimap-label';
  panel.append(canvas, label);
  wrap.append(toggle, panel);
  root.append(style, wrap);

  const ctx = canvas.getContext('2d')!;
  let open = true;
  let mapId: SceneId | null = null;
  let base: HTMLCanvasElement | null = null;
  let pois: Poi[] = [];
  let frame: Frame = { w: 1, h: 1, cols: 1, rows: 1 };
  let cssW = 0;
  let dpr = 1;
  let lastKey = '';
  let lastAria = '';
  let raf = 0;
  let lastPaint = 0;
  let lastW = win.innerWidth;

  const loadMap = (id: SceneId) => {
    const map = maps[id];
    const img = buildBaseImage(map);
    base = doc.createElement('canvas');
    base.width = img.width;
    base.height = img.height;
    base.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
    pois = id === 'takanawa' ? allPois(map) : [];
    mapId = id;
    layout();
  };

  /** Sizes the canvas for the map aspect and the viewport; backing store is dpr-scaled. */
  const layout = () => {
    if (!mapId) return;
    const map = maps[mapId];
    const [cols, rows] = map.grid;
    cssW = minimapWidth(win.innerWidth);
    dpr = Math.min(win.devicePixelRatio || 1, 3);
    // Interiors are small rooms: draw them smaller than the outdoor map, scaled in whole pixels per tile.
    const outdoor = mapId === 'takanawa';
    const w = outdoor ? cssW : Math.max(cols, Math.floor((cssW * 0.8) / cols) * cols);
    const h = Math.round((w * rows) / cols);
    frame = { w, h, cols, rows };
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    label.style.width = `${w}px`;
    lastKey = '';
  };

  const blinkOn = (t: number) => reducedMotion?.matches || Math.floor(t / 450) % 2 === 0;

  const draw = (t: number, p: MinimapPlayer, snap: GameSnapshot) => {
    const map = maps[p.sceneId];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(base!, 0, 0, frame.w, frame.h);
    const outdoor = p.sceneId === 'takanawa';
    const still = !!reducedMotion?.matches;

    if (outdoor) {
      // Viewport window.
      const v = viewportRect(p.tile, map, frame);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,16,26,.55)';
      ctx.strokeRect(Math.round(v.x) + 0.5, Math.round(v.y) + 0.5, Math.round(v.w), Math.round(v.h));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.strokeRect(Math.round(v.x) + 0.5, Math.round(v.y) + 0.5, Math.round(v.w), Math.round(v.h));

      // POI markers + labels. The quest target's ring pulses (static ring under reduced motion).
      const target = questTargetPoi(snap);
      ctx.font = '600 10px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const poi of pois) {
        const [mx, my] = worldToMinimap(poi.center, frame);
        if (poi.id === target) {
          const k = still ? 0.5 : (Math.sin(t / 260) + 1) / 2;
          ctx.beginPath();
          ctx.arc(mx, my, 6 + k * 5, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(255,213,74,${still ? 0.95 : 0.95 - k * 0.55})`;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1b1620';
        ctx.stroke();
        // Building symbol: the glyph only replaces the dot when the footprint can hold one,
        // so the 1-tile landmark (泉岳寺) keeps a fixed marker of its own.
        const gw = (poi.rect.w / frame.cols) * frame.w;
        const gh = (poi.rect.h / frame.rows) * frame.h;
        const landmark = poi.id.startsWith('landmark:');
        if (landmark || glyphFits(gw, gh)) {
          drawPoiGlyph(ctx, poiGlyph(poi.id), mx, my, landmark ? 8 : Math.min(gw, gh) * 0.9, poi.color);
        }
        const tw = ctx.measureText(poi.label).width;
        const right = mx + 8 + tw <= frame.w - 2;
        ctx.textAlign = right ? 'left' : 'right';
        const lx = right ? mx + 6 : mx - 6;
        const ly = Math.min(Math.max(my - 7, 7), frame.h - 7);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(20,16,26,.92)';
        ctx.strokeText(poi.label, lx, ly);
        ctx.fillStyle = '#fff';
        ctx.fillText(poi.label, lx, ly);
      }
    } else {
      // Room thumbnail: mark the exit door.
      const exit = map.portals[0];
      if (exit) {
        const [ex, ey] = worldToMinimap([exit.tile[0] + 0.5, exit.tile[1] + 0.5], frame);
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(Math.round(ex) - 3, Math.min(Math.round(ey), frame.h - 3) - 1, 6, 3);
      }
    }

    // Player dot + facing arrow: blinks between bright and dim (steady under reduced motion).
    const [px, py] = worldToMinimap([p.tile[0] + 0.5, p.tile[1] + 0.5], frame);
    const on = blinkOn(t);
    const radius = outdoor ? 3.5 : 4.5;
    const [dx, dy] = facingVector(p.facing ?? 'down');
    const tipX = px + dx * (radius + 5);
    const tipY = py + dy * (radius + 5);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.45)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - dx * 4 - dy * 3, tipY - dy * 4 + dx * 3);
    ctx.lineTo(tipX - dx * 4 + dy * 3, tipY - dy * 4 - dx * 3);
    ctx.closePath();
    ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#ff4d4d' : 'rgba(255,77,77,.35)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.45)';
    ctx.stroke();
  };

  const tick = (t: number) => {
    raf = win.requestAnimationFrame(tick);
    if (!open || t - lastPaint < 66) return; // ~15 fps is plenty for a map this size
    const p = opts.getPlayer();
    if (!p) return;
    if (p.sceneId !== mapId) loadMap(p.sceneId);
    if (win.innerWidth !== lastW) { lastW = win.innerWidth; layout(); }
    const snap = opts.getSnapshot();
    const still = !!reducedMotion?.matches;
    const phase = still ? 0 : Math.floor(t / 66);
    const target = p.sceneId === 'takanawa' ? questTargetPoi(snap) : null;
    const key = `${p.sceneId}|${p.tile[0].toFixed(2)}|${p.tile[1].toFixed(2)}|${p.facing ?? 'down'}|${target}|${still ? 'still' : phase}|${frame.w}|${dpr}`;
    if (key === lastKey) return;
    lastKey = key;
    lastPaint = t;
    draw(t, p, snap);
    const text = locationLabel(p.sceneId);
    if (label.textContent !== text) label.textContent = text;
    const aria = ariaLabel(p.sceneId, p.sceneId === 'takanawa' ? nearestPoi(pois, p.tile) : null);
    if (aria !== lastAria) { lastAria = aria; canvas.setAttribute('aria-label', aria); }
  };

  const setOpen = (next: boolean) => {
    open = next;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    lastKey = '';
  };
  toggle.addEventListener('click', () => setOpen(!open));
  // No M listener here: the start menu (#65) owns M at capture phase, so a second handler would be dead.
  // The visible MAP button and its 44px target keep the toggle reachable by touch and keyboard.
  raf = win.requestAnimationFrame(tick);

  return () => {
    win.cancelAnimationFrame(raf);
    wrap.remove();
    style.remove();
  };
}
