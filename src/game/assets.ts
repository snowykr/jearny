// Asset contract. Issue #1 implements loading + magenta placeholders; everyone
// else only uses ASSETS ids and these function signatures.
import type { KAPLAYCtx } from 'kaplay';

export const ASSETS = {
  buildings: { station: [192, 128], matsushimaya: [96, 80], home: [80, 96], liebe: [80, 80] },
  tilesets: { 'tiles-outdoor': { sliceX: 8, sliceY: 6 }, 'tiles-interior': { sliceX: 8, sliceY: 4 } },
  /** Walk sheets: 3 cols (idle, stepA, stepB) × 4 rows (down, left, right, up), 16×24 cells. */
  characters: ['char-player', 'char-guide', 'char-station_staff', 'char-shopkeeper'],
} as const;

/** Load every sprite in ASSETS from /sprites/<id>.png. Missing files must not throw. */
export async function loadAssets(_k: KAPLAYCtx): Promise<void> {
  // STUB — #1 implements. Until then everything renders as placeholder.
}

/** True when the sprite loaded successfully. */
export function hasAsset(_id: string): boolean {
  return false;
}
