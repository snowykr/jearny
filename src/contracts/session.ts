// Shared contract (docs/ARCHITECTURE.md §5). Change only via a PR to main.
// Track B implements this; Track A's scenes and main.ts consume it.
import type { Command, CommandPayload, Effect, Outcome, SettingsPatch } from './commands';
import type { GameSnapshot } from './state';

export type SessionListener = (snapshot: GameSnapshot, effects: Effect[]) => void;

export interface GameSession {
  readonly snapshot: GameSnapshot;
  /** Wraps the payload with commandId and expectedRevision. */
  dispatch(payload: CommandPayload): Promise<Outcome>;
  /** Low-level form for retries that must reuse a commandId. */
  dispatchCommand(command: Command): Promise<Outcome>;
  updateSettings(patch: SettingsPatch): void;
  /** Returns an unsubscribe function. Called immediately with the current snapshot. */
  subscribe(listener: SessionListener): () => void;
  /** Drops the saved slot and starts a fresh session. Optional for read-only clients. */
  reset?(): Promise<void>;
  close(): Promise<void>;
}

export type OpenSession = (worldId: string) => Promise<GameSession>;
