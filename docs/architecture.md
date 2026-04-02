# Architecture

## Overview

Single Cloudflare Worker (Hono framework) handling three concerns:

```
Agent --> POST /api/graphql (Bearer mat_xxx)
                |
          Proxy Worker
                |
      1. Validate agent token (KV lookup)
      2. Parse GraphQL for mutations
      3. Block if read-only + mutation (403)
      4. Forward to api.monday.com/v2 with user's token
      5. Log request to D1 (async)
      6. Return response
```

## Components

### GQL Proxy (`src/routes/proxy.ts`)
The core endpoint at `POST /api/graphql`. Agents send requests with their `mat_` bearer token. The proxy validates permissions, forwards to monday, and logs everything.

### Dashboard (`src/routes/dashboard.ts` + `src/static/dashboard.html`)
Web UI at `/dashboard` where users create/revoke agent tokens and view audit logs. Protected by session middleware (JWT cookie via monday OAuth).

### OAuth (`src/routes/auth.ts`)
Handles monday.com OAuth login/callback/logout. Captures the user's monday API token for proxying.

### Middleware
- `src/middleware/session.ts` — JWT cookie verification for dashboard routes
- `src/middleware/agent-auth.ts` — Bearer token validation for proxy endpoint

### Services
- `src/services/gql-parser.ts` — Mutation detection (strips comments/strings, checks for `mutation` keyword)
- `src/services/tokens.ts` — Agent token CRUD in KV
- `src/services/users.ts` — User monday token storage in KV
- `src/services/audit.ts` — Audit log read/write in D1

## Storage

| Store | Purpose | Key format |
|-------|---------|------------|
| KV | Agent tokens | `token:{mat_xxx}` → metadata JSON |
| KV | User monday tokens | `user:{mondayUserId}` → token + profile |
| KV | Token index per user | `user_tokens:{mondayUserId}` → array of token strings |
| D1 | Audit logs | `audit_logs` table (token hash, query, status, latency) |

## Permission Model

| Level | Queries | Mutations |
|-------|---------|-----------|
| **read** | Allowed | Blocked (403) |
| **readwrite** | Allowed | Allowed |

Mutation detection is intentionally conservative — strips comments and string literals from the GraphQL query, then checks for the `mutation` keyword. Over-rejects rather than under-rejects.

### Known Limitation

monday.com enforces granular scope permissions (e.g., `boards:read`, `users:write`) server-side. We can't replicate that logic, so scope-level granularity (e.g., "can mutate boards but not users") is not feasible. It's binary: read-only or full read+write.

## Agent Token Format

`mat_` prefix + 64 hex characters (32 random bytes). Audit logs store SHA-256 hashes of tokens, never raw values.
