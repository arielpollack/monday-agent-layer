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
