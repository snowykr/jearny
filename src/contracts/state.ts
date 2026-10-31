// Shared contract (docs/ARCHITECTURE.md §5). Change only via a PR to main.

export type SceneId = 'takanawa' | 'home-interior' | 'home-2f' | 'shop-interior';
export type QuestStatus = 'not_started' | 'active' | 'ready_to_return' | 'completed';
export type DialogueStatus = 'closed' | 'showing' | 'choosing' | 'waiting_for_speech';

export interface DialogueState {
  status: DialogueStatus;
  nodeId: string | null;
  speakerId: string | null;
}

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  textSize: 'normal' | 'large';
  inputMode: 'keyboard' | 'touch';
}

export interface GameSnapshot {
  schemaVersion: 1;
  contentVersion: string;
  sessionId: string;
  revision: number;
  sceneId: SceneId;
  spawnId: string;
  inventory: Record<string, number>;
  walletYen: number;
  quests: Record<string, QuestStatus>;
  /** Facts used by quest conditions, e.g. visited:station, conversationPassed:shop_order. */
  flags: Record<string, true>;
  dialogue: DialogueState;
  cosmetics: string[];
  settings: Settings;
  /** Demo-only safe resume tile. Presentation data, never authoritative. */
  tile?: [number, number];
}
