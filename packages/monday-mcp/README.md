# monday.com Agent Layer — MCP Plugin

Routes all monday.com API traffic through the [monday Agent Layer](../../README.md) proxy for permission enforcement and audit logging.

## Quick Start — Drop This to Your Agent

Give your agent a `mat_` token and this repo URL. Paste this message to your agent:

> Install the monday.com agent layer plugin from `https://github.com/arielpollack/monday-agent-layer`. Clone the repo, run `npm install` inside `packages/monday-mcp/`, then configure yourself as an MCP server pointing to `packages/monday-mcp/index.ts` with the environment variable `MONDAY_AGENT_TOKEN` set to `mat_YOUR_TOKEN_HERE`. Read `packages/monday-mcp/skills/monday-api/SKILL.md` for usage rules — all monday.com API access must go through this plugin, never call api.monday.com directly.

Replace `mat_YOUR_TOKEN_HERE` with the actual token from the dashboard.

## Setup

### 1. Get an agent token

1. Go to the monday Agent Layer dashboard
2. Log in with your monday.com account
3. Create a new agent token (read-only or read+write)
4. Copy the `mat_...` token

### 2a. OpenClaw Plugin

```bash
openclaw plugins install https://github.com/arielpollack/monday-agent-layer#packages/monday-mcp
openclaw plugins configure monday-agent-layer --set agentToken=mat_your_token_here
openclaw plugins enable monday-agent-layer
```

### 2b. Claude Desktop / Cursor / Gemini CLI

Add to your MCP config:

```json
{
  "mcpServers": {
    "monday": {
      "command": "node",
      "args": ["./packages/monday-mcp/index.ts"],
      "env": {
        "MONDAY_AGENT_TOKEN": "mat_your_token_here"
      }
    }
  }
}
```

Or with npx (once published):

```json
{
  "mcpServers": {
    "monday": {
      "command": "npx",
      "args": ["-y", "@mondaycom/openclaw-plugin-monday"],
      "env": {
        "MONDAY_AGENT_TOKEN": "mat_your_token_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONDAY_AGENT_TOKEN` | Yes | Your `mat_...` agent token |
| `MONDAY_PROXY_URL` | No | Proxy base URL (defaults to production) |
