import { describe, expect, it, vi } from 'vitest';
import type { Effect, GameSession } from '../contracts';
import { ENTITY } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
import type { SaveStore } from '../storage';

// openSession wires the browser store; tests queue the store it should adopt.
const state = vi.hoisted(() => ({ stores: [] as import('../storage').SaveStore[] }));

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage')>();
  return {
    ...actual,
    createIndexedDbStore: () => {
      const store = state.stores.shift();
      if (!store) throw new Error('openSession created an unexpected store');
      return store;
    },
  };
});

import { createMemoryStore } from '../storage';
import { openSession } from './index';

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const collect = (session: GameSession): Effect[] => {
  const seen: Effect[] = [];
  session.subscribe((_snapshot, effects) => seen.push(...effects));
  return seen;
};

const savedAt = (sceneId: 'takanawa' | 'home-interior' | 'shop-interior', revision: number) => ({
  ...createInitialSnapshot('saved', content.version),
  revision,
  sceneId,
  spawnId: 'door',
});

describe('openSession boot', () => {
  it('starts a fresh snapshot and saves after the first command', async () => {
    state.stores.length = 0;
    const store = createMemoryStore();
    state.stores.push(store);

    const session = await openSession('boot-test');

    expect(session.snapshot).toMatchObject({
      contentVersion: content.version,
      revision: 0,
      sceneId: 'home-interior',
      spawnId: 'start',
    });
    expect(collect(session)).toEqual([]);

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await settle();

    const loaded = await store.load(content.version);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.slot.current.revision).toBe(1);
  });

  it('reports corrupt data once and starts over', async () => {
    state.stores.length = 0;
    state.stores.push(createMemoryStore({ current: { schemaVersion: 1 } }));

    const session = await openSession('boot-test');
    const seen = collect(session);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'ShowHint', reason: 'save_corrupt' });
    expect(session.snapshot.revision).toBe(0);
  });

  it('falls back to the previous snapshot without a warning', async () => {
    state.stores.length = 0;
    state.stores.push(
      createMemoryStore({ current: { nope: true }, previous: savedAt('shop-interior', 4) }),
    );

    const session = await openSession('boot-test');

    expect(session.snapshot.revision).toBe(4);
    expect(session.snapshot.sceneId).toBe('shop-interior');
    expect(collect(session)).toEqual([]);
  });

  it('adopts a valid save without replaying audio or bumping the revision', async () => {
    state.stores.length = 0;
    state.stores.push(createMemoryStore({ current: savedAt('shop-interior', 9) }));

    const session = await openSession('boot-test');
    const seen = collect(session);

    expect(seen).toEqual([]);
    expect(session.snapshot.revision).toBe(9);
    expect(session.snapshot.sessionId).toBe('saved');
  });

  it('blocks saving on a content-version mismatch until the explicit restart', async () => {
    state.stores.length = 0;
    const stale = createInitialSnapshot('old-run', 'content-v0');
    const store = createMemoryStore({ current: stale });
    state.stores.push(store);

    const session = await openSession('boot-test');
    const seen = collect(session);
    expect(seen[0]).toMatchObject({ type: 'ShowHint', reason: 'content_version_mismatch' });
    expect(session.snapshot.contentVersion).toBe(content.version);

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await settle();
    expect((await store.load(content.version)).status).toBe('version_mismatch');

    await session.reset?.();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await settle();
    expect((await store.load(content.version)).status).toBe('ok');
  });

  it('keeps playing when storage is unavailable', async () => {
    state.stores.length = 0;
    const unavailable: SaveStore = {
      async load() {
        return { status: 'unavailable' };
      },
      async save() {},
      async clear() {},
    };
    state.stores.push(unavailable);

    const session = await openSession('boot-test');
    const seen = collect(session);

    expect(seen[0]).toMatchObject({ type: 'ShowHint', reason: 'storage_unavailable' });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(session.snapshot.dialogue.status).not.toBe('closed');
  });
});
