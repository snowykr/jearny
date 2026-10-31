import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from './initial';

describe('initial snapshot', () => {
  it('starts at home with the fictional quest budget', () => {
    const s = createInitialSnapshot('test', 'takanawa-v1');
    expect(s.sceneId).toBe('home-interior');
    expect(s.spawnId).toBe('start');
    expect(s.walletYen).toBe(1000);
    expect(s.contentVersion).toBe('takanawa-v1');
    expect(s.revision).toBe(0);
    expect(s.quests['first-neighborhood-trip']).toBe('not_started');
    expect(s.dialogue.status).toBe('closed');
  });
});
