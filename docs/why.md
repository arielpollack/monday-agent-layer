# Why This Exists

## Problem

monday.com's API authentication has two modes, neither suitable for giving agents controlled access:

1. **User tokens** give full user permissions with no guardrails — an agent can do anything the user can.
2. **App tokens** are scoped via OAuth, but the scopes are fixed per app installation — you can't create different permission levels for different agents under the same user.

## Solution

A proxy that sits between agents and monday's API:

1. A single monday.com app is registered with **all** OAuth scopes.
2. A user authorizes the app via OAuth, granting full-scope access. Their token is stored securely.
3. The user generates **agent tokens** — each with a label (e.g., "Slack Bot") and a permission level (read-only or read+write).
4. Agents call our proxy instead of monday's API directly.
5. The proxy enforces permissions and logs every request for full observability.

## Why a proxy instead of just generating scoped tokens?

monday.com doesn't support creating sub-tokens with custom scopes programmatically. OAuth scopes are set at the app level, not per-token. The proxy approach lets us enforce permissions ourselves and add observability that monday's API doesn't provide.

## Who is this for?

This is an internal monday.com project for teams that want to give AI agents controlled, observable access to monday.com without handing over full user tokens. It is not a commercial product.
