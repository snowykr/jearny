import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { synthesisInput, cacheKey } from './elevenlabs.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tabi-voice-test-'));
  await mkdir(join(root, 'tools/voice'), { recursive: true });
  await mkdir(join(root, 'content'));
  await mkdir(join(root, 'public/audio'), { recursive: true });
  for (const file of ['render.mjs', 'elevenlabs.mjs']) {
    await cp(new URL(file, import.meta.url), join(root, 'tools/voice', file));
  }
  const line = { id: 'shop.welcome', speaker: 'guide', spokenText: 'いらっしゃいませ。' };
  await writeFile(join(root, 'content/dialogue.ja.json'), JSON.stringify({ lines: [line] }));
  await writeFile(join(root, 'no-network.mjs'), 'globalThis.fetch = async () => { throw new Error("NETWORK_CALL_FORBIDDEN"); };');
  return { root, hash: cacheKey(synthesisInput(line, 'testVoice')) };
}

function runMode(root, mode, env = {}) {
  return spawnSync(process.execPath, ['--import', join(root, 'no-network.mjs'), join(root, 'tools/voice/render.mjs'), mode], {
    encoding: 'utf8',
    env: { ELEVENLABS_API_KEY: '', ELEVENLABS_VOICE_ID: 'testVoice', ELEVENLABS_MODEL_ID: 'eleven_multilingual_v2', ...env },
  });
}

function run(root) {
  return spawnSync(process.execPath, ['--import', join(root, 'no-network.mjs'), join(root, 'tools/voice/render.mjs'), 'render', 'shop.welcome'], {
    encoding: 'utf8', env: { ELEVENLABS_API_KEY: 'mock-key', ELEVENLABS_VOICE_ID: 'testVoice', ELEVENLABS_MODEL_ID: 'eleven_multilingual_v2' },
  });
}

test('CLI rejects corrupt existing cache without calling provider', async () => {
  const { root, hash } = await fixture();
  try {
    await writeFile(join(root, 'public/audio', `${hash}.mp3`), Buffer.alloc(200));
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid or empty MP3/);
    assert.doesNotMatch(result.stderr, /NETWORK_CALL_FORBIDDEN/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI validates malformed and invalid manifests before paid requests', async () => {
  const { root } = await fixture();
  try {
    for (const text of ['{', '{}']) {
      await writeFile(join(root, 'public/audio/manifest.json'), text);
      const result = run(root);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.length > 0);
      assert.doesNotMatch(result.stderr, /NETWORK_CALL_FORBIDDEN/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI cache hit publishes manifest without a provider call', async () => {
  const { root, hash } = await fixture();
  try {
    await writeFile(join(root, 'public/audio', `${hash}.mp3`), Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]));
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Cache hit; no synthesis call/);
    const manifest = JSON.parse(await readFile(join(root, 'public/audio/manifest.json'), 'utf8'));
    assert.equal(manifest.lines['shop.welcome'].hash, hash);
    assert.equal(manifest.lines['shop.welcome'].status, 'generated_pending_listening_review');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plan validates every line without a key or network', async () => {
  const { root, hash } = await fixture();
  try {
    const result = runMode(root, 'plan');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`shop\\.welcome\\tguide\\ttestVoice\\t${hash}\\tpending`));
    assert.match(result.stdout, /Plan only; no provider request/);
    assert.doesNotMatch(result.stderr, /NETWORK_CALL_FORBIDDEN/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plan reports a missing voice instead of synthesizing', async () => {
  const { root } = await fixture();
  try {
    const result = runMode(root, 'plan', { ELEVENLABS_VOICE_ID: '' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /NO VOICE/);
    assert.doesNotMatch(result.stderr, /NETWORK_CALL_FORBIDDEN/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plan honours a per-speaker voice override', async () => {
  const { root } = await fixture();
  try {
    const other = cacheKey(synthesisInput({ id: 'shop.welcome', speaker: 'guide', spokenText: 'いらっしゃいませ。' }, 'guideVoice'));
    const result = runMode(root, 'plan', { ELEVENLABS_VOICE_ID_GUIDE: 'guideVoice' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${other}\\tpending`));
    assert.doesNotMatch(result.stdout, /testVoice/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
