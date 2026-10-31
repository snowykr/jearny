#!/usr/bin/env bash
# Registers the Notion MCP server for GJC and runs the one-time OAuth sign-in.
#
# Each teammate runs this on their own machine with their own Notion account.
# Tokens are per-person and must never be copied between machines.
set -euo pipefail

SERVER_NAME="${SERVER_NAME:-notion}"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.mcp-auth/notion}"
NOTION_URL="https://mcp.notion.com/mcp"

command -v gjc >/dev/null 2>&1 || { echo "error: gjc not found on PATH" >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "error: npx not found; install Node 20.6+ first" >&2; exit 1; }

echo "==> Registering '${SERVER_NAME}' for GJC (user scope, isolated token cache)"
gjc mcp add "$SERVER_NAME" \
  --command npx \
  --arg=-y \
  --arg mcp-remote \
  --arg "$NOTION_URL" \
  --env MCP_REMOTE_CONFIG_DIR="$CONFIG_DIR" \
  --timeout 60000 \
  --force

cat <<'TXT'

==> Now signing in to Notion (one time)

  1. A browser window opens. Sign in with the Notion account that can see the
     target workspace, and pick that workspace on the consent screen
     (for this project: "jearny").
  2. Approve the connection.
  3. If the browser does not return to a "connected" page, copy the full
     http://localhost:.../oauth/callback?code=... URL from the address bar and
     deliver it to the waiting process:
         curl -sS "<paste the URL>"
  4. When the log prints "Proxy established successfully", press Ctrl+C.
     The token is already saved.

TXT

exec npx -y mcp-remote "$NOTION_URL"
