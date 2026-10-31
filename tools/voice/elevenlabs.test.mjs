import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesisInput, cacheKey, createSpeech, validateMp3, validateManifest, resolveVoiceId } from './elevenlabs.mjs';

const line = { id: 'shop.welcome', spokenText: 'いらっしゃいませ。' };
const input = synthesisInput(line, 'testVoice');

test('rejects corrupt cache and invalid manifests before synthesis', () => {
  assert.throws(() => validateMp3(Buffer.alloc(200)), /Invalid/);
  assert.throws(() => validateManifest({}), /Invalid voice manifest/);
  assert.throws(() => validateManifest({ version: 1, lines: [] }), /Invalid voice manifest/);
  assert.deepEqual(validateManifest({ version: 1, lines: {} }), { version: 1, lines: {} });
});

test('rejects unsafe IDs and empty dialogue before any request', () => {
  assert.throws(() => synthesisInput({ ...line, id: '../bad' }, 'testVoice'));
  assert.throws(() => synthesisInput({ ...line, spokenText: '' }, 'testVoice'));
});
test('cache changes when Japanese text or voice changes', () => {
  assert.equal(cacheKey(input), cacheKey(synthesisInput(line, 'testVoice')));
  assert.notEqual(cacheKey(input), cacheKey(synthesisInput({ ...line, spokenText: 'こんにちは。' }, 'testVoice')));
  assert.notEqual(cacheKey(input), cacheKey(synthesisInput(line, 'secondVoice')));
});
test('no request without a key', async () => {
  await assert.rejects(createSpeech(input, '', () => { throw new Error('network must not run'); }), /unset/);
});
test('uses the documented endpoint and the exact supported request body', async () => {
  const result = await createSpeech(input, 'mock-key', async (url, options) => {
    assert.match(url, /\/v1\/text-to-speech\/testVoice\?output_format=mp3_44100_128$/);
    assert.equal(options.headers['xi-api-key'], 'mock-key');
    // eleven_multilingual_v2 rejects language_code and language normalization (`invalid_parameters`).
    assert.deepEqual(JSON.parse(options.body), { text: line.spokenText, model_id: 'eleven_multilingual_v2' });
    return new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  assert.equal(result.length, 203);
});
test('provider errors never return audio or expose provider message', async () => {
  await assert.rejects(createSpeech(input, 'mock-key', async () => new Response(JSON.stringify({ detail: { code: 'quota_exceeded', message: 'sensitive diagnostic' } }), { status: 401 })), /HTTP 401 \(quota_exceeded\)/);
});
test('rejects successful JSON or corrupt audio responses', async () => {
  await assert.rejects(createSpeech(input, 'mock-key', async () => new Response('{}', { headers: { 'content-type': 'application/json' } })), /Expected audio/);
  await assert.rejects(createSpeech(input, 'mock-key', async () => new Response('bad', { headers: { 'content-type': 'audio/mpeg' } })), /Invalid/);
});
test('per-speaker voice falls back to the single demo voice', () => {
  const env = { ELEVENLABS_VOICE_ID: 'demoVoice' };
  assert.equal(resolveVoiceId('guide', env), 'demoVoice');
  assert.equal(resolveVoiceId(undefined, env), 'demoVoice');
});

test('per-speaker voice overrides the demo voice', () => {
  const env = { ELEVENLABS_VOICE_ID: 'demoVoice', ELEVENLABS_VOICE_ID_STATION_STAFF: 'staffVoice' };
  assert.equal(resolveVoiceId('station_staff', env), 'staffVoice');
  assert.equal(resolveVoiceId('guide', env), 'demoVoice');
  assert.equal(resolveVoiceId('shopkeeper', env), 'demoVoice');
});

test('unset voices resolve empty and a malformed speaker never reads another env key', () => {
  assert.equal(resolveVoiceId('guide', {}), '');
  assert.equal(resolveVoiceId('../x', { ELEVENLABS_VOICE_ID: 'demoVoice' }), 'demoVoice');
});
