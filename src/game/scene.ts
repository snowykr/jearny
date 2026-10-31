// Per-scene runtime: owns the player, turns input/arrivals into commands (#19) and
// tears down every listener on dispose (#7). No KAPLAY imports, so it runs under vitest.
import type { CommandPayload, GameSession, MapDefinition, Outcome, Portal, Tile } from '../contracts';
import { DELTA, arrivalCommand, interactCommand } from './interaction';
import type { Dir, InputBus } from './input';
import { createPlayer, updatePlayer } from './player';
import type { PlayerState } from './player';

export interface CommandResult {
  payload: CommandPayload;
  outcome: Outcome;
  /** Set when the command was a UsePortal. */
  portal: Portal | null;
}

export interface SceneRuntimeOptions {
  map: MapDefinition;
  spawnId: string;
  session: GameSession;
  bus: InputBus;
  onResult(result: CommandResult): void;
}

export interface SceneRuntime {
  readonly map: MapDefinition;
  readonly player: PlayerState;
  /** Pixel offset of the rejected-command bump. */
  bumpOffset(): [number, number];
  update(dt: number): void;
  /** Subscriptions still alive; must be 0 after dispose (leak check). */
  readonly activeListeners: number;
  dispose(): void;
}

const BUMP_SECONDS = 0.2;
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function spawnTile(map: MapDefinition, spawnId: string): Tile {
  return map.spawns[spawnId] ?? Object.values(map.spawns)[0] ?? [1, 1];
}

/** Face away from a nearby portal (you just came through it); otherwise face down. */
export function spawnFacing(map: MapDefinition, tile: Tile): Dir {
  let best: { d: number; dir: Dir } | null = null;
  for (const p of map.portals) {
    const dx = p.tile[0] - tile[0];
    const dy = p.tile[1] - tile[1];
    const d = Math.abs(dx) + Math.abs(dy);
    if (d === 0 || d > 3) continue;
    const toward: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (!best || d < best.d) best = { d, dir: OPPOSITE[toward] };
  }
  return best?.dir ?? 'down';
}

export function createSceneRuntime(opts: SceneRuntimeOptions): SceneRuntime {
  const { map, session, bus } = opts;
  const start = spawnTile(map, opts.spawnId);
  const player = createPlayer(start, spawnFacing(map, start));
  const unsubs: Array<() => void> = [];

  let tapDir: Dir | null = null;
  let zoneId = arrivalCommand(map, start, null).zoneId; // spawning inside a zone is not an "entry"
  let busy = false;
  let bumpT = 0;
  let wasClosed = true;
  let disposed = false;

  const dialogueClosed = () => session.snapshot.dialogue.status === 'closed';

  const send = (payload: CommandPayload) => {
    const portal = payload.type === 'UsePortal' ? (map.portals.find((p) => p.id === payload.portalId) ?? null) : null;
    busy = true;
    session
      .dispatch(payload)
      .then((outcome) => {
        if (!outcome.ok) bumpT = BUMP_SECONDS; // rejected: feedback only, no state change
        opts.onResult({ payload, outcome, portal });
      })
      .catch((err: unknown) => {
        console.error('[game] dispatch failed', payload, err);
        bumpT = BUMP_SECONDS;
      })
      .finally(() => {
        busy = false;
      });
  };

  unsubs.push(
    bus.onPress((action) => {
      if (disposed) return;
      if (action === 'interact') {
        if (!dialogueClosed() || busy || player.to) return;
        const cmd = interactCommand(map, player.tile, player.facing);
        if (cmd) send(cmd);
      } else {
        tapDir = action;
      }
    }),
  );

  return {
    map,
    player,
    bumpOffset() {
      if (bumpT <= 0) return [0, 0];
      const k = Math.sin(Math.PI * (1 - bumpT / BUMP_SECONDS)) * 3;
      return [Math.round(DELTA[player.facing][0] * k), Math.round(DELTA[player.facing][1] * k)];
    },
    update(dt) {
      if (disposed) return;
      bumpT = Math.max(0, bumpT - dt);
      const closed = dialogueClosed();
      if (wasClosed && !closed) {
        bus.reset(); // dialogue opened: drop held keys so nothing walks on close
        tapDir = null;
      }
      wasClosed = closed;
      const canAct = closed && !busy;
      const arrived = updatePlayer(player, map, dt, { heldDir: closed ? bus.heldDir() : null, tapDir: canAct ? tapDir : null, canAct });
      tapDir = null;
      if (arrived) {
        const r = arrivalCommand(map, arrived, zoneId);
        zoneId = r.zoneId;
        if (r.command) send(r.command);
      }
    },
    get activeListeners() {
      return unsubs.length;
    },
    dispose() {
      disposed = true;
      unsubs.splice(0).forEach((u) => u());
    },
  };
}
