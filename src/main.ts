// Composition root (shared seam). Keep it tiny: each track plugs in through
// its public module API, so this file should rarely change.
import { openSession } from './session';
import { startGame } from './game';
import { mountUi } from './ui';
import { handleAudioEffects } from './audio';

const session = await openSession('takanawa-v1');
session.subscribe((_snapshot, effects) => handleAudioEffects(effects));
mountUi(document.getElementById('ui-root')!, session);
startGame(document.getElementById('game') as HTMLCanvasElement, session);
