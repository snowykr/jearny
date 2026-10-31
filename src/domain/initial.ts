// Track B owns src/domain/. Pure: no KAPLAY, DOM, storage or network imports.
import type { GameSnapshot } from '../contracts';
import { QUEST } from '../contracts';

export function createInitialSnapshot(sessionId: string, contentVersion: string): GameSnapshot {
  return {
    schemaVersion: 1,
    contentVersion,
    sessionId,
    revision: 0,
    sceneId: 'home-interior',
    spawnId: 'start',
    inventory: {},
    walletYen: 1000,
    quests: { [QUEST.firstTrip]: 'not_started' },
    flags: {},
    dialogue: { status: 'closed', nodeId: null, speakerId: null },
    cosmetics: [],
    settings: { volume: 0.8, muted: false, textSize: 'normal', inputMode: 'keyboard' },
  };
}
