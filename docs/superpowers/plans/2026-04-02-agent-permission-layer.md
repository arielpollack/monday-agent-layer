# Agent Permission Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that proxies monday.com GraphQL API requests with per-agent permission enforcement and audit logging.

**Architecture:** Single Hono app on Cloudflare Workers. KV stores agent tokens and user monday tokens. D1 stores audit logs. OAuth authenticates dashboard users. GQL mutation detection enforces read-only vs read+write permissions.

**Tech Stack:** Cloudflare Workers, Hono, KV, D1, Vitest with @cloudflare/vitest-pool-workers

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Users/ariel/develop/monday-agent-layer
npm init -y
npm install hono
npm install -D wrangler typescript vitest @cloudflare/vitest-pool-workers @cloudflare/workers-types
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "monday-agent-layer"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "KV"
id = "PLACEHOLDER"

[[d1_databases]]
binding = "DB"
database_name = "monday-agent-layer-db"
database_id = "PLACEHOLDER"
migrations_dir = "migrations"
```

Note: Replace PLACEHOLDER IDs after running:
```bash
wrangler kv namespace create KV
wrangler d1 create monday-agent-layer-db
```

Secrets to set after deploy:
```bash
wrangler secret put JWT_SECRET
wrangler secret put MONDAY_CLIENT_ID
wrangler secret put MONDAY_CLIENT_SECRET
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.dev.vars
```

- [ ] **Step 6: Add scripts to package.json**

Add to the `"scripts"` section:
```json
{
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 7: Create minimal src/index.ts to verify setup**

```typescript
import { Hono } from "hono";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));

export default app;
```

- [ ] **Step 8: Verify setup compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json wrangler.toml vitest.config.ts .gitignore src/index.ts
git commit -m "chore: scaffold cloudflare worker project with hono"
```

---

### Task 2: Types & D1 Migration

**Files:**
- Create: `src/types.ts`
- Create: `migrations/0001_create_audit_logs.sql`
- Create: `test/helpers.ts`

- [ ] **Step 1: Create shared types**

```typescript
// src/types.ts

export type Env = {
  Bindings: {
    KV: KVNamespace;
    DB: D1Database;
    JWT_SECRET: string;
    MONDAY_CLIENT_ID: string;
    MONDAY_CLIENT_SECRET: string;
  };
  Variables: {
    userId: string;
    agentToken: AgentTokenData;
  };
};

export interface AgentTokenData {
  userId: string;
  label: string;
  permission: "read" | "readwrite";
  createdAt: string;
  lastUsedAt: string;
}

export interface UserData {
  mondayToken: string;
  name: string;
  email: string;
}
```

- [ ] **Step 2: Create D1 migration**

```sql
-- migrations/0001_create_audit_logs.sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  token_label TEXT NOT NULL,
  user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  gql_body TEXT NOT NULL,
  allowed INTEGER NOT NULL,
  response_status INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_token_id ON audit_logs(token_id);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

- [ ] **Step 3: Create test helper for D1 setup**

```typescript
// test/helpers.ts
import { env } from "cloudflare:test";

export async function setupD1() {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      token_label TEXT NOT NULL,
      user_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      gql_body TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      response_status INTEGER,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types.ts migrations/0001_create_audit_logs.sql test/helpers.ts
git commit -m "feat: add shared types and D1 migration for audit logs"
```

---

### Task 3: GQL Parser (TDD)

**Files:**
- Create: `test/services/gql-parser.test.ts`
- Create: `src/services/gql-parser.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/services/gql-parser.test.ts
import { describe, it, expect } from "vitest";
import { containsMutation } from "../../src/services/gql-parser";

describe("containsMutation", () => {
  it("returns false for shorthand query", () => {
    expect(containsMutation("{ boards { id name } }")).toBe(false);
  });

  it("returns false for named query", () => {
    expect(containsMutation("query GetBoards { boards { id name } }")).toBe(false);
  });

  it("returns true for shorthand mutation", () => {
    expect(containsMutation('mutation { create_board(board_name: "test") { id } }')).toBe(true);
  });

  it("returns true for named mutation", () => {
    expect(containsMutation("mutation CreateBoard { create_board { id } }")).toBe(true);
  });

  it("returns false when mutation appears only in a string literal", () => {
    expect(containsMutation('query { items(name: "mutation test") { id } }')).toBe(false);
  });

  it("returns false when mutation appears only in a comment", () => {
    expect(containsMutation("# mutation\nquery { boards { id } }")).toBe(false);
  });

  it("returns false when mutation is a substring of another word", () => {
    expect(containsMutation('query { items(ids: ["mutation_log"]) { id } }')).toBe(false);
  });

  it("returns true for mutation with leading whitespace", () => {
    expect(containsMutation("  \n  mutation { create_board { id } }")).toBe(true);
  });

  it("returns true for mutation after a comment", () => {
    expect(containsMutation("# get stuff\nmutation { create_board { id } }")).toBe(true);
  });

  it("returns false for block string containing mutation", () => {
    expect(containsMutation('query { items { column_values(value: """mutation foo""") { id } } }')).toBe(false);
  });

  it("handles empty string", () => {
    expect(containsMutation("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/services/gql-parser.test.ts`
Expected: FAIL — cannot find module `../../src/services/gql-parser`

- [ ] **Step 3: Implement the GQL parser**

```typescript
// src/services/gql-parser.ts

export function containsMutation(query: string): boolean {
  // Strip block strings, regular strings, and single-line comments
  const stripped = query.replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|#[^\n]*/g, "");
  return /\bmutation\b/.test(stripped);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/services/gql-parser.test.ts`
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/gql-parser.ts test/services/gql-parser.test.ts
git commit -m "feat: add GQL mutation detection parser with tests"
```

---

### Task 4: Token Service (TDD)

**Files:**
- Create: `test/services/tokens.test.ts`
- Create: `src/services/tokens.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/services/tokens.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createToken, getToken, listTokens, revokeToken, updateLastUsed, hashToken } from "../../src/services/tokens";

