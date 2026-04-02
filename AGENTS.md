# monday Agent Layer

A proxy service that gives AI agents controlled, observable access to the monday.com GraphQL API. Users generate scoped tokens (read-only or read+write) and the proxy enforces permissions and logs all requests.

## Documentation

- **[Why this exists](docs/why.md)** — The problem, the solution, and the reasoning behind the proxy approach
- **[Architecture](docs/architecture.md)** — System design, components, storage, permission model, and known limitations
- **[Setup & Deployment](docs/setup.md)** — How to install, configure, deploy, and use the service

## Quick Reference

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/graphql` | `Bearer mat_...` | Agent proxy — forwards to monday API |
| `GET /dashboard` | Session cookie | Token management UI |
| `GET /api/tokens` | Session cookie | List agent tokens |
| `POST /api/tokens` | Session cookie | Create agent token |
| `DELETE /api/tokens/:token` | Session cookie | Revoke agent token |
| `GET /api/audit` | Session cookie | Query audit logs |
| `GET /auth/login` | None | Start OAuth flow |
| `GET /auth/callback` | None | OAuth callback |
| `GET /auth/logout` | None | Clear session |

## Tech Stack

Cloudflare Workers, Hono, KV, D1. See [architecture](docs/architecture.md) for details.
