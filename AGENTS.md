# Agent instructions — jearny (Tabi Quest)

A KAPLAY + TypeScript + Vite pixel adventure set around Takanawa Gateway Station. The spec is `docs/ARCHITECTURE.md`.

**Before editing, read `docs/WORKSPLIT.md`.** Two people work in parallel on separate branches and worktrees:

- On a `track-a/*` branch, edit only `src/game/`, `src/content/maps/`, `public/sprites/` and `assets/`.
- On a `track-b/*` branch, edit only `src/domain/`, `src/session/`, `src/storage/`, `src/ui/`, `src/audio/`, `src/content/` (not `maps/`), `content/`, `tools/voice/` and `public/audio/`.
- `src/contracts/`, `src/main.ts` and the root config files are shared. Change them only in a separate small PR to `main`, and say so to the user.

Rules:
- The domain is pure: no KAPLAY, DOM, storage or network imports in `src/domain/`.
- KAPLAY scenes and the DOM UI submit `Command`s and render the `GameSnapshot`. They never own quest or inventory state.
- Use the IDs from `src/contracts/ids.ts`. Do not invent string IDs inline.
- Never put `ELEVENLABS_*` in a `VITE_` variable or in client code.

Verify with `npm run check` (typecheck, vitest, voice tests). Before pushing, run `scripts/check-ownership.sh`.