describe("token service", () => {
  beforeEach(async () => {
    // Clean KV state between tests
    const keys = await env.KV.list({ prefix: "token:" });
    for (const key of keys.keys) {
      await env.KV.delete(key.name);
    }
    const userKeys = await env.KV.list({ prefix: "user_tokens:" });
    for (const key of userKeys.keys) {
      await env.KV.delete(key.name);
    }
  });

  it("creates a token with mat_ prefix and stores it in KV", async () => {
    const token = await createToken(env.KV, "user1", "My Agent", "read");
    expect(token.startsWith("mat_")).toBe(true);
    expect(token.length).toBe(68); // "mat_" + 64 hex chars

    const data = await getToken(env.KV, token);
    expect(data).not.toBeNull();
    expect(data!.userId).toBe("user1");
    expect(data!.label).toBe("My Agent");
    expect(data!.permission).toBe("read");
  });

  it("lists tokens for a user", async () => {
    await createToken(env.KV, "user1", "Agent A", "read");
    await createToken(env.KV, "user1", "Agent B", "readwrite");

    const tokens = await listTokens(env.KV, "user1");
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.label).sort()).toEqual(["Agent A", "Agent B"]);
  });

  it("revokes a token", async () => {
    const token = await createToken(env.KV, "user1", "Agent A", "read");
    await revokeToken(env.KV, "user1", token);

    const data = await getToken(env.KV, token);
    expect(data).toBeNull();

    const tokens = await listTokens(env.KV, "user1");
    expect(tokens).toHaveLength(0);
  });

  it("updates lastUsedAt", async () => {
    const token = await createToken(env.KV, "user1", "Agent A", "read");
    const before = (await getToken(env.KV, token))!.lastUsedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    await updateLastUsed(env.KV, token);

    const after = (await getToken(env.KV, token))!.lastUsedAt;
    expect(after).not.toBe(before);
  });

  it("hashToken produces consistent SHA-256 hex", async () => {
    const hash1 = await hashToken("mat_test123");
    const hash2 = await hashToken("mat_test123");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/services/tokens.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the token service**

```typescript
// src/services/tokens.ts
import type { AgentTokenData } from "../types";

export function generateTokenString(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mat_${hex}`;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createToken(
  kv: KVNamespace,
  userId: string,
  label: string,
  permission: "read" | "readwrite"
): Promise<string> {
  const token = generateTokenString();
  const now = new Date().toISOString();
  const data: AgentTokenData = { userId, label, permission, createdAt: now, lastUsedAt: now };

  await kv.put(`token:${token}`, JSON.stringify(data));

  // Update user's token index
  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  index.push(token);
  await kv.put(`user_tokens:${userId}`, JSON.stringify(index));

  return token;
}

export async function getToken(kv: KVNamespace, token: string): Promise<AgentTokenData | null> {
  const raw = await kv.get(`token:${token}`);
  return raw ? JSON.parse(raw) : null;
}

export async function listTokens(
  kv: KVNamespace,
  userId: string
): Promise<(AgentTokenData & { token: string })[]> {
  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const results: (AgentTokenData & { token: string })[] = [];

  for (const token of index) {
    const data = await getToken(kv, token);
    if (data) {
      results.push({ ...data, token });
    }
  }
  return results;
}

export async function revokeToken(kv: KVNamespace, userId: string, token: string): Promise<void> {
  await kv.delete(`token:${token}`);

  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const updated = index.filter((t) => t !== token);
  await kv.put(`user_tokens:${userId}`, JSON.stringify(updated));
}

export async function updateLastUsed(kv: KVNamespace, token: string): Promise<void> {
  const data = await getToken(kv, token);
  if (!data) return;
  data.lastUsedAt = new Date().toISOString();
  await kv.put(`token:${token}`, JSON.stringify(data));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/services/tokens.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/tokens.ts test/services/tokens.test.ts
git commit -m "feat: add agent token service with KV storage"
```

---

### Task 5: User Service

**Files:**
- Create: `src/services/users.ts`

- [ ] **Step 1: Implement user service**

```typescript
// src/services/users.ts
import type { UserData } from "../types";

export async function saveUser(kv: KVNamespace, userId: string, data: UserData): Promise<void> {
  await kv.put(`user:${userId}`, JSON.stringify(data));
}

export async function getUser(kv: KVNamespace, userId: string): Promise<UserData | null> {
  const raw = await kv.get(`user:${userId}`);
  return raw ? JSON.parse(raw) : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/users.ts
git commit -m "feat: add user service for monday token storage"
```

---

### Task 6: Audit Service (TDD)

**Files:**
- Create: `test/services/audit.test.ts`
- Create: `src/services/audit.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/services/audit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { logRequest, queryAuditLogs } from "../../src/services/audit";
import { setupD1 } from "../helpers";

describe("audit service", () => {
  beforeEach(async () => {
    await setupD1();
    await env.DB.exec("DELETE FROM audit_logs");
  });

  it("logs an allowed request", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_abc",
      tokenLabel: "My Agent",
      userId: "user1",
      operationType: "query",
      gqlBody: "{ boards { id } }",
      allowed: true,
      responseStatus: 200,
      latencyMs: 42,
    });

    const logs = await queryAuditLogs(env.DB, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].token_label).toBe("My Agent");
    expect(logs[0].allowed).toBe(1);
    expect(logs[0].response_status).toBe(200);
  });

  it("logs a blocked request with null response fields", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_abc",
      tokenLabel: "My Agent",
      userId: "user1",
      operationType: "mutation",
      gqlBody: "mutation { create_board { id } }",
      allowed: false,
      responseStatus: null,
      latencyMs: null,
    });

    const logs = await queryAuditLogs(env.DB, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].allowed).toBe(0);
    expect(logs[0].response_status).toBeNull();
  });

  it("filters by token label", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "query", gqlBody: "{ a }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });
    await logRequest(env.DB, {
      tokenId: "hash_b", tokenLabel: "Agent B", userId: "u1",
      operationType: "query", gqlBody: "{ b }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });

    const logs = await queryAuditLogs(env.DB, { tokenLabel: "Agent A" });
    expect(logs).toHaveLength(1);
    expect(logs[0].token_label).toBe("Agent A");
  });

  it("filters by allowed status", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "query", gqlBody: "{ a }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "mutation", gqlBody: "mutation { x }", allowed: false,
      responseStatus: null, latencyMs: null,
    });

    const logs = await queryAuditLogs(env.DB, { allowed: false });
    expect(logs).toHaveLength(1);
    expect(logs[0].operation_type).toBe("mutation");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/services/audit.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement audit service**

