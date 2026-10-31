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
  const line = { id: 'shop.welcome', spokenText: 'いらっしゃいませ。' };
  await writeFile(join(root, 'content/dialogue.ja.json'), JSON.stringify({ lines: [line] }));
  await writeFile(join(root, 'no-network.mjs'), 'globalThis.fetch = async () => { throw new Error("NETWORK_CALL_FORBIDDEN"); };');
  return { root, hash: cacheKey(synthesisInput(line, 'testVoice')) };
}

function run(root) {
  return spawnSync(process.execPath, ['--import', join(root, 'no-network.mjs'), join(root, 'tools/voice/render.mjs'), 'render', 'shop.welcome'], {
    encoding: 'utf8', env: { ...process.env, ELEVENLABS_API_KEY: 'mock-key', ELEVENLABS_VOICE_ID: 'testVoice', ELEVENLABS_MODEL_ID: 'eleven_multilingual_v2' },
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
