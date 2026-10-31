# Tabi Quest architecture baseline

Version 3, 2026-10-31. This is the current build specification. It supersedes the Phaser and generic-town choices in `Tabi-Quest-PRD-v1.md`. The game is not implemented yet. Geographic data, source artwork, a voice-generation connector, and its unit tests exist.

## 1. Product slice

Build an original FireRed-inspired top-down pixel adventure set around Takanawa Gateway Station. The first journey starts at a fictional home in the Takanawa residential area, reaches the station, follows directions toward Sengakuji, and completes a shop conversation. Players move, inspect, collect, spend fictional mission money, clarify misunderstandings, and return home. Spoken NPC audio supports this game; audio completion never controls quest completion.

Use original art, 16px ground tiles, four-direction grid walking, a 240x160 logical viewport and a camera that follows the player. HTML dialogue overlays remain readable on mobile. The first content includes one 128x96-tile outdoor map, home and shop interiors, a station interaction zone, three NPC roles and one return-home quest. The selected first shop is Matsushimaya, reached by a clearly authored northwest branch beyond the verified station-to-temple corridor. Its game prices and interior are fictional. Koizumi Gishido and Liebe are deferred. Student/Baito worlds, cash rewards, combat and GPS are outside the first build.

## 2. Geographic truth and game layout

Keep three layers separate:

1. `research/map/takanawa-osm.geojson`: WGS84 evidence from OSM, with object IDs, timestamps and source tags. It contains 2,429 selected features inside [139.733,35.630,139.747,35.641]. Preserve attribution and the source database when distributing derivatives.
2. `research/map/west-approach-route.geojson`: a connected approximately 440m walking candidate from North Gate to the Sengakuji approach. Shared OSM nodes establish connectivity. It has steps and is not a verified accessible or live route.
3. `content/world-plan.json`: proposed game-space layout. Tile coordinates are not latitude/longitude. The fictional home has no real address or geographic coordinate. Any repositioned shop is explicitly stylized.

The verified narrative corridor is North Gate, LINKPILLAR 1 NORTH deck, descent, Sengakuji-tsuji plaza, marked Route 15 crossing, and Sengakuji approach. Preserve road barriers and the deck transition even when distances are compressed. No direct station east exit is included; the municipality targets that bridge for fiscal 2028–2030. The northern temporary tunnel is separate and excluded from this first quest.

Use the OSM geometry to inspect real spatial relationships, then hand-author a small tile map. Do not rasterize every building or treat every intersecting line as connected. Respect bridge/tunnel/layer tags. PLATEAU 3D is not needed for the 2D first build and has not been downloaded.

Koizumi Gishido is a researched later destination on the temple approach. Its storefront asset remains to be referenced and generated. Matsushimaya has a strong recent exterior reference and a generated source asset; use it on a separately labeled northwest neighborhood branch. Liebe is farther south and its generated asset is an optional art reference, not part of the compact playable route. None of these businesses is a partner yet.

## 3. Chosen system shape

Use TypeScript, Vite and KAPLAY for the client. Use small DOM controllers for dialogue, settings, microphone and account screens. Do not introduce React for the first build. Initialize one KAPLAY context with `global:false`. KAPLAY loads approved assets, renders sprites, registers scenes and receives input; application code owns quest rules and saves.

For the local demo, an in-process game session owns all state and IndexedDB stores versioned snapshots. For production, a Node.js modular monolith owns durable account progress, verified speech results, billing and rewards in PostgreSQL. Both implement one GameSession contract, selected at composition time. The client renderer never receives database or provider credentials.

The production server is not an authoritative per-frame simulator. Position, facing, walking and visual timers remain local. Objective-changing actions are checked against versioned content, current inventory, budget, quest prerequisites and dialogue evidence. Ordinary movement cheating is outside the noncompetitive MVP threat model. Real reward eligibility always requires server-owned evidence.

## 4. Module ownership

| Proposed module | Sole responsibility | Calls |
| --- | --- | --- |
| `src/main.ts` | Composition, one engine context, mode selection | Public module APIs |
| `src/content/` | Validated maps, collision grids, portals, entities, quests, dialogue and asset IDs | Schemas only |
| `src/domain/` | Pure state reducer and quest/dialogue rules | Content types only |
| `src/session/` | One session controller and command queue; local or remote authority | Domain, save/API adapters |
| `src/game/` | KAPLAY scenes, camera, grid movement and drawing | Session and asset loader |
| `src/ui/` | Accessible DOM controls and captions | Session and audio player |
| `src/audio/` | Browser playback of the published voice manifest; replay, mute, scene cancellation | Published voice manifest |
| `src/storage/` | Snapshot serialization, migrations, IndexedDB | Serializable domain data |
| `server/modules/` | Auth, progress, optional STT, billing, coupons | PostgreSQL and bounded provider adapters |
| `tools/voice/` | Approved-line TTS generation and content-addressed cache | ElevenLabs server API |

