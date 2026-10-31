// Track B owns src/domain/. Pure: no KAPLAY, DOM, storage or network imports.
import type { GameSnapshot } from '../contracts';

export const CONTENT_VERSION = 'takanawa-v1';

export function createInitialSnapshot(sessionId: string): GameSnapshot {
  return {
    schemaVersion: 1,
    contentVersion: CONTENT_VERSION,
    sessionId,
    revision: 0,
    sceneId: 'home-interior',
    spawnId: 'start',
    inventory: {},
    walletYen: 1000,
    quests: { 'first-neighborhood-trip': 'not_started' },
    flags: {},
    dialogue: { status: 'closed', nodeId: null, speakerId: null },
    cosmetics: [],
    settings: { volume: 0.8, muted: false, textSize: 'normal', inputMode: 'keyboard' },
  };
}
