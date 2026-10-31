// Grid-walking state machine. Pure (no KAPLAY): scene.ts feeds it input, render.ts reads it.
import type { MapDefinition, Tile } from '../contracts';
import type { Dir } from './input';
import { DELTA, facingTile, isBlocked } from './interaction';

export const STEP_SECONDS = 0.15;
/** A direction tap that changes facing turns in place for this long before walking starts. */
export const TURN_SECONDS = 0.08;

export interface PlayerState {
  tile: Tile;
  facing: Dir;
  /** Set while a step is in flight; `tile` is still the origin until it lands. */
  to: Tile | null;
  progress: number;
  /** Alternates every step so the walk cycle swaps feet. */
  parity: 0 | 1;
  turnTimer: number;
}

export interface StepInput {
  heldDir: Dir | null;
  /** Direction pressed since the last update (so a tap shorter than a frame still turns). */
  tapDir: Dir | null;
  /** False while a dialogue is open or a command is in flight. */
  canAct: boolean;
}

export const createPlayer = (tile: Tile, facing: Dir = 'down'): PlayerState => ({
  tile, facing, to: null, progress: 0, parity: 0, turnTimer: 0,
});

/** Advances the player; returns the tile just arrived on, if a step finished. */
export function updatePlayer(p: PlayerState, map: MapDefinition, dt: number, input: StepInput): Tile | null {
  let arrived: Tile | null = null;
  if (p.to) {
    p.progress += dt / STEP_SECONDS;
    if (p.progress >= 1) {
      p.tile = p.to;
      p.to = null;
      p.progress = 0;
      p.parity = p.parity === 0 ? 1 : 0;
      arrived = p.tile;
    }
  }
  if (p.to) return arrived;

  const canAct = input.canAct && !arrived; // a portal/zone arrival must be handled before the next step
  if (!canAct) {
    if (!input.canAct) p.turnTimer = 0;
    return arrived;
  }
  if (p.turnTimer > 0) p.turnTimer -= dt;
  if (input.tapDir && input.tapDir !== p.facing) {
    p.facing = input.tapDir;
    p.turnTimer = TURN_SECONDS;
  }
  const dir = input.heldDir;
  if (!dir || p.turnTimer > 0) return arrived;
  if (dir !== p.facing) {
    p.facing = dir;
    p.turnTimer = TURN_SECONDS;
    return arrived;
  }
  const next = facingTile(p.tile, dir);
  if (!isBlocked(map, next)) {
    p.to = next;
    p.progress = 0;
  }
  return arrived;
}

/** Interpolated top-left pixel of the player's tile. */
export function playerPixel(p: PlayerState, ts: number): [number, number] {
  const [dx, dy] = p.to ? DELTA[p.facing] : [0, 0];
  const t = p.to ? p.progress : 0;
  return [(p.tile[0] + dx * t) * ts, (p.tile[1] + dy * t) * ts];
}
