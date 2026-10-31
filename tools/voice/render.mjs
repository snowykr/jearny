import { readFile, mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheKey, synthesisInput, createSpeech, validateMp3, validateManifest } from './elevenlabs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
const key = process.env.ELEVENLABS_API_KEY;

async function main() {
  if (!['check', 'render'].includes(mode)) throw new Error('Usage: node --env-file=.env.local tools/voice/render.mjs check | render LINE_ID');
  if (!key) throw new Error('ELEVENLABS_API_KEY is unset. No request sent.');
  if (mode === 'check') {
    let next;
    let count = 0;
    do {
      const url = new URL('https://api.elevenlabs.io/v2/voices');
      url.searchParams.set('language', 'ja');
      if (next) url.searchParams.set('next_page_token', next);
      const response = await fetch(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Voice metadata HTTP ${response.status}. No synthesis requested.`);
      const data = await response.json();
      console.log(JSON.stringify((data.voices ?? []).map(v => ({ id: v.voice_id, name: v.name })), null, 2));
      next = data.has_more ? data.next_page_token : undefined;
      count++;
    } while (next && count < 10);
    if (next) console.log('Stopped at 10 pages; more account voices exist.');
    console.log('Metadata check complete. A voice must still be selected and auditioned.');
    return;
  }
  const document = JSON.parse(await readFile(resolve(root, 'content/dialogue.ja.json'), 'utf8'));
  const line = document.lines.find(item => item.id === process.argv[3]);
  if (!line) throw new Error('Choose one approved line ID from content/dialogue.ja.json');
  const input = synthesisInput(line, process.env.ELEVENLABS_VOICE_ID, process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2');
  const hash = cacheKey(input);
  const output = resolve(root, 'public/audio');
  await mkdir(output, { recursive: true });
  const lockPath = resolve(root, '.voice-lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Another voice job holds .voice-lock. Verify no job is running before removing a stale lock.'); });
  try {
    const manifestPath = resolve(output, 'manifest.json');
    let manifest = { version: 1, lines: {} };
    try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const path = resolve(output, `${hash}.mp3`);
    let cached = false;
    try { validateMp3(await readFile(path)); cached = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!cached) {
      const audio = await createSpeech(input, key);
      await writeFile(`${path}.tmp`, audio);
      await rename(`${path}.tmp`, path);
    }
    manifest.lines[line.id] = { path: `/audio/${hash}.mp3`, hash, voiceId: input.voiceId, modelId: input.body.model_id, status: 'generated_pending_listening_review' };
    await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
    await rename(`${manifestPath}.tmp`, manifestPath);
    console.log(`${cached ? 'Cache hit; no synthesis call' : 'Generated; listening review required'}: ${line.id}`);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(error => { console.error(error.name === 'TimeoutError' ? 'ElevenLabs request timed out; retry explicitly.' : error.message); process.exitCode = 1; });
