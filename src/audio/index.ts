// Audio playback (docs/ARCHITECTURE.md §7, issue #15). Browser playback from
// the published manifest; no KAPLAY context, at most one NPC clip, silence on
// any failure so the quest never blocks.
import type { Effect } from '../contracts';

export interface ManifestLine {
  path: string;
  hash: string;
  voiceId: string;
  modelId: string;
  status: string;
}

export interface VoiceManifest {
  version: 1;
  lines: Record<string, ManifestLine>;
}

const MANIFEST_URL = `${import.meta.env.BASE_URL}audio/manifest.json`;
const MAX_REMEMBERED_EFFECTS = 100;

let manifest: Promise<VoiceManifest | null> | null = null;
let current: HTMLAudioElement | null = null;
let volume = 0.8;
let muted = false;
let generation = 0;
const playedEffectIds: string[] = [];

/** Validates the manifest written by tools/voice/render.mjs. */
export function parseManifest(value: unknown): VoiceManifest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as { version?: unknown; lines?: unknown };
  if (candidate.version !== 1) return null;
  if (typeof candidate.lines !== 'object' || candidate.lines === null || Array.isArray(candidate.lines))
    return null;
  const lines: Record<string, ManifestLine> = {};
  for (const [lineId, raw] of Object.entries(candidate.lines as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) return null;
    const line = raw as Partial<ManifestLine>;
    if (typeof line.path !== 'string' || !line.path.startsWith('/')) return null;
    lines[lineId] = {
      path: line.path,
      hash: typeof line.hash === 'string' ? line.hash : '',
      voiceId: typeof line.voiceId === 'string' ? line.voiceId : '',
      modelId: typeof line.modelId === 'string' ? line.modelId : '',
      status: typeof line.status === 'string' ? line.status : '',
    };
  }
  return { version: 1, lines };
}

function loadManifest(): Promise<VoiceManifest | null> {
  manifest ??= fetch(MANIFEST_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((json: unknown) => parseManifest(json))
    .catch(() => null);
  return manifest;
}

/** Applies device-local settings; safe before the first clip. */
export function applyAudioSettings(settings: { volume: number; muted: boolean }): void {
  volume = Math.min(1, Math.max(0, settings.volume));
  muted = settings.muted;
  if (current) {
    current.volume = volume;
    current.muted = muted;
  }
}

/** Stops the active NPC clip (advance, close, scene change). */
export function stopAudio(): void {
  generation += 1;
  if (!current) return;
  current.pause();
  current.currentTime = 0;
  current = null;
}

function play(path: string): void {
  stopAudio();
  if (muted || typeof Audio === 'undefined') return;
  const audio = new Audio(path);
  audio.volume = volume;
  current = audio;
  void audio.play()?.catch(() => {
    if (current === audio) current = null;
  });
}

function remember(effectId: string): boolean {
  if (playedEffectIds.includes(effectId)) return false;
  playedEffectIds.push(effectId);
  while (playedEffectIds.length > MAX_REMEMBERED_EFFECTS) playedEffectIds.shift();
  return true;
}

/** main.ts subscribes this to every session notification. */
export function handleAudioEffects(effects: Effect[]): void {
  for (const effect of effects) {
    if (effect.type === 'ChangeScene') {
      stopAudio();
      continue;
    }
    if (effect.type !== 'PlayLine') continue;
    if (!remember(effect.id)) continue;
    const token = (generation += 1);
    void loadManifest().then((loaded) => {
      // A newer line or a scene change happened while the manifest was loading.
      if (token !== generation) return;
      const line = loaded?.lines[effect.lineId];
      if (line) play(line.path);
    });
  }
}
