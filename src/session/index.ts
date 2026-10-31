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
import { createIndexedDbStore, type SaveStore } from '../storage';

const MAX_EFFECT_IDS = 100;

export interface SessionDeps {
  content: WorldContent;
  store: SaveStore;
  initial?: GameSnapshot;
}

export interface SessionOptions extends SessionDeps {
  /** Effects replayed to the first subscriber, e.g. a corrupt-save notice. */
  bootEffects?: Effect[];
}

function mergeSettings(current: GameSnapshot['settings'], patch: SettingsPatch): GameSnapshot['settings'] {
  const next = { ...current };
  if (typeof patch.volume === 'number') next.volume = Math.min(1, Math.max(0, patch.volume));
  if (typeof patch.muted === 'boolean') next.muted = patch.muted;
  if (patch.textSize === 'normal' || patch.textSize === 'large') next.textSize = patch.textSize;
  if (patch.inputMode === 'keyboard' || patch.inputMode === 'touch') next.inputMode = patch.inputMode;
  return next;
}

export function createSession(options: SessionOptions): GameSession {
  const { content, store } = options;
  let snapshot: GameSnapshot =
    options.initial ?? createInitialSnapshot(`${Date.now()}`, content.version);
  const listeners = new Set<(snapshot: GameSnapshot, effects: Effect[]) => void>();
  const appliedCommands = new Set<string>();
  const seenEffectIds: string[] = [];
  let pending: Effect[] = [...(options.bootEffects ?? [])];
  let sequence = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const dedupe = (effects: Effect[]): Effect[] => {
    const fresh = effects.filter((effect) => !seenEffectIds.includes(effect.id));
    for (const effect of fresh) seenEffectIds.push(effect.id);
    while (seenEffectIds.length > MAX_EFFECT_IDS) seenEffectIds.shift();
    return fresh;
  };

  const notify = (effects: Effect[] = []): void => {
    const delivered = [...pending, ...effects];
    pending = [];
    for (const listener of listeners) {
      try {
        listener(snapshot, delivered);
      } catch (error) {
        console.error('[session] listener failed', error);
      }
    }
  };

  const persist = (): void => {
    void store.save(snapshot).catch((error: unknown) => {
      console.warn('[session] save failed', error);
    });
  };

  const execute = (command: Command): Outcome => {
    // Retried transport => the same command id must not advance state twice.
    if (appliedCommands.has(command.commandId)) return { ok: true, snapshot, effects: [] };
    const before = snapshot.revision;
    const outcome = reduce(snapshot, command, content);
    if (!outcome.ok) {
      // A rejection is still worth showing: the UI turns this into a hint toast.
      notify(dedupe([
        { type: 'ShowHint', reason: outcome.reason, id: `${command.commandId}:reject` },
      ]));
      return outcome;
    }
    snapshot = outcome.snapshot;
    appliedCommands.add(command.commandId);
    if (appliedCommands.size > 500) {
      const oldest = appliedCommands.values().next().value;
      if (oldest !== undefined) appliedCommands.delete(oldest);
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

  return {
    get snapshot() {
      return snapshot;
    },
    dispatch(payload: CommandPayload) {
      // Stamp at run time: commands queued together must not share a revision.
      return enqueue(() =>
        execute({
          commandId: `${snapshot.sessionId}:c${++sequence}`,
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
    async close() {
      listeners.clear();
      pending = [];
      queue = Promise.resolve();
    },
  };
}

const CORRUPT_SAVE: Effect = {
  type: 'ShowHint',
  reason: 'content_version_mismatch',
  id: 'boot:corrupt-save',
};

export const openSession: OpenSession = async (worldId) => {
  const store = createIndexedDbStore();
  const loaded = await store.load(gameContent.version);
  const slot = loaded.status === 'ok' ? loaded.slot : null;
  const initial = slot?.current ?? createInitialSnapshot(`${worldId}-${Date.now()}`, gameContent.version);
  const session = createSession({
    content: gameContent,
    store,
    initial,
    ...(loaded.status === 'corrupt' ? { bootEffects: [CORRUPT_SAVE] } : {}),
  });
  if (slot) await session.dispatch({ type: 'Resume' });
  return session;
};
