#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
npm install --silent 2>/dev/null

ENTRY_POINT="$(pwd)/index.ts"

cat <<EOF

monday.com Agent Layer MCP — setup complete.

Add this MCP server to your configuration:

{
  "mcpServers": {
    "monday": {
      "command": "npx",
      "args": ["tsx", "$ENTRY_POINT"],
      "env": {
        "MONDAY_AGENT_TOKEN": "mat_YOUR_TOKEN_HERE"
      }
    }
  }
}

Replace mat_YOUR_TOKEN_HERE with your agent token from the dashboard.

EOF
