// Asset contract + loader. Everyone else only uses ASSETS ids and these function
// signatures; a sprite that is missing or fails to decode renders as a magenta placeholder.
import type { Comp, KAPLAYCtx, LoadSpriteOpt, SpriteAnims } from 'kaplay';

export const ASSETS = {
  buildings: { station: [192, 128], matsushimaya: [96, 80], home: [80, 96], liebe: [80, 80] },
  tilesets: { 'tiles-outdoor': { sliceX: 8, sliceY: 6 }, 'tiles-interior': { sliceX: 8, sliceY: 6 } },
  /** Walk sheets: 3 cols (idle, stepA, stepB) × 4 rows (down, left, right, up), 16×24 cells. */
  characters: ['char-player', 'char-guide', 'char-station_staff', 'char-shopkeeper'],
} as const;

const loaded = new Set<string>();

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

async function loadOne(k: KAPLAYCtx, id: string, opt?: LoadSpriteOpt): Promise<void> {
  try {
    const img = await fetchImage(`/sprites/${id}.png`);
    await k.loadSprite(id, img, opt);
    loaded.add(id);
  } catch {
    loaded.delete(id);
  }
}

/** Load every sprite in ASSETS from /sprites/<id>.png. Missing files must not throw. */
export async function loadAssets(k: KAPLAYCtx): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const id of Object.keys(ASSETS.buildings)) jobs.push(loadOne(k, id));
  for (const [id, slice] of Object.entries(ASSETS.tilesets)) jobs.push(loadOne(k, id, slice));
  for (const id of ASSETS.characters) jobs.push(loadOne(k, id, { sliceX: 3, sliceY: 4, anims: characterAnims }));
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
