// Shared contract (docs/ARCHITECTURE.md §5). Change only via a PR to main.
import type { GameSnapshot, SceneId, Settings } from './state';

export type CommandPayload =
  | { type: 'Interact'; entityId: string }
  | { type: 'AdvanceDialogue'; nodeId: string }
  | { type: 'CloseDialogue'; nodeId: string }
  | { type: 'Choose'; dialogueNodeId: string; choiceId: string }
  | { type: 'Buy'; shopId: string; itemId: string; quantity: number }
  | { type: 'Collect'; entityId: string }
  | { type: 'UsePortal'; portalId: string }
  | { type: 'SubmitVerifiedSpeech'; attemptId: string }
  | { type: 'Resume' };

export interface Command {
  commandId: string;
  expectedRevision: number;
  payload: CommandPayload;
}

/** Device-local; never creates a server transaction. */
export type SettingsPatch = Partial<Settings>;

export type EffectPayload =
  | { type: 'ShowDialogue'; nodeId: string }
  | { type: 'PlayLine'; lineId: string }
  | { type: 'ChangeScene'; sceneId: SceneId; spawnId: string }
  | { type: 'ShowHint'; reason: string }
  | { type: 'CompleteQuest'; questId: string };

/** `id` is derived from the command receipt so clients can deduplicate retries. */
export type Effect = EffectPayload & { id: string };

export type RejectReason =
  | 'stale_revision'
  | 'unknown_entity'
  | 'not_available'
  | 'insufficient_funds'
  | 'capacity_exceeded'
  | 'prerequisite_missing'
  | 'invalid_choice'
  | 'invalid_portal';

export type Outcome =
  | { ok: true; snapshot: GameSnapshot; effects: Effect[] }
  | { ok: false; reason: RejectReason; snapshot: GameSnapshot };
