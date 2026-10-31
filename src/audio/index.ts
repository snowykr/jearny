// Track B owns src/audio/. STUB: logs PlayLine effects. Real version plays
// public/audio/ clips from the voice manifest, one NPC clip at a time.
import type { Effect } from '../contracts';

export function handleAudioEffects(effects: Effect[]): void {
  for (const e of effects) if (e.type === 'PlayLine') console.debug('[audio stub] play', e.lineId);
}