```typescript
// src/services/audit.ts

export interface AuditLogEntry {
  tokenId: string;
  tokenLabel: string;
  userId: string;
  operationType: "query" | "mutation";
  gqlBody: string;
  allowed: boolean;
  responseStatus: number | null;
  latencyMs: number | null;
}

export interface AuditLogRow {
  id: number;
  token_id: string;
  token_label: string;
  user_id: string;
  operation_type: string;
  gql_body: string;
  allowed: number;
  response_status: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AuditQueryFilters {
  tokenLabel?: string;
  allowed?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function logRequest(db: D1Database, entry: AuditLogEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (token_id, token_label, user_id, operation_type, gql_body, allowed, response_status, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entry.tokenId,
      entry.tokenLabel,
      entry.userId,
      entry.operationType,
      entry.gqlBody,
      entry.allowed ? 1 : 0,
      entry.responseStatus,
      entry.latencyMs
    )
    .run();
}

export async function queryAuditLogs(
  db: D1Database,
  filters: AuditQueryFilters
): Promise<AuditLogRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.tokenLabel) {
    conditions.push("token_label = ?");
    params.push(filters.tokenLabel);
  }
  if (filters.allowed !== undefined) {
    conditions.push("allowed = ?");
    params.push(filters.allowed ? 1 : 0);
  }
  if (filters.from) {
    conditions.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("created_at <= ?");
    params.push(filters.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const query = `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<AuditLogRow>();
  return result.results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/services/audit.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/audit.ts test/services/audit.test.ts
