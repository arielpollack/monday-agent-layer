# Setup & Deployment

## Prerequisites

- A Cloudflare account
- A monday.com app created at [developers.monday.com](https://developers.monday.com) with all OAuth scopes enabled
- Node.js or Bun installed

## First-Time Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create Cloudflare resources

```bash
wrangler kv namespace create KV
wrangler d1 create monday-agent-layer-db
```

Update `wrangler.toml` with the IDs from the output.

### 3. Apply database migrations

```bash
wrangler d1 migrations apply DB --remote
```

### 4. Set secrets

```bash
wrangler secret put JWT_SECRET           # any random string
wrangler secret put MONDAY_CLIENT_ID     # from your monday app
wrangler secret put MONDAY_CLIENT_SECRET # from your monday app
```

### 5. Configure monday app redirect URI

Set your monday app's OAuth redirect URI to:
```
https://<your-worker>.workers.dev/auth/callback
```

### 6. Deploy

```bash
npm run deploy
```

## Local Development

Local dev with `wrangler dev` has known issues with outbound fetch on some macOS versions. Use remote mode:

```bash
wrangler dev --remote
```

Or create a `.dev.vars` file (already in `.gitignore`):

```
JWT_SECRET=local-dev-secret
MONDAY_CLIENT_ID=your-client-id
MONDAY_CLIENT_SECRET=your-client-secret
```

## Usage

1. Visit `https://<your-worker>.workers.dev` and log in with your monday account
2. Create agent tokens in the dashboard
3. Give agents the token — they use it as: `Authorization: Bearer mat_...`
4. Agents send GraphQL requests to `POST https://<your-worker>.workers.dev/api/graphql`
