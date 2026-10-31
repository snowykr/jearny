// Track A owns src/game/. KAPLAY renders and reads input; it never owns quest state.
// startGame wires keyboard → InputBus → scene runtime → session commands (#7, #19).
import kaplay from 'kaplay';
import type { Effect, GameSession, SceneId } from '../contracts';
import { maps } from '../content/maps';
import { loadAssets } from './assets';
import { VIEW_H, VIEW_W, cameraCenter } from './camera';
import { createInputBus } from './input';
import type { InputBus } from './input';
import { createEffectDeduper } from './interaction';
import { attachKeyboard } from './keyboard';
import { playerPixel } from './player';
import { drawScene } from './render';
import { createSceneRuntime } from './scene';
import type { CommandResult, SceneRuntime } from './scene';

export { VIEW_H, VIEW_W };

interface SceneArgs {
  sceneId: SceneId;
  spawnId: string;
}

export function startGame(canvas: HTMLCanvasElement, session: GameSession): { input: InputBus } {
  const input = createInputBus();
  attachKeyboard(input);

  const k = kaplay({
    global: false,
    canvas,
    width: VIEW_W,
    height: VIEW_H,
    letterbox: true,
    crisp: true,
    background: [24, 24, 32],
  });

  let current: SceneRuntime | null = null;
  let sceneToken = 0; // bumps on every (re)entry; lets stale async results be ignored
  const dedupe = createEffectDeduper();
  let seenKey = `${session.snapshot.sceneId}@${session.snapshot.spawnId}`;

  const enter = (sceneId: SceneId, spawnId: string) => {
    sceneToken++;
    current?.dispose(); // cancel the old scene's listeners before mounting the next
    current = null;
    input.reset();
    k.go('map', { sceneId, spawnId } satisfies SceneArgs);
  };

  const handleEffects = (effects: Effect[]) => {
    for (const e of dedupe(effects)) {
      if (e.type === 'ChangeScene') {
        seenKey = `${e.sceneId}@${e.spawnId}`;
        enter(e.sceneId, e.spawnId);
      }
    }
  };

  // Snapshot-driven re-entry: only when the session's scene/spawn actually changed.
  const unsubscribe = session.subscribe((snapshot, effects) => {
    handleEffects(effects);
    const key = `${snapshot.sceneId}@${snapshot.spawnId}`;
    if (key !== seenKey) {
      seenKey = key;
      enter(snapshot.sceneId, snapshot.spawnId);
    }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });

  const onResult = (token: number) => (r: CommandResult) => {
    handleEffects(r.outcome.ok ? r.outcome.effects : []);
    // DEV FALLBACK until Track B session (#14): the stub session never emits ChangeScene,
    // so walk through the portal locally. Skipped if the session already moved us.
    if (import.meta.env.DEV && r.portal && r.outcome.ok && token === sceneToken) {
      console.warn(`[game] DEV FALLBACK: no ChangeScene for ${r.portal.id}; moving to ${r.portal.toScene}@${r.portal.toSpawn} locally`);
      enter(r.portal.toScene, r.portal.toSpawn);
    }
  };

  k.scene('map', ({ sceneId, spawnId }: SceneArgs) => {
    const map = maps[sceneId];
    const rt = createSceneRuntime({ map, spawnId, session, bus: input, onResult: onResult(sceneToken) });
    current = rt;
    const cam = (): [number, number] => {
      const [px, py] = playerPixel(rt.player, map.tileSize);
      return cameraCenter([px + map.tileSize / 2, py + map.tileSize / 2], [map.grid[0] * map.tileSize, map.grid[1] * map.tileSize]);
    };
    k.onUpdate(() => {
      rt.update(Math.min(k.dt(), 0.05));
      const [cx, cy] = cam();
      k.setCamPos(cx, cy);
    });
    k.onDraw(() => drawScene(k, rt, cam()));
    if (import.meta.env.DEV) (window as unknown as { __jearny?: unknown }).__jearny = { activeListeners: () => rt.activeListeners, sceneToken: () => sceneToken };
  });

  // Art may still be landing (#1): never block or fail on it, everything has a placeholder.
  const begin = () => enter(session.snapshot.sceneId, session.snapshot.spawnId);
  loadAssets(k).then(begin, (err: unknown) => {
    console.warn('[game] asset load failed; using placeholders', err);
    begin();
  });

  return { input };
}