git commit -m "feat: add audit logging service with D1 storage"
```

---

### Task 7: Session Middleware

**Files:**
- Create: `src/middleware/session.ts`

- [ ] **Step 1: Implement session middleware**

Uses Hono's built-in JWT utilities. Reads a `session` cookie, verifies it, and sets `userId` on the context.

```typescript
// src/middleware/session.ts
import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";

export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) {
    return c.redirect("/auth/login");
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set("userId", payload.userId as string);
    await next();
  } catch {
    return c.redirect("/auth/login");
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/session.ts
git commit -m "feat: add session middleware with JWT cookie verification"
```

---

### Task 8: Agent Auth Middleware

**Files:**
- Create: `src/middleware/agent-auth.ts`

- [ ] **Step 1: Implement agent auth middleware**

Extracts bearer token, looks it up in KV, sets `agentToken` on context.

```typescript
// src/middleware/agent-auth.ts
import { createMiddleware } from "hono/factory";
import { getToken } from "../services/tokens";
import type { Env } from "../types";

export const agentAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer mat_")) {
    return c.json({ error: "Missing or invalid authorization token" }, 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const data = await getToken(c.env.KV, token);
  if (!data) {
    return c.json({ error: "Invalid or revoked token" }, 401);
  }

  c.set("agentToken", data);
  await next();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/agent-auth.ts
git commit -m "feat: add agent bearer token auth middleware"
```

---

### Task 9: Proxy Route (TDD)

**Files:**
- Create: `test/routes/proxy.test.ts`
- Create: `src/routes/proxy.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/routes/proxy.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { proxyRoutes } from "../../src/routes/proxy";
import { agentAuthMiddleware } from "../../src/middleware/agent-auth";
import { createToken } from "../../src/services/tokens";
import { setupD1 } from "../helpers";
import type { Env } from "../../src/types";

// Mock the monday API fetch
const originalFetch = globalThis.fetch;

describe("proxy route", () => {
  let app: Hono<Env>;

  beforeEach(async () => {
    await setupD1();
    await env.DB.exec("DELETE FROM audit_logs");

    // Clean KV
    const keys = await env.KV.list();
    for (const key of keys.keys) {
      await env.KV.delete(key.name);
    }

    // Store a user's monday token
    await env.KV.put("user:user1", JSON.stringify({
      mondayToken: "monday_test_token",
      name: "Test User",
      email: "test@monday.com",
    }));

    app = new Hono<Env>();
    app.use("/api/graphql", agentAuthMiddleware);
    app.route("/", proxyRoutes);
  });

  it("returns 401 for missing token", async () => {
    const res = await app.request("/api/graphql", {
      method: "POST",
      body: JSON.stringify({ query: "{ boards { id } }" }),
    }, env);
    expect(res.status).toBe(401);
  });

  it("returns 403 for mutation on read-only token", async () => {
    const token = await createToken(env.KV, "user1", "Read Agent", "read");
    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "mutation { create_board { id } }" }),
    }, env);
    expect(res.status).toBe(403);
  });

  it("allows queries on read-only token", async () => {
    const token = await createToken(env.KV, "user1", "Read Agent", "read");

    // Mock fetch to monday API
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { boards: [] } }), { status: 200 })
    );

    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ boards { id } }" }),
    }, env);

    expect(res.status).toBe(200);
    globalThis.fetch = originalFetch;
  });

  it("allows mutations on readwrite token", async () => {
    const token = await createToken(env.KV, "user1", "Write Agent", "readwrite");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { create_board: { id: "1" } } }), { status: 200 })
    );

    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "mutation { create_board { id } }" }),
    }, env);

    expect(res.status).toBe(200);
    globalThis.fetch = originalFetch;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/routes/proxy.test.ts`
Expected: FAIL — cannot find module `../../src/routes/proxy`

- [ ] **Step 3: Implement proxy route**

```typescript
// src/routes/proxy.ts
import { Hono } from "hono";
import { containsMutation } from "../services/gql-parser";
import { getUser } from "../services/users";
import { hashToken, updateLastUsed } from "../services/tokens";
import { logRequest } from "../services/audit";
import type { Env } from "../types";

