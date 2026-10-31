# ElevenLabs speech for Japanese NPCs

Research checked 2026-10-31. This is an architecture proposal. No credentials were read and no generation requests were sent.

ElevenLabs generates the NPCs' spoken Japanese. Speech recognition is a separate, optional input feature. The playable game must work with text choices and cached NPC audio without microphone access.

| Option | Strength | Cost and limitation |
| --- | --- | --- |
| Generate approved lines before release; distribute MP3 assets | Review pronunciation once, replay without API calls, predictable playback | Dialogue edits require asset regeneration |
| Generate and stream during play through the game server | Supports new replies and variable dialogue | Requires a backend, network access, usage controls, and interrupted-stream handling |

Choose cached files as the base. Scripted travel lessons benefit more from reviewed pronunciation and repeatable delivery than live synthesis. Add runtime generation only for dialogue that cannot be enumerated.

## Models and voices

Use `eleven_multilingual_v2` for the first static corpus and `eleven_flash_v2_5` for optional runtime speech. Both support Japanese. These are deliberate baseline choices, not claims that they are the newest models. The current catalog also lists v4. Reconsider models only after comparing the same Japanese lesson lines. [Official models](https://elevenlabs.io/docs/overview/models)

Discover account-accessible voices with `GET https://api.elevenlabs.io/v2/voices?language=ja`. Follow pagination. Audition Japanese previews, then approve one voice ID per NPC. Inspect `verified_languages`, availability, and any custom voice rates. Do not assume an English example voice is suitable for Japanese. Preserve a replacement voice map for future regeneration. [List voices](https://elevenlabs.io/docs/api-reference/voices/search)

Keep separate `displayText` and `spokenText` fields so furigana markup never enters synthesis. Have a Japanese speaker review station names, prices, counters, and polite forms. For static generation, evaluate `apply_language_text_normalization: true`; the API documents Japanese support and additional latency. Omit `language_code` for Multilingual v2 because that model does not support the parameter. [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

## Server and asset boundary

Proposed environment names are `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID=eleven_multilingual_v2`, `ELEVENLABS_RUNTIME_MODEL_ID=eleven_flash_v2_5`, and `ELEVENLABS_VOICE_ID_<NPC>`. Only the first is a provider-standard key name; the others are application configuration. Secrets belong in server deployment secrets or an ignored local environment file, never a `VITE_` variable, browser bundle, URL, or log. Scope keys to required operations and set a credit limit. [API keys](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys)

A build-time Node process reads approved lines, calls ElevenLabs, validates decodable nonempty audio, and atomically publishes each MP3. Its manifest maps line IDs to immutable asset URLs and a SHA-256 of the canonical synthesis input: spoken text, voice ID, model ID, output format, normalization flags, voice settings, and dictionary versions. Regenerate only misses; deduplicate concurrent jobs. Cache complete audio, never failed or partial responses. A seed is not a guarantee of identical regeneration.

The KAPLAY client preloads the next scene's clips through its audio adapter. It provides mute, replay, subtitles, and explicit advance. A user gesture enables audio. Advancing, changing scenes, or starting another line stops previous speech. Audio completion must never be required for progression.

## Documented request examples

These examples contain placeholders only. The creation route returns audio bytes. [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

```sh
curl --fail-with-body --max-time 30 \
	'https://api.elevenlabs.io/v1/text-to-speech/VOICE_ID_PLACEHOLDER?output_format=mp3_44100_128' \
	-H 'xi-api-key: API_KEY_PLACEHOLDER' \
	-H 'Content-Type: application/json' \
	--data '{"text":"東京駅まで、いくらですか。","model_id":"eleven_multilingual_v2","apply_language_text_normalization":true}' \
	--output line.candidate.mp3
```

The streaming route uses HTTP audio streaming, not a JSON audio response. [Stream speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)

```sh
curl --fail-with-body --max-time 30 \
	'https://api.elevenlabs.io/v1/text-to-speech/VOICE_ID_PLACEHOLDER/stream?output_format=mp3_44100_128' \
	-H 'xi-api-key: API_KEY_PLACEHOLDER' \
	-H 'Content-Type: application/json' \
	--data '{"text":"こちらの電車をご利用ください。","model_id":"eleven_flash_v2_5","language_code":"ja"}' \
	--output runtime.candidate.mp3
```

The optional game endpoint resolves approved server-owned utterance IDs to text and voice. It must not become a public arbitrary-text TTS proxy. Apply per-session quotas, a character limit, bounded concurrency, and request deduplication before calling ElevenLabs. Serve cached hits first. For dynamic text, validate and store the completed NPC reply server-side before synthesizing it.

For progressive playback, a same-origin authenticated audio URL can proxy upstream MP3 bytes to an HTML audio element. Test progressive playback on target browsers; if unsupported, buffer a complete file before playing. Do not assume a KAPLAY decoded sound loader accepts incomplete audio. A public cache contains only approved static lines; personalized replies require session-scoped storage and expiry. Cancel upstream work when the client disconnects. Publish cache entries only after successful completion.

## Failure behavior and verification

Proposed budgets are 30 seconds per build request, and 5 seconds to first audio plus 20 seconds total at runtime. These are application limits, not provider guarantees. Abort on expiry. Runtime audio failure leaves subtitles and choices usable, with a replay control. A failed dynamic line may use a pre-generated acknowledgement, but never play unrelated words as though they match the displayed sentence.

Handle `detail.code`, with `detail.status` as a legacy fallback. Do not retry authentication, permission, invalid voice, validation, or insufficient-credit failures. For 429 or transient server failures, allow at most two jittered backoff retries within the total deadline; wait for an available concurrency slot. Never retry after audible playback has started. Log sanitized error code, model, line ID, and request ID. [Current errors](https://elevenlabs.io/docs/eleven-api/resources/errors), [legacy errors](https://elevenlabs.io/docs/help-center/technical/api-error-code-400-or-401)

Verification has two stages. First, mocked responses prove cache hits issue no synthesis calls, changed synthesis inputs invalidate the cache, errors never become MP3 assets, aborted streams never publish, and missing audio never blocks play. Browser checks cover gesture restrictions, replay, mute, scene cancellation, and overlapping lines. Second, after credentials and a small generation budget are supplied, verify voice access and model availability with read-only metadata calls, then generate one short Japanese clip. Check status, audio content type, decode success, audible Japanese pronunciation, and one repeated cache hit with zero new generation. Never print the key. No credential validity, account voice access, latency, or Japanese listening quality has been verified by this research.

Optional speech recognition has its own microphone consent, transcription service, timeout, and typed-input fallback. ElevenLabs Scribe is a separate STT model family. It does not replace the TTS path described here. [Model families](https://elevenlabs.io/docs/overview/models)
