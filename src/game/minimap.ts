// Minimap overlay (#40): a DOM canvas in the top-right of #ui-root. The pure parts (tile
// category -> colour, POI placement, world -> minimap transform, quest target, labels) are
// exported and unit-tested; the DOM part (mountMinimap) only paints what they compute.
// The player position comes from the runtime through the `getPlayer` getter; nothing polls the DOM.
import { BUILDING, QUEST } from '../contracts';
import type { GameSnapshot, MapDefinition, SceneId, Tile } from '../contracts';
import { maps } from '../content/maps';
import { IT, T } from '../content/maps/tiles';
import { VIEW_H, VIEW_W, cameraCenter } from './camera';

// ---------------------------------------------------------------- tile categories

export type TileCategory =
  | 'grass' | 'sidewalk' | 'road' | 'crossing' | 'rail' | 'gravel' | 'deck' | 'plaza' | 'path'
  | 'water' | 'hedge' | 'tree' | 'building'
  | 'floor-tatami' | 'floor-wood' | 'floor-shop' | 'floor-stone' | 'wall' | 'furniture';

export const CATEGORY_COLOR: Record<TileCategory, string> = {
  grass: '#5f9a52', sidewalk: '#cfc7b4', road: '#4b4e59', crossing: '#ece8d8', rail: '#2f2f3a', gravel: '#9a9084',
  deck: '#8da6bd', plaza: '#dfcd9f', path: '#bb8c5e', water: '#4b88c9', hedge: '#3f7a48', tree: '#2e6a3b',
  building: '#e7d6b8',
  'floor-tatami': '#cdb97e', 'floor-wood': '#b0804f', 'floor-shop': '#dcc79d', 'floor-stone': '#a09a92',
  wall: '#4d3b31', furniture: '#8c5d3b',
};

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

// ---------------------------------------------------------------- POIs

export interface Poi {
  id: string;
  /** Short on-map label. */
  label: string;
  /** Spoken name for the accessible label. */
  name: string;
  /** Centre in (fractional) tile coordinates. */
  center: [number, number];
  /** Footprint colour (outdoor buildings). */
  color: string;
  /** Building footprint: top-left tile and size. */
  rect: { x: number; y: number; w: number; h: number };
}

const POI_DEFS: Record<string, { label: string; name: string; color: string }> = {
  [BUILDING.home]: { label: '家', name: '自宅', color: '#d0675a' },
  [BUILDING.station]: { label: '駅', name: '高輪ゲートウェイ駅', color: '#6b92c6' },
  [BUILDING.matsushimaya]: { label: '松島屋', name: '松島屋', color: '#dba04c' },
  // 泉岳寺: no anchor on the map yet; add a POI_DEFS entry (and a building entity) when one lands.
};

/** POIs placed from the map's building entities. Entities without a definition are not POIs. */
export function poisForMap(map: MapDefinition): Poi[] {
  const out: Poi[] = [];
  for (const e of map.entities) {
    const def = POI_DEFS[e.id];
    if (e.kind !== 'building' || !def) continue;
    const [w, h] = e.size ?? [1, 1];
    out.push({
      id: e.id, ...def, center: [e.tile[0] + w / 2, e.tile[1] + h / 2],
      rect: { x: e.tile[0], y: e.tile[1], w, h },
    });
  }
  return out;
}

/** Nearest POI to a tile, by distance to its footprint centre (in tiles). */
export function nearestPoi(pois: readonly Poi[], tile: readonly [number, number]): { poi: Poi; distance: number } | null {
  let best: { poi: Poi; distance: number } | null = null;
  for (const poi of pois) {
    const d = Math.hypot(poi.center[0] - tile[0], poi.center[1] - tile[1]);
    if (!best || d < best.distance) best = { poi, distance: d };
  }
  return best;
}

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
  'home-interior': '自宅',
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
          // Tiny POIs stay fill: an outline would swallow a 3-tile footprint. Buildings (>=4 rows) get one.
          const edge = Math.min(w, h) >= 4 && (xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1);
          put(xx, yy, edge ? '#3a2a22' : poi.color);
        }
      }
    }
  }
  return { data, width: cols, height: rows };
}

// ---------------------------------------------------------------- DOM overlay

export interface MinimapPlayer {
  sceneId: SceneId;
  /** Fractional tile position (mid-step is interpolated). */
  tile: Tile | [number, number];
}

export interface MinimapOptions {
  /** Current scene and player tile from the game runtime; null while no scene is mounted. */
  getPlayer: () => MinimapPlayer | null;
  getSnapshot: () => GameSnapshot;
}

const CSS = `
.jr-minimap{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));
  z-index:10;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;
  pointer-events:none;user-select:none;-webkit-user-select:none}
.jr-minimap *{box-sizing:border-box}
.jr-minimap-toggle{pointer-events:auto;min-width:32px;height:28px;padding:0 8px;border:1px solid #0b0c14;border-radius:4px;
  background:rgba(20,21,31,.78);color:#e8e9f5;font:600 12px/1 system-ui,sans-serif;cursor:pointer}
.jr-minimap-toggle:focus-visible{outline:2px solid #ffd54a;outline-offset:1px}
.jr-minimap-toggle[aria-expanded="true"]{background:rgba(60,64,100,.85)}
.jr-minimap-panel{border:1px solid #0b0c14;background:rgba(14,15,24,.72);padding:0;line-height:0;box-shadow:0 1px 4px rgba(0,0,0,.45)}
.jr-minimap-panel[hidden]{display:none}
.jr-minimap-canvas{display:block;image-rendering:pixelated}
.jr-minimap-label{display:block;padding:2px 4px;background:rgba(14,15,24,.85);color:#f0f0fa;font:600 11px/1.3 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;
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
  toggle.textContent = '🗺';
  toggle.setAttribute('aria-label', 'ミニマップ');
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
    pois = id === 'takanawa' ? poisForMap(map) : [];
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

    // Player dot: blinks between a bright dot and a dim one (steady under reduced motion).
    const [px, py] = worldToMinimap([p.tile[0] + 0.5, p.tile[1] + 0.5], frame);
    const on = blinkOn(t);
    ctx.beginPath();
    ctx.arc(px, py, outdoor ? 3.5 : 4.5, 0, Math.PI * 2);
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
    const key = `${p.sceneId}|${p.tile[0].toFixed(2)}|${p.tile[1].toFixed(2)}|${target}|${still ? 'still' : phase}|${frame.w}|${dpr}`;
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
  // Click-only: the start menu (#65) owns M, so the minimap must not advertise a key it
  // no longer receives. The full-screen map (#66) will re-bind M through the menu.
  toggle.addEventListener('click', () => setOpen(!open));
  raf = win.requestAnimationFrame(tick);

  return () => {
    win.cancelAnimationFrame(raf);
    wrap.remove();
    style.remove();
  };
}