const MONDAY_API_URL = "https://api.monday.com/2024-10/";

export const proxyRoutes = new Hono<Env>();

proxyRoutes.post("/api/graphql", async (c) => {
  const agentToken = c.get("agentToken");
  const rawToken = c.req.header("Authorization")!.slice(7);

  let body: { query: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { query } = body;
  if (!query) {
    return c.json({ error: "Missing query field" }, 400);
  }

  const isMutation = containsMutation(query);
  const operationType = isMutation ? "mutation" : "query";

  // Permission check
  if (agentToken.permission === "read" && isMutation) {
    const tokenHash = await hashToken(rawToken);
    c.executionCtx.waitUntil(
      logRequest(c.env.DB, {
        tokenId: tokenHash,
        tokenLabel: agentToken.label,
        userId: agentToken.userId,
        operationType: "mutation",
        gqlBody: query,
        allowed: false,
        responseStatus: null,
        latencyMs: null,
      })
    );
    return c.json({ error: "Mutations are not allowed with a read-only token" }, 403);
  }

  // Get user's monday token
  const user = await getUser(c.env.KV, agentToken.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 502);
  }

  // Forward to monday API
  const start = Date.now();
  let mondayResponse: Response;
  try {
    mondayResponse = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: user.mondayToken,
      },
      body: JSON.stringify({ query }),
    });
  } catch {
    return c.json({ error: "Failed to reach monday.com API" }, 502);
  }
  const latencyMs = Date.now() - start;

  // Log and update lastUsedAt (non-blocking)
  const tokenHash = await hashToken(rawToken);
  c.executionCtx.waitUntil(
    Promise.all([
      logRequest(c.env.DB, {
        tokenId: tokenHash,
        tokenLabel: agentToken.label,
        userId: agentToken.userId,
        operationType,
        gqlBody: query,
        allowed: true,
        responseStatus: mondayResponse.status,
        latencyMs,
      }),
      updateLastUsed(c.env.KV, rawToken),
    ])
  );

  // Return monday's response
  const responseBody = await mondayResponse.text();
  return new Response(responseBody, {
    status: mondayResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/routes/proxy.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/proxy.ts test/routes/proxy.test.ts
git commit -m "feat: add GQL proxy route with permission enforcement and audit logging"
```

---

### Task 10: OAuth Routes

**Files:**
- Create: `src/routes/auth.ts`

- [ ] **Step 1: Implement OAuth routes**

```typescript
// src/routes/auth.ts
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie } from "hono/cookie";
import { saveUser } from "../services/users";
import type { Env } from "../types";

export const authRoutes = new Hono<Env>();

authRoutes.get("/auth/login", (c) => {
  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const url = new URL("https://auth.monday.com/oauth2/authorize");
  url.searchParams.set("client_id", c.env.MONDAY_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  return c.redirect(url.toString());
});

authRoutes.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.text("Missing authorization code", 400);
  }

  const redirectUri = new URL("/auth/callback", c.req.url).toString();

  // Exchange code for token
  const tokenResponse = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.MONDAY_CLIENT_ID,
      client_secret: c.env.MONDAY_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    return c.text("Failed to exchange authorization code", 502);
  }

  const { access_token } = (await tokenResponse.json()) as { access_token: string };

  // Fetch user info from monday API
  const meResponse = await fetch("https://api.monday.com/2024-10/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: access_token,
    },
    body: JSON.stringify({ query: "{ me { id name email } }" }),
  });

  if (!meResponse.ok) {
    return c.text("Failed to fetch user info", 502);
  }

  const { data } = (await meResponse.json()) as {
    data: { me: { id: string; name: string; email: string } };
  };
  const user = data.me;

  // Save user's monday token in KV
  await saveUser(c.env.KV, user.id, {
    mondayToken: access_token,
    name: user.name,
    email: user.email,
  });

  // Create JWT session
  const exp = Math.floor(Date.now() / 1000) + 86400; // 24h
  const jwt = await sign({ userId: user.id, exp }, c.env.JWT_SECRET);
  setCookie(c, "session", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 86400,
  });

  return c.redirect("/dashboard");
});

