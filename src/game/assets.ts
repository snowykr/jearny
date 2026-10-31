// Asset contract + loader. Everyone else only uses ASSETS ids and these function
// signatures; a sprite that is missing or fails to decode renders as a magenta placeholder.
import type { Comp, KAPLAYCtx, LoadSpriteOpt, SpriteAnims } from 'kaplay';

export const ASSETS = {
  buildings: {
    station: [192, 128], matsushimaya: [96, 80], home: [80, 96], liebe: [80, 80],
    // Neighbourhood pack (#83/#94). Sizes are `runtimeSize` from assets/source/meta/<id>.json.
    'house-2': [80, 96], 'house-3': [80, 80], 'apartment-small': [96, 112],
    // 128px sprites over a 112px collision rect: the renderer centres them, so 8px hangs over
    // each side and only `collisionTiles` blocks.
    'apartment-mid': [128, 128], 'office-tower': [128, 192],
    cafe: [80, 80], konbini: [112, 80], koban: [48, 64],
    'sengakuji-gate': [128, 112], 'sengakuji-hall': [160, 128], 'bicycle-parking': [64, 48],
  },
  tilesets: { 'tiles-outdoor': { sliceX: 8, sliceY: 6 }, 'tiles-interior': { sliceX: 8, sliceY: 6 }, 'tiles-interior-2': { sliceX: 8, sliceY: 2 } },
  /** Walk sheets: 3 cols (idle, stepA, stepB) × 4 rows (down, left, right, up). Cells are 16×20 (16×24 on the legacy sheets); the real size is read from the loaded image. */
  characters: ['char-player', 'char-guide', 'char-station_staff', 'char-shopkeeper'],
} as const;

const loaded = new Set<string>();

export const SHEET_COLS = 3;
export const SHEET_ROWS = 4;
/** Cell size assumed for fallback rectangles and sheets whose size is unknown: the 16×20 chibi spec. */
export const DEFAULT_CELL: readonly [number, number] = [16, 20];

/** Real cell size of a 3×4 walk sheet, or null when the image size is unusable. Handles 48×96 (16×24) and 48×80 (16×20). */
export function cellSizeOfSheet(width: number, height: number): [number, number] | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const w = Math.floor(width / SHEET_COLS);
  const h = Math.floor(height / SHEET_ROWS);
  return w >= 1 && h >= 1 ? [w, h] : null;
}

const cellSizes = new Map<string, [number, number]>();

/** Cell size of a loaded character sheet; DEFAULT_CELL when the sheet is missing. */
export function characterCell(id: string): readonly [number, number] {
  return cellSizes.get(id) ?? DEFAULT_CELL;
}

/** Walk sheets are 3 cols (idle, stepA, stepB) × 4 rows (down, left, right, up). */
const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;

export const characterAnims: SpriteAnims = Object.fromEntries(
  DIRECTIONS.flatMap((dir, row) => {
    const idle = row * 3;
    return [
      [`idle-${dir}`, { from: idle, to: idle, loop: true }],
      [`walk-${dir}`, { frames: [idle + 1, idle, idle + 2, idle], loop: true, speed: 8 }],
    ];
  }),
);

/** Decode an image ourselves: a missing file served as the dev-server HTML fallback fails here, not inside KAPLAY. */
function fetchImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/**
 * Runtime URL for a sprite. Built from Vite's BASE_URL so a sub-path deployment
 * (GitHub Pages project site, `/jearny/`) loads the same files as `dev` at `/`.
 */
export function spriteUrl(id: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}sprites/${id}.png`;
}

async function loadOne(k: KAPLAYCtx, id: string, opt?: LoadSpriteOpt, onImage?: (img: HTMLImageElement) => void): Promise<void> {
  try {
    const img = await fetchImage(spriteUrl(id));
    await k.loadSprite(id, img, opt);
    onImage?.(img);
    loaded.add(id);
  } catch {
    loaded.delete(id);
    cellSizes.delete(id);
  }
}

/** Load every sprite in ASSETS from <BASE_URL>sprites/<id>.png. Missing files must not throw. */
export async function loadAssets(k: KAPLAYCtx): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const id of Object.keys(ASSETS.buildings)) jobs.push(loadOne(k, id));
  for (const [id, slice] of Object.entries(ASSETS.tilesets)) jobs.push(loadOne(k, id, slice));
  for (const id of ASSETS.characters) {
    const remember = (img: HTMLImageElement) => {
      const cell = cellSizeOfSheet(img.width, img.height);
      if (cell) cellSizes.set(id, cell);
    };
    jobs.push(loadOne(k, id, { sliceX: SHEET_COLS, sliceY: SHEET_ROWS, anims: characterAnims }, remember));
  }
  await Promise.allSettled(jobs);
}

/** True when the sprite loaded successfully. */
export function hasAsset(id: string): boolean {
  return loaded.has(id);
}

/** Obvious development placeholder: a magenta rect with a small label. Never silently shows wrong art. */
export function placeholderComps(k: KAPLAYCtx, w: number, h: number, label: string): Comp[] {
  const labelComp: Comp = {
    id: 'placeholder-label',
    draw() {
      k.drawText({ text: label, size: 6, pos: k.vec2(1, 1), color: k.rgb(0, 0, 0), width: Math.max(1, w - 2) });
    },
  };
  return [k.rect(w, h), k.color(255, 0, 255), k.outline(1, k.rgb(0, 0, 0)), labelComp];
}

/** Comps for the sprite `id`, or a magenta placeholder of w×h when it is missing. */
export function spriteOrPlaceholder(k: KAPLAYCtx, id: string, w: number, h: number): Comp[] {
  return hasAsset(id) ? [k.sprite(id)] : placeholderComps(k, w, h, id);
}
