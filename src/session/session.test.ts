import { describe, expect, it } from 'vitest';
import type { Command, Effect } from '../contracts';
import { ENTITY, PORTAL } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
import { createMemoryStore } from '../storage';
import { createSession } from './index';

function make(options: { bootEffects?: Effect[] } = {}) {
  const store = createMemoryStore();
  const session = createSession({
    content,
    store,
    initial: createInitialSnapshot('session-test', content.version),
    ...options,
  });
  return { session, store };
}

describe('session: idempotency and revisions', () => {
  it('applies the same commandId once', async () => {
    const { session } = make();
    const command: Command = {
      commandId: 'retry-me',
      expectedRevision: 0,
      payload: { type: 'Interact', entityId: ENTITY.guide },
    };
    const first = await session.dispatchCommand(command);
    expect(first.ok).toBe(true);
    expect(session.snapshot.revision).toBe(1);

    const second = await session.dispatchCommand(command);
    expect(second).toEqual({ ok: true, snapshot: session.snapshot, effects: [] });
    expect(session.snapshot.revision).toBe(1);
  });

  it('reports a stale revision without mutating', async () => {
    const { session } = make();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    const stale = await session.dispatchCommand({
      commandId: 'stale',
      expectedRevision: 0,
      payload: { type: 'UsePortal', portalId: PORTAL.homeExit },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe('stale_revision');
    expect(session.snapshot.revision).toBe(1);
    expect(session.snapshot.sceneId).toBe('home-interior');
  });

  it('serializes concurrent dispatches in order', async () => {
    const { session } = make();
    const [a, b] = await Promise.all([
      session.dispatch({ type: 'Interact', entityId: ENTITY.guide }),
      session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(session.snapshot.revision).toBe(2);
    expect(session.snapshot.sceneId).toBe('takanawa');
  });
});

describe('session: effects, settings and saves', () => {
  it('forwards the snapshot immediately and deduplicates effect ids', async () => {
    const { session } = make();
    const seen: string[] = [];
    const unsubscribe = session.subscribe((_snapshot, effects) => {
      seen.push(...effects.map((effect) => effect.id));
    });
    expect(seen).toHaveLength(0);

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(seen.length);
    unsubscribe();
  });

  it('keeps settings device-local without bumping the revision', async () => {
    const { session } = make();
    session.updateSettings({ muted: true, volume: 0.3, textSize: 'large' });
    expect(session.snapshot.settings).toMatchObject({ muted: true, volume: 0.3, textSize: 'large' });
    expect(session.snapshot.revision).toBe(0);

    session.updateSettings({ volume: 4 });
    expect(session.snapshot.settings.volume).toBe(1);
  });

  it('saves only after a successful command and restores current + previous', async () => {
    const { session, store } = make();
    const empty = await store.load(content.version);
    expect(empty.status).toBe('empty');

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    const first = await store.load(content.version);
    expect(first.status).toBe('ok');
    if (first.status === 'ok') expect(first.slot.current.revision).toBe(1);

    await session.dispatch({ type: 'UsePortal', portalId: 'portal:nope' });
    const afterReject = await store.load(content.version);
    expect(afterReject.status).toBe('ok');
    if (afterReject.status === 'ok') {
      expect(afterReject.slot.current.revision).toBe(1);
      expect(afterReject.slot.previous).toBeNull();
    }

    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    const second = await store.load(content.version);
    expect(second.status).toBe('ok');
    if (second.status === 'ok') {
      expect(second.slot.current.revision).toBe(2);
      expect(second.slot.previous?.revision).toBe(1);
    }
  });

  it('delivers a boot hint to subscribers once and never replays it', async () => {
    const bootEffect: Effect = { type: 'ShowHint', reason: 'content_version_mismatch', id: 'boot:0' };
    const { session } = make({ bootEffects: [bootEffect] });
    const first: Effect[] = [];
    const second: Effect[] = [];
    session.subscribe((_snapshot, effects) => first.push(...effects));
    session.subscribe((_snapshot, effects) => second.push(...effects));
    expect(first).toEqual([bootEffect]);
    expect(second).toEqual([bootEffect]);

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(first.filter((effect) => effect.id === bootEffect.id)).toHaveLength(1);
    expect(second.filter((effect) => effect.id === bootEffect.id)).toHaveLength(1);
  });

  it('does not consume a boot hint on a settings change', () => {
    const bootEffect: Effect = { type: 'ShowHint', reason: 'save_corrupt', id: 'boot:1' };
    const { session } = make({ bootEffects: [bootEffect] });
    session.updateSettings({ muted: true });
    const seen: Effect[] = [];
    session.subscribe((_snapshot, effects) => seen.push(...effects));
    expect(seen).toEqual([bootEffect]);
  });

  it('resets the store and the snapshot', async () => {
    const { session, store } = make();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(session.snapshot.revision).toBe(1);

    await session.reset?.();
    expect(session.snapshot.revision).toBe(0);
    expect(session.snapshot.dialogue.status).toBe('closed');
    expect((await store.load(content.version)).status).toBe('empty');
  });

  it('rejects a reused commandId with a different payload', async () => {
    const { session } = make();
    const first = await session.dispatchCommand({
      commandId: 'same-id',
      expectedRevision: 0,
      payload: { type: 'Interact', entityId: ENTITY.guide },
    });
    expect(first.ok).toBe(true);

    const second = await session.dispatchCommand({
      commandId: 'same-id',
      expectedRevision: session.snapshot.revision,
      payload: { type: 'UsePortal', portalId: PORTAL.homeExit },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('not_available');
    expect(session.snapshot.sceneId).toBe('home-interior');
  });

  it('stops mutating after close', async () => {
    const { session } = make();
    await session.close();
    const outcome = await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('not_available');
    expect(session.snapshot.revision).toBe(0);
  });

  it('ignores a non-finite volume instead of persisting an invalid save', () => {
    const { session } = make();
    session.updateSettings({ volume: Number.NaN });
    expect(session.snapshot.settings.volume).toBe(0.8);
  });

  it('waits for an in-flight save before clearing on reset', async () => {
    const log: string[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = {
      load: async () => ({ status: 'empty' }) as const,
      save: async () => {
        log.push('save:start');
        await gate;
        log.push('save:end');
      },
      clear: async () => {
        log.push('clear');
      },
    };
    const session = createSession({
      content,
      store,
      initial: createInitialSnapshot('slow-save', content.version),
    });

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    const reset = session.reset?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(['save:start']);

    release();
    await reset;
    expect(log).toEqual(['save:start', 'save:end', 'clear']);
  });

  it('never writes while a mismatched save is awaiting a restart', async () => {
    const log: string[] = [];
    const store = {
      load: async () => ({ status: 'empty' }) as const,
      save: async () => {
        log.push('save');
      },
      clear: async () => {
        log.push('clear');
      },
    };
    const session = createSession({
      content,
      store,
      initial: createInitialSnapshot('blocked', content.version),
      saveBlocked: true,
    });

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual([]);

    await session.reset?.();
    expect(log).toEqual(['clear']);

    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(['clear', 'save']);
  });

  it('hints once when the store cannot write', async () => {
    const failing = {
      load: async () => ({ status: 'empty' }) as const,
      save: async () => {
        throw new Error('quota');
      },
      clear: async () => undefined,
    };
    const session = createSession({
      content,
      store: failing,
      initial: createInitialSnapshot('failing', content.version),
    });
    const hints: Effect[] = [];
    session.subscribe((_snapshot, effects) => hints.push(...effects));
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hints).toContainEqual(
      expect.objectContaining({ type: 'ShowHint', reason: 'storage_unavailable' }),
    );
  });

  it('stops notifying after close', async () => {
    const { session } = make();
    let calls = 0;
    session.subscribe(() => {
      calls += 1;
    });
    expect(calls).toBe(1);
    await session.close();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(calls).toBe(1);
  });
});
