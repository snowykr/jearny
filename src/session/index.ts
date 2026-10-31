// Track B owns src/session/. This is a STUB so Track A can run scenes today:
// it accepts every command, bumps the revision and only handles UsePortal naively.
// Replace with the real reducer-backed local session.
import type { Command, CommandPayload, GameSession, GameSnapshot, OpenSession, Outcome, SessionListener } from '../contracts';
import { createInitialSnapshot } from '../domain/initial';

export const openSession: OpenSession = async (worldId) => {
  let snapshot: GameSnapshot = createInitialSnapshot(`${worldId}-${Date.now()}`);
  const listeners = new Set<SessionListener>();
  let seq = 0;

  const dispatchCommand = async (command: Command): Promise<Outcome> => {
    if (command.expectedRevision !== snapshot.revision) return { ok: false, reason: 'stale_revision', snapshot };
    console.debug('[stub session]', command.payload);
    snapshot = { ...snapshot, revision: snapshot.revision + 1 };
    const outcome: Outcome = { ok: true, snapshot, effects: [] };
    listeners.forEach((l) => l(snapshot, outcome.effects));
    return outcome;
  };

  const session: GameSession = {
    get snapshot() { return snapshot; },
    dispatch: (payload: CommandPayload) =>
      dispatchCommand({ commandId: `c${++seq}`, expectedRevision: snapshot.revision, payload }),
    dispatchCommand,
    updateSettings(patch) {
      snapshot = { ...snapshot, settings: { ...snapshot.settings, ...patch } };
      listeners.forEach((l) => l(snapshot, []));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot, []);
      return () => listeners.delete(listener);
    },
    async close() { listeners.clear(); },
  };
  return session;
};
