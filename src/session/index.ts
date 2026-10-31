// Local session (docs/ARCHITECTURE.md §5, §8): one command queue, revision
// checks, idempotent command ids, deduplicated effects and passive saves.
import type {
  Command,
  CommandPayload,
  Effect,
  GameSession,
  GameSnapshot,
  OpenSession,
  Outcome,
  SettingsPatch,
} from '../contracts';
import { content as gameContent, type WorldContent } from '../content';
import { createInitialSnapshot, reduce } from '../domain';
import { createIndexedDbStore, decodeSnapshot, type SaveStore } from '../storage';

const MAX_EFFECT_IDS = 100;
const MAX_APPLIED_COMMANDS = 500;

export interface SessionDeps {
  content: WorldContent;
  store: SaveStore;
  initial?: GameSnapshot;
}

export interface SessionOptions extends SessionDeps {
  /** Effects replayed to every subscriber until the first command, e.g. a save notice. */
  bootEffects?: Effect[];
  /** A mismatched save must not be overwritten until the player confirms a restart. */
  saveBlocked?: boolean;
}

function mergeSettings(current: GameSnapshot['settings'], patch: SettingsPatch): GameSnapshot['settings'] {
  const next = { ...current };
  if (typeof patch.volume === 'number' && Number.isFinite(patch.volume))
    next.volume = Math.min(1, Math.max(0, patch.volume));
  if (typeof patch.muted === 'boolean') next.muted = patch.muted;
  if (patch.textSize === 'normal' || patch.textSize === 'large') next.textSize = patch.textSize;
  if (patch.inputMode === 'keyboard' || patch.inputMode === 'touch') next.inputMode = patch.inputMode;
  return next;
}

let bootSequence = 0;

export function createSession(options: SessionOptions): GameSession {
  const { content, store } = options;
  let snapshot: GameSnapshot =
    options.initial ?? createInitialSnapshot(`${Date.now()}`, content.version);
  const listeners = new Set<(snapshot: GameSnapshot, effects: Effect[]) => void>();
  const applied = new Map<string, string>();
  const seenEffectIds: string[] = [];
  let pending: Effect[] = [...(options.bootEffects ?? [])];
  let saveBlocked = options.saveBlocked ?? false;
  let saveFailed = false;
  let saveChain: Promise<void> = Promise.resolve();
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();

  const dedupe = (effects: Effect[]): Effect[] => {
    const fresh = effects.filter((effect) => !seenEffectIds.includes(effect.id));
    for (const effect of fresh) seenEffectIds.push(effect.id);
    while (seenEffectIds.length > MAX_EFFECT_IDS) seenEffectIds.shift();
    return fresh;
  };

  const notify = (effects: Effect[] = []): void => {
    // Boot effects are delivered by subscribe(); a command must not replay them.
    pending = [];
    for (const listener of listeners) {
      try {
        listener(snapshot, effects);
      } catch (error) {
        console.error('[session] listener failed', error);
      }
    }
  };

  const persist = (): void => {
    if (saveBlocked) return;
    const toSave = snapshot;
    saveChain = saveChain.then(async () => {
      if (!decodeSnapshot(toSave)) {
        console.warn('[session] refusing to save an invalid snapshot');
        return;
      }
      try {
        await store.save(toSave);
        saveFailed = false;
      } catch (error) {
        console.warn('[session] save failed', error);
        if (!saveFailed) {
          saveFailed = true;
          notify([
            {
              type: 'ShowHint',
              reason: 'storage_unavailable',
              id: `boot:save-failed:${++bootSequence}`,
            },
          ]);
        }
      }
    });
  };

  const execute = (command: Command): Outcome => {
    if (closed) return { ok: false, reason: 'not_available', snapshot };
    const payloadKey = JSON.stringify(command.payload);
    const previousPayload = applied.get(command.commandId);
    // Retried transport => the same command id must not advance state twice.
    if (previousPayload !== undefined) {
      if (previousPayload !== payloadKey) return { ok: false, reason: 'not_available', snapshot };
      return { ok: true, snapshot, effects: [] };
    }

    const before = snapshot.revision;
    const outcome = reduce(snapshot, command, content);
    if (!outcome.ok) {
      // A rejection is still worth showing: the UI turns this into a hint toast.
      notify(
        dedupe([
          { type: 'ShowHint', reason: outcome.reason, id: `${command.commandId}:reject` },
        ]),
      );
      return outcome;
    }
    snapshot = outcome.snapshot;
    applied.set(command.commandId, payloadKey);
    if (applied.size > MAX_APPLIED_COMMANDS) {
      const oldest = applied.keys().next().value;
      if (oldest !== undefined) applied.delete(oldest);
    }
    const effects = dedupe(outcome.effects);
    if (snapshot.revision !== before) persist();
    notify(effects);
    return { ok: true, snapshot, effects };
  };

  const enqueue = (task: () => Outcome): Promise<Outcome> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  const newCommandId = (): string => {
    const suffix =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${++bootSequence}`;
    return `${snapshot.sessionId}:${suffix}`;
  };

  return {
    get snapshot() {
      return snapshot;
    },
    dispatch(payload: CommandPayload) {
      // Stamp at run time: commands queued together must not share a revision.
      return enqueue(() =>
        execute({
          commandId: newCommandId(),
          expectedRevision: snapshot.revision,
          payload,
        }),
      );
    },
    dispatchCommand(command: Command) {
      return enqueue(() => execute(command));
    },
    updateSettings(patch: SettingsPatch) {
      const settings = mergeSettings(snapshot.settings, patch);
      if (JSON.stringify(settings) === JSON.stringify(snapshot.settings)) return;
      snapshot = { ...snapshot, settings };
      persist();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot, [...pending]);
      return () => listeners.delete(listener);
    },
    async reset() {
      await store.clear();
      snapshot = createInitialSnapshot(globalThis.crypto.randomUUID(), content.version);
      applied.clear();
      seenEffectIds.length = 0;
      saveBlocked = false;
      saveFailed = false;
      notify();
    },
    async close() {
      closed = true;
      await queue.catch(() => undefined);
      await saveChain;
      listeners.clear();
      pending = [];
    },
  };
}

function bootEffect(reason: string): Effect {
  return { type: 'ShowHint', reason, id: `boot:${reason}:${++bootSequence}` };
}

export const openSession: OpenSession = async (worldId) => {
  const store = createIndexedDbStore();
  const loaded = await store.load(gameContent.version);
  const slot = loaded.status === 'ok' ? loaded.slot : null;
  const bootEffects: Effect[] = [];
  if (loaded.status === 'corrupt') bootEffects.push(bootEffect('save_corrupt'));
  if (loaded.status === 'version_mismatch') bootEffects.push(bootEffect('content_version_mismatch'));
  if (loaded.status === 'unavailable') bootEffects.push(bootEffect('storage_unavailable'));
  const session = createSession({
    content: gameContent,
    store,
    initial: slot?.current ?? createInitialSnapshot(`${worldId}-${Date.now()}`, gameContent.version),
    ...(bootEffects.length > 0 ? { bootEffects } : {}),
    ...(loaded.status === 'version_mismatch' ? { saveBlocked: true } : {}),
  });
  if (slot) await session.dispatch({ type: 'Resume' });
  return session;
};
