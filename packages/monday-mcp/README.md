# monday.com Agent Layer — MCP Plugin

Routes all monday.com API traffic through the [monday Agent Layer](../../README.md) proxy for permission enforcement and audit logging.

## Quick Start — Drop This to Your Agent

Give your agent a `mat_` token and paste this message:

> Set up the monday.com agent layer MCP server so you can access monday.com APIs. Try to do these steps yourself — if any step fails due to permissions, tell the user exactly which step to run manually.
>
> 1. `git clone https://github.com/arielpollack/monday-agent-layer.git`
> 2. `cd monday-agent-layer/packages/monday-mcp && npm install`
> 3. Add an MCP server to your config with command `npx tsx` and arg `/ABSOLUTE/PATH/TO/monday-agent-layer/packages/monday-mcp/index.ts`, with environment variable `MONDAY_AGENT_TOKEN` set to `mat_YOUR_TOKEN_HERE`.
> 4. Read the file `monday-agent-layer/packages/monday-mcp/skills/monday-api/SKILL.md` and follow its rules — all monday.com access must go through this MCP server, never call api.monday.com directly.

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
