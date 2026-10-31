// Snapshot persistence and validation (docs/ARCHITECTURE.md §8). The domain
// never touches storage; the session loads a snapshot and adopts it.
import type { DialogueStatus, GameSnapshot, QuestStatus, SceneId, Settings } from '../contracts';

export interface SaveSlot {
  current: GameSnapshot;
  previous: GameSnapshot | null;
}

export type SaveLoad =
  | { status: 'empty' }
  | { status: 'ok'; slot: SaveSlot }
  | { status: 'version_mismatch'; foundVersion: string }
  | { status: 'corrupt' }
  | { status: 'unavailable' };

export interface SaveStore {
  /**
   * `corrupt`: data exists but no snapshot decoded. `version_mismatch`: a valid
   * snapshot belongs to another contentVersion and must be left untouched until
   * the player confirms a restart. `unavailable`: storage could not be reached.
   */
  load(contentVersion: string): Promise<SaveLoad>;
  /** Writes the new current snapshot and demotes the old one to `previous`. */
  save(snapshot: GameSnapshot): Promise<void>;
  clear(): Promise<void>;
}

const SCENES: readonly SceneId[] = ['takanawa', 'home-interior', 'shop-interior'];
const QUEST_STATUSES: readonly QuestStatus[] = ['not_started', 'active', 'ready_to_return', 'completed'];
const DIALOGUE_STATUSES: readonly DialogueStatus[] = ['closed', 'showing', 'choosing', 'waiting_for_speech'];
const TEXT_SIZES = ['normal', 'large'] as const;
const INPUT_MODES = ['keyboard', 'touch'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

function decodeSettings(value: unknown): Settings | null {
  if (!isRecord(value)) return null;
  const { volume, muted, textSize, inputMode } = value;
  if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1)) return null;
  if (typeof muted !== 'boolean') return null;
  if (!TEXT_SIZES.includes(textSize as (typeof TEXT_SIZES)[number])) return null;
  if (!INPUT_MODES.includes(inputMode as (typeof INPUT_MODES)[number])) return null;
  return { volume, muted, textSize: textSize as Settings['textSize'], inputMode: inputMode as Settings['inputMode'] };
}

/**
 * Structural + version check. Returns a fresh object so callers cannot mutate
 * the stored value, or null when the data cannot be trusted.
 */
export function decodeSnapshot(value: unknown): GameSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (typeof value.contentVersion !== 'string' || value.contentVersion.length === 0) return null;
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) return null;
  if (!isInt(value.revision) || value.revision < 0) return null;
  if (!SCENES.includes(value.sceneId as SceneId)) return null;
  if (typeof value.spawnId !== 'string' || value.spawnId.length === 0) return null;

  if (!isRecord(value.inventory)) return null;
  const inventory: Record<string, number> = {};
  for (const [itemId, count] of Object.entries(value.inventory)) {
    if (!isInt(count) || count < 0) return null;
    inventory[itemId] = count;
  }

  if (!isInt(value.walletYen) || value.walletYen < 0) return null;

  if (!isRecord(value.quests)) return null;
  const quests: Record<string, QuestStatus> = {};
  for (const [questId, status] of Object.entries(value.quests)) {
    if (!QUEST_STATUSES.includes(status as QuestStatus)) return null;
    quests[questId] = status as QuestStatus;
  }

  if (!isRecord(value.flags)) return null;
  const flags: Record<string, true> = {};
  for (const [flag, set] of Object.entries(value.flags)) {
    if (set !== true) return null;
    flags[flag] = true;
  }

  if (!isRecord(value.dialogue)) return null;
  const { status, nodeId, speakerId } = value.dialogue;
  if (!DIALOGUE_STATUSES.includes(status as DialogueStatus)) return null;
  if (nodeId !== null && typeof nodeId !== 'string') return null;
  if (speakerId !== null && typeof speakerId !== 'string') return null;

  if (!Array.isArray(value.cosmetics) || !value.cosmetics.every((item) => typeof item === 'string'))
    return null;

  const settings = decodeSettings(value.settings);
  if (!settings) return null;

  let tile: [number, number] | undefined;
  if (value.tile !== undefined) {
    if (!Array.isArray(value.tile) || value.tile.length !== 2 || !value.tile.every(isInt)) return null;
    tile = [value.tile[0] as number, value.tile[1] as number];
  }

  return {
    schemaVersion: 1,
    contentVersion: value.contentVersion,
    sessionId: value.sessionId,
    revision: value.revision,
    sceneId: value.sceneId as SceneId,
    spawnId: value.spawnId,
    inventory,
    walletYen: value.walletYen,
    quests,
    flags,
    dialogue: { status: status as DialogueStatus, nodeId, speakerId },
    cosmetics: [...value.cosmetics],
    settings,
    ...(tile ? { tile } : {}),
  };
}

/** Picks the newest usable snapshot. A stale content version is never rewritten. */
export function readSlot(raw: unknown, contentVersion: string): SaveLoad {
  if (raw === undefined || raw === null) return { status: 'empty' };
  if (!isRecord(raw)) return { status: 'corrupt' };
  const current = decodeSnapshot(raw.current);
  const previous = decodeSnapshot(raw.previous);
  if (current && current.contentVersion === contentVersion) {
    return {
      status: 'ok',
      slot: { current, previous: previous && previous.contentVersion === contentVersion ? previous : null },
    };
  }
  if (previous && previous.contentVersion === contentVersion)
    return { status: 'ok', slot: { current: previous, previous: null } };
  const found = current ?? previous;
  if (found) return { status: 'version_mismatch', foundVersion: found.contentVersion };
  return { status: 'corrupt' };
}

/** In-memory store used by tests and by environments without IndexedDB. */
export function createMemoryStore(initial: { current?: unknown; previous?: unknown } = {}): SaveStore {
  let slot: { current?: unknown; previous?: unknown } | undefined = Object.keys(initial).length
    ? { ...initial }
    : undefined;
  return {
    async load(contentVersion) {
      return readSlot(slot, contentVersion);
    },
    async save(snapshot) {
      slot = { previous: slot?.current, current: structuredClone(snapshot) };
    },
    async clear() {
      slot = undefined;
    },
  };
}

const DB_NAME = 'jearny';
const STORE_NAME = 'saves';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

/** Browser store. Every failure is swallowed by the caller, never by the game loop. */
export function createIndexedDbStore(): SaveStore {
  let database: Promise<IDBDatabase> | null = null;
  const db = () => (database ??= openDatabase());

  const read = async (): Promise<unknown> => {
    const handle = await db();
    return new Promise((resolve, reject) => {
      const request = handle.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('slot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  };

  return {
    async load(contentVersion) {
      try {
        return readSlot(await read(), contentVersion);
      } catch {
        return { status: 'unavailable' };
      }
    },
    async save(snapshot) {
      const handle = await db();
      await new Promise<void>((resolve, reject) => {
        const transaction = handle.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const read = store.get('slot');
        read.onsuccess = () => {
          // Only a decodable current may become the previous save.
          const previous = isRecord(read.result) ? decodeSnapshot(read.result.current) : null;
          store.put({ previous, current: structuredClone(snapshot) }, 'slot');
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
      });
    },
    async clear() {
      try {
        const handle = await db();
        await new Promise<void>((resolve, reject) => {
          const transaction = handle.transaction(STORE_NAME, 'readwrite');
          transaction.objectStore(STORE_NAME).delete('slot');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB clear failed'));
        });
      } catch {
        // Nothing to clear, or storage is unavailable.
      }
    },
  };
}
