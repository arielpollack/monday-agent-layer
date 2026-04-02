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
