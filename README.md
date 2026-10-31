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

## ElevenLabs (Track B, later)

Copy `.env.example` to `.env.local`, which git ignores, and fill in the key there. Never use a `VITE_` prefix.

```bash
node --env-file=.env.local tools/voice/render.mjs check            # list Japanese voices, no synthesis
node --env-file=.env.local tools/voice/render.mjs render shop.welcome
```

Rendered clips go to `public/audio/`. Listen to each one before publishing it.
