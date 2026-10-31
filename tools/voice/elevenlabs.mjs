import { createHash } from 'node:crypto';

export function synthesisInput(line, voiceId, modelId = 'eleven_multilingual_v2') {
  if (!/^[a-z0-9._-]+$/i.test(line.id ?? '')) throw new Error('Invalid line ID');
  if (!/^[a-z0-9_-]+$/i.test(voiceId ?? '')) throw new Error('Set a valid ELEVENLABS_VOICE_ID');
  if (typeof line.spokenText !== 'string' || !line.spokenText.trim() || line.spokenText.length > 500) {
    throw new Error('Spoken text must contain 1 to 500 characters');
  }
  if (modelId !== 'eleven_multilingual_v2') throw new Error('This static pipeline supports eleven_multilingual_v2');
  return {
    voiceId,
    outputFormat: 'mp3_44100_128',
    body: { text: line.spokenText, model_id: modelId, apply_language_text_normalization: true },
  };
}

export function cacheKey(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/**
 * Per-speaker voice override, falling back to the single demo voice.
 * Speaker names come from content/dialogue.ja.json (guide, station_staff, shopkeeper).
 */
export function resolveVoiceId(speaker, env = process.env) {
  const suffix = typeof speaker === 'string' && /^[a-z0-9_]+$/i.test(speaker) ? speaker.toUpperCase() : null;
  const perSpeaker = suffix ? env[`ELEVENLABS_VOICE_ID_${suffix}`] : undefined;
  return perSpeaker || env.ELEVENLABS_VOICE_ID || '';
}

export function validateMp3(bytes) {
  const id3 = bytes.subarray(0, 3).toString() === 'ID3';
  const frame = bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (bytes.length < 128 || (!id3 && !frame)) throw new Error('Invalid or empty MP3 response/cache; inspect the file before retrying');
  return bytes;
}

export function validateManifest(manifest) {
  if (manifest?.version !== 1 || !manifest.lines || typeof manifest.lines !== 'object' || Array.isArray(manifest.lines)) {
    throw new Error('Invalid voice manifest. No synthesis requested.');
  }
  return manifest;
}

export async function createSpeech(input, apiKey, fetcher = fetch) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is unset. No request sent.');
  const response = await fetcher(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${input.outputFormat}`,
    { method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body), signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) {
    let code = 'unknown';
    try { const e = await response.json(); code = e.detail?.code ?? e.detail?.status ?? code; } catch {}
    code = /^[a-z0-9_]{1,80}$/i.test(String(code)) ? code : 'unknown';
    throw new Error(`ElevenLabs HTTP ${response.status} (${code}). No audio saved.`);
  }
  if (!(response.headers.get('content-type') ?? '').startsWith('audio/')) {
    throw new Error('Expected audio response. No audio saved.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return validateMp3(bytes);
}
