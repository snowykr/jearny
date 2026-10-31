# Notion MCP for this project

Connect the `jearny` Notion workspace to GJC so the agent can read and write project
docs. This is a **per-person, per-machine** setup: every teammate authorizes their own
Notion account. A token is bound to one account's permissions and must never be shared
or committed.

## Why a bridge is needed

Notion's MCP server is a remote OAuth server at `https://mcp.notion.com/mcp`. GJC
(v0.19.x) can register remote HTTP servers but exposes **no public MCP OAuth entry
point** for standalone sessions, so a plain `--type http` registration fails with 401.
`mcp-remote` performs the OAuth (PKCE + dynamic client registration) and speaks stdio
to GJC, caching the token under `MCP_REMOTE_CONFIG_DIR`.

## Setup

Prerequisite: Node 20.6+ (22 recommended) and `gjc` on `PATH`.

```bash
./scripts/setup-notion-mcp.sh
```

The script registers the server, then starts the bridge. Approve in the browser,
choose the **jearny** workspace, and press `Ctrl+C` once the log prints
`Proxy established successfully`. The token is already written at that point.

Verify:

```bash
gjc mcp list            # "notion  stdio  npx -y mcp-remote https://mcp.notion.com/mcp"
```

Then start a **new** GJC session — MCP servers are loaded at session start:

```bash
gjc
# in the session: "list my 3 most recent Notion pages"
```

Tools appear under the `notion` server and are deferred behind tool search by default
(`mcp.discoveryDeferAutoload: true`), so activation happens on demand.

## Workspaces

One connection sees **one** workspace — the one selected during consent. This project's
docs live in `jearny`. If you also need personal Notion, register a second server with
its own cache so the two do not collide:

```bash
gjc mcp add notion-personal \
  --command npx --arg=-y --arg mcp-remote \
  --arg https://mcp.notion.com/mcp \
  --env MCP_REMOTE_CONFIG_DIR="$HOME/.mcp-auth/notion-personal" \
  --timeout 60000
MCP_REMOTE_CONFIG_DIR="$HOME/.mcp-auth/notion-personal" \
  npx -y mcp-remote https://mcp.notion.com/mcp
```

## Guests and permissions

A guest of the workspace can run the same setup; the connection inherits **that guest's
own permissions**. Pages the guest cannot open stay invisible to their agent, and
nothing a guest does through MCP bypasses Notion's access rules. Do not hand a teammate
your token file to "save time" — it would grant your access, not theirs.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401` on every call | Token belongs to a different workspace, or expired | Re-run the bridge; approve again |
| Browser never returns to `localhost` | Browser blocked the loopback redirect | Copy the `http://localhost:.../oauth/callback?...` URL and `curl -sS "<url>"` |
| `EADDRINUSE` on the callback port | Another `mcp-remote` instance is signing in | Finish or kill that instance; the port is derived from the server URL |
| Tools missing in an open session | MCP loads at session start | Start a new `gjc` session |
| `object_not_found` for a known page | Page is in another workspace | Re-authorize and select that workspace (separate cache dir if you need both) |

## Security notes

- Tokens live under `~/.mcp-auth/<name>/` (mode 700). Never commit, paste, or copy them.
- Revoke access in Notion: **Settings → Connections** (or the workspace's MCP client
  management) and remove the client.
- The agent can read anything the authorized account can read, and write with
  `notion-create-pages` / `notion-update-page`. Treat workspace docs as live data.
