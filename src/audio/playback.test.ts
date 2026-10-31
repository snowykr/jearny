// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Effect } from '../contracts';

class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectNext = false;
  src: string;
  volume = 1;
  muted = false;
  currentTime = 0;
  paused = true;
  play = vi.fn(() => {
    if (FakeAudio.rejectNext) {
      FakeAudio.rejectNext = false;
      return Promise.reject(new Error('autoplay blocked'));
    }
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

const line = (name: string) => ({
  path: `/audio/${name}.mp3`,
  hash: name,
  voiceId: 'voice',
  modelId: 'eleven_multilingual_v2',
  status: 'generated_pending_listening_review',
});

const manifest = {
  version: 1,
  lines: {
    'guide.intro': line('guide'),
    'station.directions': line('station'),
  },
};

const respondWith = (body: unknown, ok = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body })),
  );
};

const playLine = (lineId: string, id = 'cmd:0'): Effect => ({ type: 'PlayLine', lineId, id });
const changeScene = (id = 'cmd:1'): Effect => ({
  type: 'ChangeScene',
  sceneId: 'shop-interior',
  spawnId: 'door',
  id,
});

/** Lets the manifest promise chain and the play() rejection settle. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  vi.resetModules();
  FakeAudio.instances = [];
  FakeAudio.rejectNext = false;
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('audio playback', () => {
  it('plays the published clip for a PlayLine effect', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro')]);
    await settle();

    expect(FakeAudio.instances.map((clip) => clip.src)).toEqual(['/audio/guide.mp3']);
    expect(FakeAudio.instances[0]?.paused).toBe(false);
  });

  it('keeps at most one NPC clip active', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro', 'a:0')]);
    await settle();
    audio.handleAudioEffects([playLine('station.directions', 'b:1')]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[0]?.paused).toBe(true);
    expect(FakeAudio.instances[1]?.paused).toBe(false);
  });

  it('stops and rewinds the clip on ChangeScene', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro')]);
    await settle();
    const clip = FakeAudio.instances[0];
    expect(clip?.paused).toBe(false);

    audio.handleAudioEffects([changeScene()]);

    expect(clip?.paused).toBe(true);
    expect(clip?.currentTime).toBe(0);
  });

  it('never plays a duplicated effect id twice', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro', 'a:0')]);
    await settle();
    audio.handleAudioEffects([playLine('guide.intro', 'a:0')]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('stays silent when the manifest is missing', async () => {
    respondWith(null, false);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro')]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('stays silent for an unknown line id', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('shop.not-there')]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('treats a rejected play() as silence and keeps later lines working', async () => {
    respondWith(manifest);
    const audio = await import('./index');
    FakeAudio.rejectNext = true;

    audio.handleAudioEffects([playLine('guide.intro', 'a:0')]);
    await settle();
    audio.handleAudioEffects([playLine('station.directions', 'b:1')]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1]?.paused).toBe(false);
  });

  it('does not start a clip when the scene changes while the manifest loads', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.handleAudioEffects([playLine('guide.intro')]);
    audio.handleAudioEffects([changeScene()]);
    await settle();

    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('applies mute and volume settings', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.applyAudioSettings({ muted: true, volume: 0.4 });
    audio.handleAudioEffects([playLine('guide.intro', 'a:0')]);
    await settle();
    expect(FakeAudio.instances).toHaveLength(0);

    audio.applyAudioSettings({ muted: false, volume: 0.4 });
    audio.handleAudioEffects([playLine('station.directions', 'b:1')]);
    await settle();
    expect(FakeAudio.instances[0]?.volume).toBe(0.4);

    const clip = FakeAudio.instances[0];
    audio.applyAudioSettings({ muted: true, volume: 0.2 });
    expect(clip?.muted).toBe(true);
    expect(clip?.volume).toBe(0.2);
  });

  it('replays one line on demand without advancing anything', async () => {
    respondWith(manifest);
    const audio = await import('./index');

    audio.replayAudio('guide.intro');
    await settle();

    expect(FakeAudio.instances.map((clip) => clip.src)).toEqual(['/audio/guide.mp3']);
  });
});
