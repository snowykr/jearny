# jearny — Tabi Quest: Takanawa

A FireRed-style top-down pixel adventure for practising Japanese around Takanawa Gateway Station. It is built with KAPLAY, TypeScript and Vite.

- Spec: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Who does what:** [docs/WORKSPLIT.md](docs/WORKSPLIT.md)
- **Notion access for the agent:** [docs/NOTION-MCP.md](docs/NOTION-MCP.md) (`./scripts/setup-notion-mcp.sh`)
- Research: `research/` (map GeoJSON, shop references, ElevenLabs design)
- Content: `content/world-plan.json`, `content/dialogue.ja.json`
- Draft source art: `assets/source/`

## Setup (each device)

Requires Node 22.x (pinned in `package.json`; this is also the Vercel runtime).

```bash
git clone https://github.com/snowykr/jearny.git
cd jearny
npm install
npm run check      # typecheck + unit tests + voice tests
npm run dev        # http://localhost:5173 — arrows/WASD walk, Space/Enter interacts
./scripts/serve-demo.sh   # production build + local preview (offline demo fallback)
```

Current state on `main` is **M2**: the authored Takanawa map, interiors, sprites, walking,
collision, camera and touch controls are live, and the local session/reducer drive dialogue,
portals and the return-home quest. Voice lines are not rendered yet (`public/audio/` is empty), so
NPC speech is caption-only; game audio failure never blocks progress. M3 is the hand-played
keyboard + touch run through the full quest.

### Make your track worktree

Device 1 (Track A — world):
```bash
git fetch origin
git worktree add ../jearny-world track-a/world
cd ../jearny-world && npm install && npm run dev
```

Device 2 (Track B — logic & conversation):
```bash
git fetch origin
git worktree add ../jearny-logic track-b/logic
cd ../jearny-logic && npm install && npm run dev -- --port 5174
```

Leave the original `jearny/` checkout on `main` and use it to review and merge PRs.

## Deploy

Every push to `main` builds and publishes the game to GitHub Pages via
`.github/workflows/deploy.yml` (`npm run check`, `npm run build`, then `deploy-pages`).
The site is static; `vite.config.ts` uses `base: './'` so the same artifact works from the
project sub-path and from any other static host. Enable Pages once in the repository
settings (Source: GitHub Actions) — after that a green Deploy run publishes the URL.

```bash
npm run build
npm run preview     # serves dist/ locally, same relative URLs as Pages
```

## ElevenLabs (Track B)

Copy `.env.example` to `.env.local` (gitignored) and fill in `ELEVENLABS_API_KEY` there. Never use a `VITE_` prefix.

`ELEVENLABS_VOICE_ID` is the fallback (Ayaka, `dp4HJlekKt0HZFHL2jQg`). The demo sets one voice per NPC: guide = Ayaka `dp4HJlekKt0HZFHL2jQg`, station staff = Akane `Q3V5SJSktn49inIBeIuC`, shopkeeper = Konomi `MhnQB6oLKSlS0AIJzxtO`. Set `ELEVENLABS_VOICE_ID_GUIDE`, `ELEVENLABS_VOICE_ID_STATION_STAFF` and `ELEVENLABS_VOICE_ID_SHOPKEEPER`; unset speakers fall back to the single voice. The library voices must be added to the workspace once; see `research/voice/elevenlabs-design.md`.

```bash
node tools/voice/render.mjs plan                                      # validate all 6 lines: voice, cache key, cached/pending (no key, no network)
node --env-file=.env.local tools/voice/render.mjs check               # list account Japanese voices, no synthesis
node --env-file=.env.local tools/voice/render.mjs render shop.welcome
```

Rendered clips go to `public/audio/`. Listen to each one before publishing it.
