// test/routes/proxy.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { proxyRoutes } from "../../src/routes/proxy";
import { agentAuthMiddleware } from "../../src/middleware/agent-auth";
import { createToken } from "../../src/services/tokens";
import { setupD1 } from "../helpers";
import type { Env } from "../../src/types";

const originalFetch = globalThis.fetch;

describe("proxy route", () => {
  let app: Hono<Env>;

  beforeEach(async () => {
    await setupD1();
    await env.DB.prepare("DELETE FROM audit_logs").run();

    const keys = await env.KV.list();
    for (const key of keys.keys) {
      await env.KV.delete(key.name);
    }

    await env.KV.put("user:user1", JSON.stringify({
      mondayToken: "monday_test_token",
      name: "Test User",
      email: "test@monday.com",
    }));

    app = new Hono<Env>();
    app.use("/api/graphql", agentAuthMiddleware);
    app.route("/", proxyRoutes);
  });

  it("returns 401 for missing token", async () => {
    const res = await app.request("/api/graphql", {
      method: "POST",
      body: JSON.stringify({ query: "{ boards { id } }" }),
    }, env);
    expect(res.status).toBe(401);
  });

  it("returns 403 for mutation on read-only token", async () => {
    const token = await createToken(env.KV, "user1", "Read Agent", "read");
    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "mutation { create_board { id } }" }),
    }, env);
    expect(res.status).toBe(403);
  });

  it("allows queries on read-only token", async () => {
    const token = await createToken(env.KV, "user1", "Read Agent", "read");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { boards: [] } }), { status: 200 })
    );

    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ boards { id } }" }),
    }, env);

    expect(res.status).toBe(200);
    globalThis.fetch = originalFetch;
  });

  it("allows mutations on readwrite token", async () => {
    const token = await createToken(env.KV, "user1", "Write Agent", "readwrite");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { create_board: { id: "1" } } }), { status: 200 })
    );

    const res = await app.request("/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "mutation { create_board { id } }" }),
    }, env);

    expect(res.status).toBe(200);
    globalThis.fetch = originalFetch;
  });
});
