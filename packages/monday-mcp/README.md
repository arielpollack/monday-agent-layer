# monday.com Agent Layer — MCP Plugin

Routes all monday.com API traffic through the [monday Agent Layer](../../README.md) proxy for permission enforcement and audit logging.

## Setup

### 1. Get an agent token

1. Go to the monday Agent Layer dashboard
2. Log in with your monday.com account
3. Create a new agent token (read-only or read+write)
4. Copy the `mat_...` token

### 2a. OpenClaw Plugin

```bash
openclaw plugins install ./packages/monday-mcp
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
