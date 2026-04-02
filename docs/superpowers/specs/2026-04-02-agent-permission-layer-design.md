# monday.com Agent Permission Layer — Design Spec

## Mission

Allow agents to operate under a monday.com user with a controlled permission layer. Users generate scoped tokens for agents, and the app proxies requests to monday's GraphQL API with permission enforcement and full observability.

## Problem

monday.com offers two API auth modes, neither suitable for agents:

1. **User token** — full user permissions, no guardrails
2. **App token** — scoped via OAuth, but scopes are fixed per app installation

## Solution

1. Create a single monday.com app with ALL OAuth scopes
2. Users authorize the app, granting full-scope access — their token is stored in the app
3. Users visit a standalone dashboard to generate agent tokens with specific permission levels (read-only or read+write)
4. Agents use these tokens to hit the app's proxy endpoint, which enforces permissions and forwards to monday's API
5. All requests are logged for full observability per token/agent

## Current Limitation

monday's API enforces scope permissions server-side, and we don't have access to their permission enforcement logic. For now, permission control is limited to:

- **Read-only tokens:** allow only GraphQL queries, reject any mutation
- **Read+write tokens:** allow all operations

GQL requests are parsed for the `mutation` keyword to enforce this. Granular scope-level enforcement (e.g., "can mutate boards but not users") is not feasible without replicating monday's internal permission model.

## Architecture

### Overview

Single Cloudflare Worker (monolith) handling three concerns:

1. **OAuth Flow** — Authenticates dashboard users via monday.com OAuth, obtains their full-scope API token
2. **Dashboard SPA** — Lightweight UI for creating/managing agent tokens and viewing audit logs
3. **GQL Proxy** — Validates agent bearer tokens, enforces permissions, forwards to monday API, logs requests

### Storage

- **Cloudflare KV** — Agent tokens (keyed by token value) and user monday tokens (keyed by `user:{mondayUserId}`)
- **Cloudflare D1** — Audit logs

### Request Flow

```
Agent --[Bearer mat_...]--> Worker Proxy
  1. Lookup token in KV -> get permission level + userId
  2. Parse GQL body -> detect if mutation
  3. If read-only token + mutation -> reject (403)
  4. Fetch user's monday token from KV using userId
  5. Forward request to api.monday.com with user's monday token
  6. Log request details to D1 (non-blocking via ctx.waitUntil)
  7. Return monday's response to agent
```

## OAuth & User Sessions

1. User visits the dashboard, redirected to monday.com OAuth consent screen
2. App requests ALL available scopes
3. Monday redirects back with auth code, worker exchanges it for an access token
4. User's monday token stored in KV keyed by `user:{mondayUserId}`
5. Signed JWT session cookie set in the browser (user ID in payload)

**Session details:**

- JWT signed with a worker secret (Cloudflare secret/env var)
- 24h expiry, re-authenticate via OAuth when expired
- No refresh token complexity (internal tooling)

## Agent Token Management

### Dashboard UI

- List all agent tokens created by the user (name, permission level, created date, last used)
- Create token: provide a label + select permission level (read-only or read+write)
- Revoke token: immediately deletes from KV, subsequent proxy requests return 401
- View audit log: filterable by token, date range, allowed/denied

### Token Format

Opaque string with `mat_` prefix + 32 random hex characters (e.g., `mat_a1b2c3d4e5f6...`).

**KV storage (key = token value):**

```json
{
  "userId": "monday_user_id",
  "label": "Slack bot",
  "permission": "read | readwrite",
  "createdAt": "2026-04-02T00:00:00Z",
  "lastUsedAt": "2026-04-02T00:00:00Z"
}
```

User's monday API token stored separately at `user:{userId}`, not duplicated per agent token.

## GQL Proxy & Permission Enforcement

### Endpoint

`POST /api/graphql`

### Request Handling

1. Extract `Authorization: Bearer mat_...` header
2. Look up token in KV — not found returns 401
3. Parse GQL request body for operation type
4. **Permission check:**
   - `read` tokens: reject any request containing a mutation (return 403)
   - `readwrite` tokens: allow all operations
5. Fetch user's monday token from KV via `userId`
6. Forward to `https://api.monday.com/2024-10/` with user's token
7. Return monday's response

### Mutation Detection

- Identify top-level operation type from the query string
- A request is a mutation if it starts with the `mutation` keyword (after stripping whitespace/comments)
- Batched queries with mixed queries/mutations: reject the entire request if any mutation is present and token is read-only
- Intentionally conservative — over-reject rather than under-reject

### Error Responses

- **401:** invalid or revoked token
- **403:** mutation attempted with read-only token
- **502:** monday API error or unreachable

## Audit Logging

### D1 Table: `audit_logs`

| Column          | Type    | Description                                     |
|-----------------|---------|-------------------------------------------------|
| id              | INTEGER | Primary key, auto-increment                     |
| token_id        | TEXT    | SHA-256 hash of the `mat_...` token              |
| token_label     | TEXT    | Human-readable label at time of request         |
| user_id         | TEXT    | monday user ID                                  |
| operation_type  | TEXT    | "query" or "mutation"                           |
| gql_body        | TEXT    | Full GraphQL query string                       |
| allowed         | INTEGER | 1 = forwarded, 0 = blocked                     |
| response_status | INTEGER | HTTP status from monday API (null if blocked)   |
| latency_ms      | INTEGER | Round-trip time to monday API (null if blocked) |
| created_at      | TEXT    | ISO 8601 timestamp                              |

### Behavior

- Every proxy request is logged (allowed and denied)
- Logging is non-blocking via `ctx.waitUntil()` to avoid adding latency
- Dashboard exposes logs filterable by token label, date range, allowed/denied
- No automatic cleanup — volume is low at tens of tokens; TTL-based pruning can be added later

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono
- **Dashboard:** Vanilla HTML/JS served as static assets from the worker
- **Storage:** Cloudflare KV (tokens, sessions) + D1 (audit logs)
- **GQL parsing:** Simple string parsing for mutation detection

## Project Structure

```
monday-agent-layer/
├── src/
│   ├── index.ts              # Hono app, route definitions
│   ├── routes/
│   │   ├── auth.ts           # OAuth flow (login, callback)
│   │   ├── dashboard.ts      # Token CRUD API endpoints
│   │   └── proxy.ts          # GQL proxy endpoint
│   ├── middleware/
│   │   ├── session.ts        # JWT session validation for dashboard
│   │   └── agent-auth.ts     # Bearer token validation for proxy
│   ├── services/
│   │   ├── tokens.ts         # KV operations for agent tokens
│   │   ├── users.ts          # KV operations for user monday tokens
│   │   ├── audit.ts          # D1 audit log operations
│   │   └── gql-parser.ts     # Mutation detection logic
│   └── static/
│       └── dashboard.html    # Single-page dashboard UI
├── wrangler.toml              # Cloudflare Workers config
├── package.json
├── tsconfig.json
└── CLAUDE.md
```
