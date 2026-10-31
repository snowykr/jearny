// Track A owns src/game/. KAPLAY renders and reads input; it never owns quest state.
// startGame wires keyboard → InputBus → scene runtime → session commands (#7, #19).
import kaplay from 'kaplay';
import type { Effect, GameSession, SceneId } from '../contracts';
import { maps } from '../content/maps';
import { loadAssets } from './assets';
import { VIEW_H, VIEW_W, sceneCamera } from './camera';
import { createInputBus } from './input';
import type { InputBus } from './input';
import { createEffectDeduper } from './interaction';
import { attachKeyboard } from './keyboard';
import { playerDrawPixel, playerPixel } from './player';
import { drawScene } from './render';
import { createSceneRuntime } from './scene';
import type { CommandResult, SceneRuntime } from './scene';
import { mountMinimap } from './minimap';
import { mountStartMenu } from './menu';
import { mountTouchControls } from './touch';

export { VIEW_H, VIEW_W };

interface SceneArgs {
  sceneId: SceneId;
  spawnId: string;
}

export function startGame(
  canvas: HTMLCanvasElement,
  session: GameSession,
  /** True while the DOM UI owns input (dialogue, settings, modal). */
  isInputBlocked: () => boolean = () => session.snapshot.dialogue.status !== 'closed',
): { input: InputBus; openMenu: () => void } {
  const input = createInputBus();
  const detachKeyboard = attachKeyboard(input);
  // D-pad + A overlay on touch devices; hidden while the DOM UI owns input. Mounted inside
  // #ui-root so it lives on the same DOM surface as the DOM UI (it still paints above it).
  const uiRoot = document.getElementById('ui-root') ?? document.body;
  // Start menu (#65): read-only snapshot window; M and the on-screen trigger toggle it.
  const menu = mountStartMenu(uiRoot, { getSnapshot: () => session.snapshot, isInputBlocked });
  // One predicate for every input surface, so walking stops the moment the menu opens.
  const blocked = () => isInputBlocked() || menu.isOpen();
  const unmountTouch = mountTouchControls(uiRoot, input, { isInputBlocked: blocked });

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

  // minimap wiring (#40): reads the player from the runtime via a getter, no DOM polling.
  const getPlayerTile = (): [number, number] | null => {
    if (!current) return null;
    const [px, py] = playerPixel(current.player, current.map.tileSize);
    return [px / current.map.tileSize, py / current.map.tileSize];
  };
  const unmountMinimap = mountMinimap(uiRoot, {
    getPlayer: () => {
      const tile = getPlayerTile();
      return current && tile ? { sceneId: current.map.id, tile } : null;
    },
    getSnapshot: () => session.snapshot,
  });

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
  const detachAll = () => {
    window.removeEventListener('pagehide', onPageHide);
    unsubscribe();
    unmountTouch();
    menu.dispose();
    unmountMinimap(); // minimap wiring (#40)
    detachKeyboard();
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return; // page may be restored from the back/forward cache
    detachAll();
  };
  window.addEventListener('pagehide', onPageHide);

  const onResult = (token: number) => (r: CommandResult) => {
    handleEffects(r.outcome.ok ? r.outcome.effects : []);
    // The session owns scene navigation: it must answer UsePortal with ChangeScene. A portal that
    // is accepted without one is a content/session bug, so surface it instead of moving locally.
    if (r.portal && r.outcome.ok && token === sceneToken) {
      console.warn(`[game] portal ${r.portal.id} accepted but produced no ChangeScene effect`);
    }
  };

  k.scene('map', ({ sceneId, spawnId }: SceneArgs) => {
    const map = maps[sceneId];
    const rt = createSceneRuntime({ map, spawnId, session, bus: input, isInputBlocked: blocked, onResult: onResult(sceneToken) });
    current = rt;
    const cam = (): [number, number] => sceneCamera(map, playerDrawPixel(rt.player, map.tileSize));
    k.onUpdate(() => {
      rt.update(Math.min(k.dt(), 0.05));
      const [cx, cy] = cam();
      k.setCamPos(cx, cy);
    });
    k.onDraw(() => drawScene(k, rt, cam()));
    if (import.meta.env.DEV) (window as unknown as { __jearny?: unknown }).__jearny = { activeListeners: () => rt.activeListeners, sceneToken: () => sceneToken };
  });

  // Art may still be landing (#1): never block or fail on it, everything has a placeholder.
  const begin = () => {
    // DEV only: ?scene=takanawa&spawn=station-deck jumps straight to a map for visual checks.
    const q = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
    const devScene = q?.get('scene') as SceneId | null | undefined;
    const devSpawn = q?.get('spawn');
    if (devScene && devScene in maps && devSpawn && devSpawn in maps[devScene].spawns) {
      seenKey = `${devScene}@${devSpawn}`;
      enter(devScene, devSpawn);
      return;
    }
    enter(session.snapshot.sceneId, session.snapshot.spawnId);
  };
  loadAssets(k).then(begin, (err: unknown) => {
    console.warn('[game] asset load failed; using placeholders', err);
    begin();
  });

  return { input, openMenu: () => menu.open() };
}
