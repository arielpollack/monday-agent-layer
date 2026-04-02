# OpenClaw Plugin for monday Agent Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an OpenClaw plugin that wraps the official monday.com MCP toolkit, routing all API traffic through the monday-agent-layer proxy for permission enforcement and audit logging.

**Architecture:** The plugin uses `MondayAgentToolkit` from `@mondaydotcomorg/agent-toolkit/mcp`, passing the proxy URL as `mondayApiEndpoint` and the `mat_` agent token as `mondayApiToken`. A `SKILL.md` instructs agents to always use this plugin for monday.com access. No server-side changes needed.

**Tech Stack:** TypeScript, OpenClaw Plugin SDK, `@mondaydotcomorg/agent-toolkit`, `@modelcontextprotocol/sdk`

---

### Task 1: Initialize the plugin package

**Files:**
- Create: `packages/monday-mcp/package.json`
- Create: `packages/monday-mcp/tsconfig.json`

- [ ] **Step 1: Create the package directory**

```bash
mkdir -p packages/monday-mcp/skills/monday-api
```

- [ ] **Step 2: Write `package.json`**

Create `packages/monday-mcp/package.json`:

```json
{
  "name": "@mondaycom/openclaw-plugin-monday",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@mondaydotcomorg/agent-toolkit": "^4.2.1",
    "@modelcontextprotocol/sdk": "^1.12.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

Create `packages/monday-mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["index.ts"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd packages/monday-mcp && npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/monday-mcp/package.json packages/monday-mcp/tsconfig.json packages/monday-mcp/package-lock.json
git commit -m "chore: scaffold openclaw plugin package for monday agent layer"
```

---

### Task 2: Write the plugin manifest

**Files:**
- Create: `packages/monday-mcp/openclaw.plugin.json`

- [ ] **Step 1: Write `openclaw.plugin.json`**

Create `packages/monday-mcp/openclaw.plugin.json`:

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
        "description": "Proxy base URL",
        "default": "https://monday-agent-layer.ariel-kfir.workers.dev"
      }
    },
    "required": ["agentToken"]
  },
  "metadata": {
    "skills": ["./skills/monday-api"]
  }
}
```

Note: The `proxyUrl` default uses the workers.dev subdomain. Update the subdomain to match the actual deployment. Find it by running `wrangler whoami` or checking the last deploy output.

- [ ] **Step 2: Commit**

```bash
git add packages/monday-mcp/openclaw.plugin.json
git commit -m "feat: add openclaw plugin manifest for monday agent layer"
```

---

### Task 3: Write the plugin entry point

**Files:**
- Create: `packages/monday-mcp/index.ts`

- [ ] **Step 1: Write `index.ts`**

Create `packages/monday-mcp/index.ts`:

```typescript
import { MondayAgentToolkit } from "@mondaydotcomorg/agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

interface PluginConfig {
  agentToken: string;
  proxyUrl?: string;
}

const DEFAULT_PROXY_URL = "https://monday-agent-layer.ariel-kfir.workers.dev";

export async function startServer(config: PluginConfig): Promise<void> {
  const proxyUrl = config.proxyUrl ?? DEFAULT_PROXY_URL;
  const endpoint = `${proxyUrl.replace(/\/$/, "")}/api/graphql`;

  const toolkit = new MondayAgentToolkit({
    mondayApiToken: config.agentToken,
    mondayApiEndpoint: endpoint,
    toolsConfiguration: {
      readOnlyMode: false,
    },
  });

  const transport = new StdioServerTransport();
  await toolkit.connect(transport);
}

// When run directly as an MCP server (e.g., via npx or openclaw)
const agentToken = process.env.MONDAY_AGENT_TOKEN;
if (agentToken) {
  startServer({
    agentToken,
    proxyUrl: process.env.MONDAY_PROXY_URL,
  }).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
```

This supports two usage modes:
1. **OpenClaw plugin** — OpenClaw calls `startServer` with config from `openclaw.plugin.json`
2. **Standalone MCP server** — Run directly with `MONDAY_AGENT_TOKEN` env var (e.g., for Claude Desktop, Cursor, Gemini CLI)

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/monday-mcp && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/monday-mcp/index.ts
git commit -m "feat: implement plugin entry point wrapping MondayAgentToolkit with proxy endpoint"
```

---

### Task 4: Write the SKILL.md

**Files:**
- Create: `packages/monday-mcp/skills/monday-api/SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

Create `packages/monday-mcp/skills/monday-api/SKILL.md`:

```markdown
---
name: monday-api
description: Use this skill for all monday.com API interactions. Routes traffic through the monday Agent Layer proxy for permission enforcement and audit logging.
---

# monday.com API Access

All monday.com API access MUST go through the monday Agent Layer proxy. This plugin handles it automatically.

## Rules

1. **Never call api.monday.com directly.** Always use the monday.com tools provided by this plugin.
2. **Authentication is handled automatically.** Your agent token is pre-configured — do not set or override authorization headers.
3. **Permissions are enforced server-side.** If your token is read-only, mutations will be rejected with a 403 error. Do not attempt to bypass this.
4. **All requests are logged.** Every API call is recorded for audit purposes.

## Available Tools

Use the tools registered by this plugin to interact with monday.com:

| Category | Tools |
|----------|-------|
| Boards | `list_boards`, `get_board_info`, `create_board`, `archive_board` |
| Items | `create_item`, `get_board_items_page`, `change_item_column_values`, `delete_item` |
| Updates | `create_update`, `get_updates` |
| Structure | `create_group`, `create_column`, `get_column_type_info` |
| Workspace | `list_workspaces`, `workspace_info` |
| Advanced | `explore_api`, `execute_code` |

## Error Handling

- **401:** Your agent token is invalid or revoked. Contact the token owner.
- **403:** You attempted a mutation with a read-only token. Check your permissions.
- **502:** The proxy could not reach monday.com. Retry after a moment.
```

- [ ] **Step 2: Commit**

```bash
git add packages/monday-mcp/skills/monday-api/SKILL.md
git commit -m "feat: add SKILL.md instructing agents to use proxy for monday.com access"
```

---

### Task 5: Add standalone usage support (CLI + MCP config examples)

**Files:**
- Create: `packages/monday-mcp/README.md`

- [ ] **Step 1: Write `README.md`**

Create `packages/monday-mcp/README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/monday-mcp/README.md
git commit -m "docs: add README with setup instructions for openclaw and standalone MCP usage"
```

---

### Task 6: Verify proxy compatibility

The proxy currently expects `Authorization: Bearer mat_...` and a JSON body with a `query` field. The `MondayAgentToolkit` sends `Authorization: <token>` (no `Bearer` prefix) by default.

**Files:**
- Modify: `packages/monday-mcp/index.ts`

- [ ] **Step 1: Check how the toolkit sends the Authorization header**

Read `@mondaydotcomorg/api` source to confirm the header format:

```bash
grep -r "Authorization" /tmp/monday-api/package/dist/esm/ --include="*.js" | head -10
```

- [ ] **Step 2: Fix token format if needed**

If the toolkit sends `Authorization: <token>` without `Bearer ` prefix, update `index.ts` to prepend it:

In `packages/monday-mcp/index.ts`, ensure the token is passed with `Bearer ` prefix:

```typescript
mondayApiToken: `Bearer ${config.agentToken}`,
```

If the toolkit already adds `Bearer `, pass the raw token:

```typescript
mondayApiToken: config.agentToken,
```

- [ ] **Step 3: Verify the proxy's agent-auth middleware accepts the resulting header**

The middleware in `src/middleware/agent-auth.ts:8` checks `authHeader?.startsWith("Bearer mat_")`. Confirm the header arriving at the proxy matches this pattern. If the toolkit double-prefixes (e.g., `Bearer Bearer mat_...`), adjust accordingly.

- [ ] **Step 4: Commit if changes were made**

```bash
git add packages/monday-mcp/index.ts
git commit -m "fix: ensure correct Authorization header format for proxy compatibility"
```

---

### Task 7: End-to-end manual test

- [ ] **Step 1: Deploy the proxy (if not already deployed)**

```bash
npm run deploy
```

- [ ] **Step 2: Create a test agent token**

Open the dashboard, log in, create a read-only token. Copy the `mat_...` value.

- [ ] **Step 3: Test the plugin as a standalone MCP server**

```bash
cd packages/monday-mcp
MONDAY_AGENT_TOKEN=mat_your_token npx tsx index.ts
```

In a separate terminal, use an MCP client or Claude Desktop to call `list_boards`. Verify:
- The call succeeds and returns board data
- An audit log entry appears in the dashboard

- [ ] **Step 4: Test mutation blocking with a read-only token**

Call `create_board` or another mutation tool. Verify:
- The proxy returns a 403 error
- The audit log shows `allowed: false`

- [ ] **Step 5: Test with a readwrite token**

Create a readwrite token, reconfigure, and verify mutations succeed.