KAPLAY scenes and DOM UI observe state and submit commands. Neither owns a separate inventory or quest flag set. Network adapters cannot mutate engine objects. Domain imports never reach KAPLAY, DOM, storage or ElevenLabs.

## 5. State and public contracts

The caller's flow is `openSession(worldId)`, `dispatch(command)`, `subscribe(render)`, then `closeSession()`. An interaction supplies an entity ID and intended action; the session resolves availability and returns state plus effects. UI never supplies an outcome such as "quest passed".

`GameSnapshot` contains schemaVersion, contentVersion, sessionId, revision, sceneId, spawnId, inventory quantities, walletYen, quest states, dialogue state, cosmetics and settings. The demo may additionally persist a safe tile position. Avoid live audio handles, engine objects, fetch promises, secrets and coupon redemption tokens.

`Command` is a tagged union of Interact(entityId), AdvanceDialogue(nodeId), CloseDialogue(nodeId), Choose(dialogueNodeId,choiceId), Buy(shopId,itemId,quantity), Collect(entityId), UsePortal(portalId), SubmitVerifiedSpeech(attemptId), and Resume. Every authoritative mutation uses {commandId, expectedRevision, payload}. Purchases validate the active shop catalog, dialogue context, available money and capacity. UpdateSettings(patch) is device-local; its allowed fields are volume, mute, text size and input mode. Position updates are local presentation and do not create a server transaction.

`Outcome` contains the next snapshot and declarative effects: ShowDialogue(nodeId), PlayLine(lineId), ChangeScene(sceneId,spawnId), ShowHint(reason), or CompleteQuest(questId). Each effect has a stable ID derived from its command receipt. The client deduplicates effects so a network retry cannot replay a completion celebration or voice line. Illegal transitions return a named reason without partially applying effects.

Map definitions contain grid dimensions, ground/decoration/roof layers, collision cells, walkable portals and entity anchors. Roads and railways are blocked except authored crossings. Doors have named destination/spawn pairs. Y-sort characters by foot position and place roofs in a separate foreground layer. Entering a scene cancels old listeners and audio before mounting the next scene.

## 6. Quests and dialogue

Use a finite quest state machine: not_started, active, ready_to_return, completed. Conditions are data such as visited(station), conversationPassed(shop_order), inventoryAtLeast(item,2), delivered(companion). Only the reducer/server can advance the quest.

Dialogue states are closed, showing, choosing and waiting_for_speech. Each node has speakerId, displayText, spokenText/lineId, allowed choices and optional intent rubric. Text choices keep the game playable when the microphone or TTS is unavailable. Live spoken checks are a later independent input path; TTS output is never interpreted as learner speech evidence.

Playtest one complete quest before expanding content. Prices, inventory and NPC dialogue in the game are fictional unless individually sourced. Never present a made-up offer as the shop's actual current offer.

## 7. ElevenLabs TTS

Primary design: pre-generate reviewed Japanese lines and publish complete MP3 files. Runtime synthesis is an optional later adapter, not a launch dependency. This avoids paid requests on each replay and allows pronunciation review before release.

`tools/voice/render.mjs` reads `content/dialogue.ja.json`, selects one allowlisted line, uses a configured voice, and calls POST `/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`. Baseline model: `eleven_multilingual_v2`, with Japanese text normalization. Do not send `language_code` to this model. A separate metadata command lists Japanese account voices via GET `/v2/voices?language=ja`.

`ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are server/build environment variables, never `VITE_` variables. The user will provide the key later. Voice ID selection and Japanese listening review remain required. Different NPC voices can be added by extending the build-time speaker-to-voice map, not by accepting voice IDs from players.

Cache identity includes spoken text, voice ID, model, output format and normalization settings. The script writes full files atomically, keeps a line-to-file manifest, serializes jobs with a lock, and rejects provider errors, non-audio responses and obviously invalid MP3 headers. Header checks are not decoding or listening review. A stale lock requires checking that no generation process is active.

`src/audio/` plays published clips with the browser's `HTMLAudioElement`, reading `public/audio/manifest.json`; it needs no KAPLAY context, and `src/game/` does not preload NPC audio. The adapter maintains at most one active NPC clip and stops it on advance/scene change. A user gesture enables playback. Muting/replay/captions work independently of quest logic. Failed audio leaves the written line and choices usable. Changing a line or voice invalidates its cache entry.

If runtime TTS is later needed, use authenticated line IDs, server-side text resolution, bounded concurrency, usage quotas and a complete-file cache. Streaming uses a separate browser audio adapter; do not assume KAPLAY accepts an incomplete MP3 stream. Personalized text is private and must not enter a public cache.

## 8. Saves and online migration

Local saves write only on successful commands, scene transitions and settings changes. Keep current and previous valid snapshots. Schema version 1 is the only initial format; future releases must supply a tested version-to-version migrator before increasing the version. A content-version mismatch resumes only if that version remains available, otherwise offers an explicit safe restart without silently rewriting progress. Validate schema/content versions on load; migrate explicitly or offer a safe reset. Audio is not replayed merely because a save is restored.

Remote commands are serialized per session with idempotency IDs. A stale revision reloads the authoritative snapshot. While a request is pending, show its status and disable duplicate objective mutations, but keep harmless movement responsive. On network loss, preserve the last confirmed snapshot. Optional offline practice forks into an unverified local session. It never silently merges success into coupon eligibility.

Login may import demo practice history as unverified history. It cannot import paid access, verified mastery or coupons. One active verified session per user and mission prevents cross-device state races. Content versions stay pinned until the session ends.

## 9. Production API and data boundaries

Start with one API and one worker, not microservices. Supabase Auth identifies users; PostgreSQL holds transactional state. RLS and server authorization both apply. Secrets stay in backend deployment configuration.

| Route family | Owns |
| --- | --- |
| `/sessions`, `/sessions/:id/commands` | Session snapshots, revision-checked actions |
| `/speech-attempts` | Optional learner recordings and server evaluation |
| `/voice/:lineId` | Optional authenticated runtime TTS; absent in static demo |
| `/passport` | Progress and server-created skill credentials |
| `/offers`, `/offers/:id/claim`, `/wallet` | Eligibility and coupon issuance |
| `/merchant/redemptions` | Branch-authorized one-time redemption |
| `/billing/checkout`, `/webhooks/stripe` | Purchase initiation and authoritative access |

Core tables: profiles, content_versions, sessions, command_receipts, progress, skill_credentials, subscriptions, webhook_inbox, campaigns, coupons, redemptions, jobs and audit_events. Key constraints include unique(session_id,command_id), unique(user_id,campaign_id), unique(coupon_id) on redemptions, and unique(provider_event_id). Store money as integer yen and timestamps in UTC.

Claiming a coupon checks credential policy and capacity, increments issued count, and inserts the coupon in one transaction. Redemption verifies merchant/branch and a short-lived hashed token, then changes state and records usage atomically. Existing coupons retain terms after subscription cancellation. Billing access comes from verified, deduplicated webhooks and periodic reconciliation, never a checkout redirect. No real business is assumed to have agreed to participate.

## 10. Asset pipeline and readiness

Four raster source assets were generated with the built-in image generator from inspected facade references: station, Matsushimaya, optional Liebe, and fictional home. Prompts are in `assets/source/prompts.json`. These are high-resolution draft sources, not a finished pixel-perfect sprite atlas. The station retains a visible soft halo after one correction attempt; replace or clean it before production export. Other assets need consistent grid/palette/export approval.

Source photographs remain in research and are not shipped as textures. Geometry, collision, door anchors and interaction points are authored metadata, not inferred from colored pixels. Asset IDs stay stable while hashes change. Suggested runtime footprints: station 192x128, sweets shop 96x80, bakery 80x80, home 80x96. Scale a reviewed export consistently; never stretch to arbitrary aspect ratios.

Next export gate: exact dimensions, hard transparent edges, coherent palette, foot/door anchors, legibility at game scale, and a station roof that reads against both light and dark terrain. Missing assets display an obvious development placeholder, not a silent wrong storefront.

## 11. Build order and verification

1. Validate content and build a KAPLAY gray-box outdoor map with collision and portals.
2. Implement one session reducer, home/station/shop scenes and the return-home quest.
3. Import reviewed sprite exports and prove doors, anchors, camera and mobile controls.
4. Generate and listen-review six NPC lines after the API key arrives; wire audio replay/mute/cancellation.
5. Prove save/resume, refresh, failed asset load and missing audio recovery.
6. Add production auth/state and optional learner speech. Only then add paid access and real partner coupons.

Required tests: quest cannot complete before prerequisites; money cannot become negative; repeated command changes state once; portals resolve to valid walkable spawns; blocked rails cannot be crossed; save migration rejects corrupt data; failed speech grants no credential; duplicate billing/reward requests are safe. Browser acceptance: keyboard and touch complete the quest; sound failure never blocks it; scene changes stop prior audio; refresh resumes at a safe point.

Current checks: ten mocked TTS adapter/CLI tests pass; missing key exits before network access; GeoJSON is valid and bounded. No live TTS request, playback/listening test, playable KAPLAY scene or real merchant transaction has been performed.

## 12. Architecture acceptance gate

The selected shop, dimensions, topology, fictional budget, quest transitions, command ownership, effect deduplication, save policy and deferred production features are now specified. `content/world-plan.json` is the planning contract. It is not a finished tile/collision map. The architecture gate is separate from implementation acceptance: keyboard/touch play, collision validation, runtime art review and live audio remain later build checks. A missing API key blocks only live voice validation.

## Sources

- [Map evidence and source manifest](../research/map/findings.md)
- [Shop photo and address provenance](../research/shops/references.md)
- [ElevenLabs official API research](../research/voice/elevenlabs-design.md)
- [Sengakuji official access](https://www.sengakuji.or.jp/access/)
- [Minato east bridge schedule](https://www.city.minato.tokyo.jp/kouchou/kuse/kocho/ikenshokai49/3474.html)
- [KAPLAY API](https://kaplayjs.com/docs/api/kaplay/)
