# OpenClaw Plugin for monday Agent Layer

**Date:** 2026-04-03
**Status:** Approved

## Problem

AI agents (primarily OpenClaw agents) that need to interact with monday.com currently call the API directly. The monday-agent-layer proxy exists to enforce per-agent permissions and audit logging, but agents have no easy way to discover and use it. We need a turnkey plugin that makes agents route all monday.com traffic through the proxy automatically.

## Solution

An OpenClaw plugin (`packages/monday-mcp/`) that wraps the official `@mondaydotcomorg/agent-toolkit` package. The toolkit's `MondayAgentToolkit` class already supports a `mondayApiEndpoint` config option — we pass the proxy URL there and the `mat_` agent token as `mondayApiToken`. No server-side changes needed.

Agents get all the rich monday.com MCP tools (`list_boards`, `create_item`, `explore_api`, etc.) with all traffic transparently routed through the proxy for permission enforcement and audit logging.

## Design

### Key Discovery

`MondayAgentToolkit` from `@mondaydotcomorg/agent-toolkit/mcp` accepts:
- `mondayApiToken` — we pass the `mat_` agent token
- `mondayApiEndpoint` — we pass `{proxyUrl}/api/graphql`
- `mondayApiVersion` — optional, passed through
- `toolsConfiguration.readOnlyMode` — optional, can mirror the token's permission level

The toolkit has pre-built tool schemas (no runtime schema fetching from monday.com needed for the default `api` mode). It translates tool calls into GraphQL and sends them to the configured endpoint.

### Directory Structure

```
packages/monday-mcp/
├── package.json
├── openclaw.plugin.json
├── index.ts
├── skills/
│   └── monday-api/
│       └── SKILL.md
└── tsconfig.json
```

### `openclaw.plugin.json`

```json
{
  "id": "monday-agent-layer",
  "name": "monday.com Agent Layer",
  "description": "Proxied access to monday.com API with permission enforcement and audit logging.",
  "version": "1.0.0",
  "extensions": ["./index.ts"],
  "configSchema": {
    "type": "object",
    "properties": {
      "agentToken": {
        "type": "string",
        "description": "Your mat_ agent token from the monday Agent Layer dashboard",
        "sensitive": true
      },
      "proxyUrl": {
        "type": "string",
        "description": "Proxy base URL (defaults to production workers.dev URL)",
        "default": "https://monday-agent-layer.<account-subdomain>.workers.dev"
      }
    },
    "required": ["agentToken"]
  },
  "metadata": {
    "skills": ["./skills/monday-api"]
  }
}
```

### `index.ts`

Uses `definePluginEntry` from the OpenClaw Plugin SDK. On setup:

1. Reads `agentToken` and `proxyUrl` from plugin config
2. Creates a `MondayAgentToolkit` with:
   - `mondayApiToken`: the `mat_` token (prefixed with `Bearer ` if the toolkit expects it, or raw — needs verification during implementation)
   - `mondayApiEndpoint`: `{proxyUrl}/api/graphql`
3. Connects the toolkit to the MCP transport

This is essentially the same as the official `@mondaydotcomorg/monday-api-mcp` entry point, but with the endpoint overridden.

### `SKILL.md`

```markdown
---
name: monday-api
description: Use this skill for all monday.com API interactions. Routes traffic through the monday Agent Layer proxy for permission enforcement and audit logging.
---

# monday.com API Access

All monday.com API access MUST go through the monday Agent Layer proxy.

## Rules

1. **Never call api.monday.com directly.** Always use the monday.com tools provided by this plugin.
2. **Authentication is handled automatically.** Your agent token is pre-configured — do not set or override authorization headers.
3. **Permissions are enforced server-side.** If your token is read-only, mutations will be rejected with a 403 error. Do not attempt to bypass this.
4. **All requests are logged.** Every API call is recorded for audit purposes.

## Available Tools

Use the tools registered by this plugin to interact with monday.com:
- Board management (list, create, archive)
- Item CRUD (create, read, update, delete)
- Column operations (create, update values)
- Groups and workspaces
- Updates/comments
- API exploration (`explore_api`) and dynamic code execution (`execute_code`)

## Error Handling

- **401:** Your agent token is invalid or revoked. Contact the token owner.
- **403:** You attempted a mutation with a read-only token. Check your permissions.
- **502:** The proxy could not reach monday.com. Retry after a moment.
```

### `package.json`

```json
{
  "name": "@mondaycom/openclaw-plugin-monday",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@mondaydotcomorg/agent-toolkit": "^4.2.1",
    "@modelcontextprotocol/sdk": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

## What Agents Get

All the tools from the official monday.com MCP, including:

| Category | Tools |
|----------|-------|
| Boards | `list_boards`, `get_board_info`, `create_board`, `archive_board` |
| Items | `create_item`, `get_board_items_page`, `change_item_column_values`, `delete_item` |
| Updates | `create_update`, `get_updates` |
| Structure | `create_group`, `create_column`, `get_column_type_info` |
| Workspace | `list_workspaces`, `workspace_info` |
| Advanced | `explore_api`, `execute_code` |

All traffic is transparently proxied through the agent layer. The agent doesn't know there's a proxy — it uses the same tools and patterns as the official MCP.

## Testing

- **Plugin:** Manual testing by installing locally with `openclaw plugins install ./packages/monday-mcp` and verifying tools work against the proxy.
- **Integration check:** Run a read-only query through the plugin, verify it appears in audit logs on the dashboard.

## Future Considerations

- **Upstream PR:** Contribute a `--base-url` flag to `@mondaydotcomorg/monday-api-mcp` CLI so the wrapper becomes unnecessary for non-OpenClaw setups.
- **Custom domain:** Once a custom domain is set up, update the default `proxyUrl` in the plugin config.
- **ClawHub publishing:** Publish to ClawHub once the plugin is stable, so agents can install it with `openclaw plugins install monday-agent-layer`.
