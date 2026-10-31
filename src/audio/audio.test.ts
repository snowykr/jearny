import { describe, expect, it } from 'vitest';
import { parseManifest } from './index';

const line = {
  path: '/audio/abc.mp3',
  hash: 'abc',
  voiceId: 'voice',
  modelId: 'eleven_multilingual_v2',
  status: 'generated_pending_listening_review',
};

describe('voice manifest', () => {
  it('accepts the manifest written by tools/voice/render.mjs', () => {
    expect(parseManifest({ version: 1, lines: { 'shop.welcome': line } })).toEqual({
      version: 1,
      lines: { 'shop.welcome': line },
    });
  });

  it.each([
    ['wrong version', { version: 2, lines: {} }],
    ['array lines', { version: 1, lines: [] }],
    ['missing lines', { version: 1 }],
    ['absolute URL path', { version: 1, lines: { a: { ...line, path: 'https://x/a.mp3' } } }],
    ['null entry', { version: 1, lines: { a: null } }],
    ['missing path', { version: 1, lines: { a: { hash: 'x' } } }],
  ])('rejects %s', (_name, value) => {
    expect(parseManifest(value)).toBeNull();
  });

  it('accepts an empty manifest and tolerates extra metadata', () => {
    expect(parseManifest({ version: 1, lines: {} })).toEqual({ version: 1, lines: {} });
    const parsed = parseManifest({
      version: 1,
      lines: { a: { path: '/audio/a.mp3', extra: 1 } },
      extra: true,
    });
    expect(parsed?.lines.a?.path).toBe('/audio/a.mp3');
  });
});
