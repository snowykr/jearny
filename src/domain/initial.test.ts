import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from './initial';

describe('initial snapshot', () => {
  it('starts at home with the fictional quest budget', () => {
    const s = createInitialSnapshot('test');
    expect(s.sceneId).toBe('home-interior');
    expect(s.walletYen).toBe(1000);
    expect(s.quests['first-neighborhood-trip']).toBe('not_started');
  });
});
