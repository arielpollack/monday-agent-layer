// src/routes/dashboard.ts
import { Hono } from "hono";
import { createToken, listTokens, revokeToken } from "../services/tokens";
import { queryAuditLogs } from "../services/audit";
import type { Env } from "../types";

export const dashboardRoutes = new Hono<Env>();

dashboardRoutes.get("/api/tokens", async (c) => {
  const userId = c.get("userId");
  const tokens = await listTokens(c.env.KV, userId);
  const safe = tokens.map((t) => ({
    token: t.token.slice(0, 12) + "...",
    fullToken: t.token,
    label: t.label,
    permission: t.permission,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
  }));
  return c.json(safe);
});

dashboardRoutes.post("/api/tokens", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ label: string; permission: "read" | "readwrite" }>();

  if (!body.label || !["read", "readwrite"].includes(body.permission)) {
    return c.json({ error: "Invalid label or permission" }, 400);
  }

  const token = await createToken(c.env.KV, userId, body.label, body.permission);
  return c.json({ token, label: body.label, permission: body.permission }, 201);
});

dashboardRoutes.delete("/api/tokens/:token", async (c) => {
  const userId = c.get("userId");
  const token = c.req.param("token");
  await revokeToken(c.env.KV, userId, token);
  return c.json({ ok: true });
});

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

  const userLogs = logs.filter((log) => log.user_id === userId);
  return c.json(userLogs);
});
