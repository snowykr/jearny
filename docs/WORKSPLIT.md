# Work split: two devices, two worktrees

**The source of truth for tasks is GitHub Issues.** Filter by the `track-a` or `track-b` label and by milestone (M1/M2/M3). Pick an issue, assign yourself, branch or commit on your track branch, and close the issue from the PR with `Closes #N`. Art rules are in [ART.md](ART.md): Image Gen 2 only, matched to the existing source sprites.

The goal is that both tracks can push all day without merge conflicts. Each track **owns directories**, not features. The only shared surface is `src/contracts/` plus a few root files, and they change only through small PRs to `main`.

| | Track A — World | Track B — Logic & conversation |
|---|---|---|
| Who | Device 1 (this machine) | Device 2 (teammate) |
| Branch | `track-a/world` | `track-b/logic` |
| Worktree | `../jearny-world` | `../jearny-logic` |
| Owns | `src/game/`, `src/content/maps/`, `public/sprites/`, `assets/`, `tools/art/` | `src/domain/`, `src/session/`, `src/storage/`, `src/ui/`, `src/audio/`, `src/content/` (except `maps/`), `content/`, `tools/voice/`, `public/audio/` |
| Runs against | Stub session in `src/session/` (until B ships the real one) | Placeholder map and gray box (until A ships real maps) |
| Spec sections | ARCHITECTURE §2, §5 (maps), §10 | ARCHITECTURE §5–8 |

**Shared (PR to `main` only, keep tiny):** `src/contracts/**`, `src/main.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `docs/`, `.github/`.

## Integration seam

```
main.ts ─ openSession()      (B: src/session)  ──► GameSession contract
        ─ mountUi(root, s)   (B: src/ui)
        ─ handleAudioEffects (B: src/audio)
        ─ startGame(canvas,s)(A: src/game)      ──► dispatches Commands, renders snapshot + effects
```

- Track A **never** decides outcomes. It turns the player's input into `Interact`, `UsePortal` and `Collect` commands, and responds to `ChangeScene` effects and `snapshot.sceneId`.
- Track B **never** touches KAPLAY. Its domain is pure TypeScript. The UI is DOM-only, in `#ui-root`.
- Both sides use the IDs in `src/contracts/ids.ts`. If a map needs a new entity, add the ID there first (PR to main).
- Keyboard ownership: A handles arrows/WASD for movement and Space/Enter for "interact" **when `snapshot.dialogue.status === 'closed'`**. When a dialogue is open, B's UI owns Space/Enter/arrows for advancing and choosing.

## Track A — World (this device)

1. **Authored maps** in `src/content/maps/`: `takanawa` (128×96, laid out from the anchors in `content/world-plan.json`), `home-interior` and `shop-interior` (16×12). Rail is blocked, Route 15 can only be crossed at the crossing, and the plaza connects to the station by the deck portal. Add spawns, portals and entity anchors using the registry IDs.
2. **Map validation tests** (`src/content/maps/*.test.ts`): every portal leads to a walkable spawn, rail cells are never walkable, and BFS reaches every `mandatoryConnections` pair.
3. **Scenes**: load a map from `snapshot.sceneId`/`spawnId`. Add grid walking with tweened steps and facing, Y-sort by feet, a roof foreground layer, a camera clamped to the map, and cleanup on scene change.
4. **Interaction**: find the entity on the faced tile, then dispatch `Interact`. Stepping onto a portal dispatches `UsePortal`. Re-enter scenes on `ChangeScene`.
5. **Touch controls**: D-pad plus an action button in `src/game/touch.ts`.
6. **Art**: turn `assets/source/*.png` into runtime sprites in `public/sprites/` at the sizes in `assets/source/manifest.json`. Add a tileset, player and NPC sprites, and a loader that shows an obvious placeholder when an asset is missing.

## Track B — Logic & conversation (teammate)

1. **Content** in `src/content/`: the quest definition, dialogue node graph (guide, station_staff, shopkeeper), and the Matsushimaya catalog (mochi ¥300, fictional), built from `content/world-plan.json` and `content/dialogue.ja.json`.
2. **Reducer** in `src/domain/`: a pure `reduce(snapshot, command, content) → Outcome`. It covers the quest FSM, the dialogue FSM, Buy validation, and effect IDs derived from `commandId`.
3. **Domain tests**: the quest cannot complete before its prerequisites, money never goes negative, a repeated command changes state once, and an illegal transition returns a named reason with no partial effects.
4. **Session** in `src/session/`: replace the stub with a local session that has a command queue, revision checks, and effect deduplication.
5. **Storage** in `src/storage/`: IndexedDB snapshots (current and previous) with schema validation that rejects corrupt data.
6. **UI** in `src/ui/`: a Japanese dialogue overlay with choices (keyboard and touch), a HUD showing wallet, inventory and quest, and settings (mute, text size).
7. **Audio** in `src/audio/`: play `public/audio/` clips from the voice manifest, keep only one NPC clip active, and stop it on advance or scene change. When the API key arrives, render the 6 lines with `tools/voice/render.mjs`.

## Milestones (sync points)

- **M1 — independent:** A walks the real outdoor map with collision on the stub session. B passes reducer tests and shows dialogue in a page using the placeholder map.
- **M2 — first merge:** B's real session lands on main, and A rebases. Talking to the guide opens dialogue, and doors change scenes through the reducer.
- **M3 — playable quest:** home → station → shop (buy 2 mochi) → home completes the quest on both keyboard and touch.

## Daily git loop

```bash
git fetch origin
git rebase origin/main          # pick up the other track's merged work + contract changes
npm install                     # if package-lock changed
npm run check                   # typecheck + unit tests + voice tests
git push --force-with-lease     # your track branch only
```

Open a PR `track-x/... → main` at each milestone, or whenever the other track needs your work. Keep the PRs small and merge them often. `scripts/check-ownership.sh` warns when a branch edits files outside its track.
