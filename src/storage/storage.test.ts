import { describe, expect, it } from 'vitest';
import { SCENE_IDS } from '../contracts';
import { createInitialSnapshot } from '../domain';
import { createMemoryStore, decodeSnapshot, readSlot } from './index';

const version = 'takanawa-v1';
const valid = () => structuredClone(createInitialSnapshot('save-test', version));

describe('storage: snapshot validation', () => {
  it('accepts a well-formed snapshot and returns a detached copy', () => {
    const source = valid();
    const decoded = decodeSnapshot(source);
    expect(decoded).toEqual(source);
    expect(decoded).not.toBe(source);
  });

  it.each([
    ['schema version', (s: Record<string, unknown>) => (s.schemaVersion = 2)],
    ['negative wallet', (s: Record<string, unknown>) => (s.walletYen = -1)],
    ['fractional revision', (s: Record<string, unknown>) => (s.revision = 1.5)],
    ['unknown scene', (s: Record<string, unknown>) => (s.sceneId = 'moon')],
    ['unknown dialogue status', (s: Record<string, unknown>) => ((s.dialogue as Record<string, unknown>).status = 'open')],
    ['bad volume', (s: Record<string, unknown>) => ((s.settings as Record<string, unknown>).volume = 2)],
    ['negative item count', (s: Record<string, unknown>) => (s.inventory = { mochi: -1 })],
    ['non-boolean flag', (s: Record<string, unknown>) => (s.flags = { 'visited:station': 'yes' })],
    ['missing cosmetics', (s: Record<string, unknown>) => delete s.cosmetics],
    ['unknown quest status', (s: Record<string, unknown>) => (s.quests = { trip: 'done' })],
  ])('rejects corrupt data: %s', (_name, corrupt) => {
    const snapshot = valid() as unknown as Record<string, unknown>;
    corrupt(snapshot);
    expect(decodeSnapshot(snapshot)).toBeNull();
  });

  it.each(SCENE_IDS)('accepts a save in scene %s', (sceneId) => {
    const snapshot = valid();
    snapshot.sceneId = sceneId;
    expect(decodeSnapshot(snapshot)?.sceneId).toBe(sceneId);
  });

  it('rejects non-objects and arrays', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('save')).toBeNull();
    expect(decodeSnapshot([])).toBeNull();
  });
});

describe('storage: slot selection', () => {
  it('distinguishes an empty store from corrupt data', () => {
    expect(readSlot(undefined, version)).toEqual({ status: 'empty' });
    expect(readSlot({}, version)).toEqual({ status: 'corrupt' });
    expect(readSlot('garbage', version)).toEqual({ status: 'corrupt' });
  });

  it('falls back to the previous snapshot when the current one is corrupt', () => {
    const previous = valid();
    const loaded = readSlot({ current: { schemaVersion: 99 }, previous }, version);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.slot.current).toEqual(previous);
    expect(loaded.slot.previous).toBeNull();
  });

  it('reports a version mismatch instead of rewriting it', () => {
    const stale = valid();
    stale.contentVersion = 'takanawa-v0';
    expect(readSlot({ current: stale }, version)).toEqual({
      status: 'version_mismatch',
      foundVersion: 'takanawa-v0',
    });
  });
});

describe('storage: memory store', () => {
  it('round-trips current and previous snapshots', async () => {
    const store = createMemoryStore();
    const first = createInitialSnapshot('one', version);
    const second = { ...createInitialSnapshot('two', version), revision: 3 };

    expect(await store.load(version)).toEqual({ status: 'empty' });
    await store.save(first);
    await store.save(second);

    const loaded = await store.load(version);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.slot.current).toEqual(second);
    expect(loaded.slot.previous).toEqual(first);

    await store.clear();
    expect(await store.load(version)).toEqual({ status: 'empty' });
  });

  it('never returns a snapshot for another content version', async () => {
    const store = createMemoryStore();
    await store.save(createInitialSnapshot('one', version));
    expect((await store.load('takanawa-v2')).status).toBe('version_mismatch');
  });
});