authRoutes.get("/auth/logout", (c) => {
  setCookie(c, "session", "", { path: "/", maxAge: 0 });
  return c.redirect("/auth/login");
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/auth.ts
git commit -m "feat: add monday.com OAuth login/callback/logout routes"
```

---

### Task 11: Dashboard API Routes

**Files:**
- Create: `src/routes/dashboard.ts`

- [ ] **Step 1: Implement dashboard API routes**

```typescript
// src/routes/dashboard.ts
import { Hono } from "hono";
import { createToken, listTokens, revokeToken } from "../services/tokens";
import { queryAuditLogs } from "../services/audit";
import type { Env } from "../types";

export const dashboardRoutes = new Hono<Env>();

// List tokens for the current user
dashboardRoutes.get("/api/tokens", async (c) => {
  const userId = c.get("userId");
  const tokens = await listTokens(c.env.KV, userId);
  // Don't expose full token values in list — show only prefix
  const safe = tokens.map((t) => ({
    token: t.token.slice(0, 12) + "...",
    fullToken: t.token, // Needed for copy-to-clipboard on creation, filtered client-side
    label: t.label,
    permission: t.permission,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
  }));
  return c.json(safe);
});

// Create a new agent token
dashboardRoutes.post("/api/tokens", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ label: string; permission: "read" | "readwrite" }>();

  if (!body.label || !["read", "readwrite"].includes(body.permission)) {
    return c.json({ error: "Invalid label or permission" }, 400);
  }

  const token = await createToken(c.env.KV, userId, body.label, body.permission);
  return c.json({ token, label: body.label, permission: body.permission }, 201);
});

// Revoke an agent token
dashboardRoutes.delete("/api/tokens/:token", async (c) => {
  const userId = c.get("userId");
  const token = c.req.param("token");
  await revokeToken(c.env.KV, userId, token);
  return c.json({ ok: true });
});

