// src/routes/proxy.ts
import { Hono } from "hono";
import { containsMutation } from "../services/gql-parser";
import { getUser } from "../services/users";
import { hashToken, updateLastUsed } from "../services/tokens";
import { logRequest } from "../services/audit";
import type { Env } from "../types";

const MONDAY_API_URL = "https://api.monday.com/v2";

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

  if (agentToken.permission === "read" && isMutation) {
    const tokenHash = await hashToken(rawToken);
    try {
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
    } catch {
      // executionCtx not available in test environment
    }
    return c.json({ error: "Mutations are not allowed with a read-only token" }, 403);
  }

  const user = await getUser(c.env.KV, agentToken.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 502);
  }

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

  const tokenHash = await hashToken(rawToken);
  try {
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
  } catch {
    // executionCtx not available in test environment
  }

  const responseBody = await mondayResponse.text();
  return new Response(responseBody, {
    status: mondayResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
