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