// Query audit logs
dashboardRoutes.get("/api/audit", async (c) => {
  const userId = c.get("userId");
  const tokenLabel = c.req.query("token_label");
  const allowed = c.req.query("allowed");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = c.req.query("limit");
  const offset = c.req.query("offset");

  const logs = await queryAuditLogs(c.env.DB, {
    tokenLabel: tokenLabel || undefined,
    allowed: allowed !== undefined ? allowed === "true" : undefined,
    from: from || undefined,
    to: to || undefined,
    limit: limit ? parseInt(limit) : undefined,
    offset: offset ? parseInt(offset) : undefined,
  });

  // Only return logs belonging to this user
  const userLogs = logs.filter((log) => log.user_id === userId);
  return c.json(userLogs);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/dashboard.ts
git commit -m "feat: add dashboard API routes for token management and audit logs"
```

---

### Task 12: Dashboard SPA

**Files:**
- Create: `src/static/dashboard.html`

- [ ] **Step 1: Create dashboard HTML**

```html
<!-- src/static/dashboard.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>monday Agent Layer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6f8; color: #323338; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    h1 { margin-bottom: 24px; }
    h2 { margin: 24px 0 12px; }
    .card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e6e9ef; }
    th { font-weight: 600; color: #676879; font-size: 13px; }
    button { background: #0073ea; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background: #0060c0; }
    button.danger { background: #e44258; }
    button.danger:hover { background: #cc3548; }
    input, select { padding: 8px 12px; border: 1px solid #c5c7d0; border-radius: 4px; font-size: 14px; }
    .form-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .token-display { background: #f0f0f0; padding: 8px 12px; border-radius: 4px; font-family: monospace; word-break: break-all; margin: 8px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge.read { background: #e6f4ea; color: #1e7e34; }
    .badge.readwrite { background: #fff3e0; color: #e65100; }
    .allowed { color: #1e7e34; }
    .denied { color: #e44258; }
    .tabs { display: flex; gap: 0; margin-bottom: 16px; }
    .tab { padding: 8px 20px; cursor: pointer; border-bottom: 2px solid transparent; color: #676879; }
    .tab.active { border-bottom-color: #0073ea; color: #0073ea; font-weight: 600; }
    .filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center">
      <h1>monday Agent Layer</h1>
      <a href="/auth/logout"><button>Logout</button></a>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="tokens">Agent Tokens</div>
      <div class="tab" data-tab="audit">Audit Log</div>
    </div>

    <!-- Tokens Tab -->
    <div id="tokens-tab">
      <div class="card">
        <h2>Create Token</h2>
        <div class="form-row">
          <input type="text" id="token-label" placeholder="Label (e.g. Slack Bot)">
          <select id="token-permission">
            <option value="read">Read Only</option>
            <option value="readwrite">Read + Write</option>
          </select>
          <button onclick="createToken()">Create</button>
        </div>
        <div id="new-token" class="hidden">
          <strong>New token created — copy it now, it won't be shown again:</strong>
          <div class="token-display" id="new-token-value"></div>
        </div>
      </div>

      <div class="card">
        <h2>Active Tokens</h2>
        <table>
          <thead>
            <tr><th>Label</th><th>Permission</th><th>Created</th><th>Last Used</th><th></th></tr>
          </thead>
          <tbody id="tokens-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Audit Tab -->
    <div id="audit-tab" class="hidden">
      <div class="card">
        <div class="filters">
          <input type="text" id="audit-filter-label" placeholder="Filter by label">
          <select id="audit-filter-allowed">
            <option value="">All</option>
            <option value="true">Allowed</option>
            <option value="false">Denied</option>
          </select>
          <button onclick="loadAudit()">Filter</button>
        </div>
        <table>
          <thead>
            <tr><th>Time</th><th>Token</th><th>Type</th><th>Status</th><th>Latency</th><th>Query</th></tr>
          </thead>
          <tbody id="audit-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('tokens-tab').classList.toggle('hidden', target !== 'tokens');
        document.getElementById('audit-tab').classList.toggle('hidden', target !== 'audit');
        if (target === 'audit') loadAudit();
      });
    });

    async function loadTokens() {
      const res = await fetch('/api/tokens');
      if (res.status === 401 || res.redirected) { window.location.href = '/auth/login'; return; }
      const tokens = await res.json();
      const tbody = document.getElementById('tokens-body');
      tbody.innerHTML = tokens.map(t => `
        <tr>
          <td>${esc(t.label)}</td>
          <td><span class="badge ${t.permission}">${t.permission}</span></td>
          <td>${new Date(t.createdAt).toLocaleDateString()}</td>
          <td>${new Date(t.lastUsedAt).toLocaleDateString()}</td>
          <td><button class="danger" onclick="revokeToken('${esc(t.fullToken)}')">Revoke</button></td>
        </tr>
      `).join('');
    }

    async function createToken() {
      const label = document.getElementById('token-label').value.trim();
      const permission = document.getElementById('token-permission').value;
      if (!label) return alert('Please enter a label');

      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, permission }),
      });
      const data = await res.json();

      document.getElementById('new-token-value').textContent = data.token;
      document.getElementById('new-token').classList.remove('hidden');
      document.getElementById('token-label').value = '';
      loadTokens();
    }

    async function revokeToken(token) {
      if (!confirm('Revoke this token? Agents using it will immediately lose access.')) return;
      await fetch(`/api/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
      loadTokens();
    }

    async function loadAudit() {
      const label = document.getElementById('audit-filter-label').value;
      const allowed = document.getElementById('audit-filter-allowed').value;
      const params = new URLSearchParams();
      if (label) params.set('token_label', label);
      if (allowed) params.set('allowed', allowed);

      const res = await fetch(`/api/audit?${params}`);
      const logs = await res.json();
      const tbody = document.getElementById('audit-body');
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${new Date(l.created_at).toLocaleString()}</td>
          <td>${esc(l.token_label)}</td>
          <td>${l.operation_type}</td>
          <td class="${l.allowed ? 'allowed' : 'denied'}">${l.allowed ? `${l.response_status}` : 'DENIED'}</td>
          <td>${l.latency_ms !== null ? l.latency_ms + 'ms' : '-'}</td>
          <td><code style="font-size:12px">${esc(l.gql_body.slice(0, 80))}${l.gql_body.length > 80 ? '...' : ''}</code></td>
        </tr>
      `).join('');
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    loadTokens();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/static/dashboard.html
git commit -m "feat: add dashboard SPA for token management and audit logs"
```

---

### Task 13: App Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Wire everything together**

Replace the contents of `src/index.ts`:

```typescript
// src/index.ts
import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { proxyRoutes } from "./routes/proxy";
import { sessionMiddleware } from "./middleware/session";
import { agentAuthMiddleware } from "./middleware/agent-auth";
import type { Env } from "./types";

const app = new Hono<Env>();

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// OAuth routes (no auth required)
app.route("/", authRoutes);

// Dashboard — serve SPA HTML
app.get("/dashboard", sessionMiddleware, async (c) => {
  const html = await import("./static/dashboard.html");
  // Cloudflare Workers can serve raw text; we embed the HTML as a module
  // This requires adding `{ "rules": [{ "type": "Text", "globs": ["**/*.html"] }] }` in wrangler.toml
  return c.html(html.default);
});

// Dashboard API — session auth required
app.use("/api/tokens/*", sessionMiddleware);
app.use("/api/tokens", sessionMiddleware);
app.use("/api/audit", sessionMiddleware);
app.route("/", dashboardRoutes);

// GQL Proxy — agent token auth required
app.use("/api/graphql", agentAuthMiddleware);
app.route("/", proxyRoutes);

// Root redirect
app.get("/", (c) => c.redirect("/dashboard"));

export default app;
```

- [ ] **Step 2: Add HTML module rule to wrangler.toml**

Add to the end of `wrangler.toml`:

```toml
[[rules]]
type = "Text"
globs = ["**/*.html"]
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts wrangler.toml
git commit -m "feat: wire up app entry point with all routes and middleware"
```

---

### Task 14: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with project info**

Replace the contents of `CLAUDE.md`:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Cloudflare Worker that proxies monday.com GraphQL API requests with per-agent permission enforcement and audit logging. Users authenticate via monday.com OAuth, create scoped agent tokens (read-only or read+write), and agents use these tokens to hit the proxy. Internal monday.com project.

## Build & Development

- `npm run dev` — Start local dev server (wrangler dev)
- `npm run deploy` — Deploy to Cloudflare Workers
- `npm test` — Run all tests (vitest)
- `npm run test:watch` — Run tests in watch mode
- `npx vitest run test/path/to/file.test.ts` — Run a single test file
- `npx tsc --noEmit` — Type-check without emitting

### First-time setup

```bash
wrangler kv namespace create KV            # then update wrangler.toml with the ID
wrangler d1 create monday-agent-layer-db   # then update wrangler.toml with the ID
wrangler d1 migrations apply DB            # apply D1 migrations
wrangler secret put JWT_SECRET
wrangler secret put MONDAY_CLIENT_ID
wrangler secret put MONDAY_CLIENT_SECRET
```

## Architecture

Single Hono app on Cloudflare Workers with three concerns:

1. **OAuth** (`src/routes/auth.ts`) — monday.com OAuth login/callback, creates JWT session cookie
2. **Dashboard** (`src/routes/dashboard.ts` + `src/static/dashboard.html`) — Token CRUD API + vanilla SPA
3. **GQL Proxy** (`src/routes/proxy.ts`) — Validates agent bearer tokens, enforces read/readwrite permissions by parsing GQL for mutations, forwards to monday API, logs to D1

**Storage:** KV for tokens and user data, D1 for audit logs.

**Permission model:** Read-only tokens reject any GraphQL mutation. Read+write tokens allow everything. Mutation detection is in `src/services/gql-parser.ts`.

## Key Conventions

- Agent tokens use `mat_` prefix (monday agent token)
- KV keys: `token:{mat_xxx}` for token data, `user:{mondayId}` for user data, `user_tokens:{mondayId}` for token index
- Audit logs store SHA-256 hash of tokens, not raw values
- Non-blocking logging via `c.executionCtx.waitUntil()`
- Tests use `@cloudflare/vitest-pool-workers` for Workers-compatible test environment
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with project details and conventions"
```
