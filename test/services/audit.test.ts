// test/services/audit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { logRequest, queryAuditLogs } from "../../src/services/audit";
import { setupD1 } from "../helpers";

describe("audit service", () => {
  beforeEach(async () => {
    await setupD1();
    await env.DB.exec("DELETE FROM audit_logs");
  });

  it("logs an allowed request", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_abc",
      tokenLabel: "My Agent",
      userId: "user1",
      operationType: "query",
      gqlBody: "{ boards { id } }",
      allowed: true,
      responseStatus: 200,
      latencyMs: 42,
    });

    const logs = await queryAuditLogs(env.DB, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].token_label).toBe("My Agent");
    expect(logs[0].allowed).toBe(1);
    expect(logs[0].response_status).toBe(200);
  });

  it("logs a blocked request with null response fields", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_abc",
      tokenLabel: "My Agent",
      userId: "user1",
      operationType: "mutation",
      gqlBody: "mutation { create_board { id } }",
      allowed: false,
      responseStatus: null,
      latencyMs: null,
    });

    const logs = await queryAuditLogs(env.DB, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].allowed).toBe(0);
    expect(logs[0].response_status).toBeNull();
  });

  it("filters by token label", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "query", gqlBody: "{ a }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });
    await logRequest(env.DB, {
      tokenId: "hash_b", tokenLabel: "Agent B", userId: "u1",
      operationType: "query", gqlBody: "{ b }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });

    const logs = await queryAuditLogs(env.DB, { tokenLabel: "Agent A" });
    expect(logs).toHaveLength(1);
    expect(logs[0].token_label).toBe("Agent A");
  });

  it("filters by allowed status", async () => {
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "query", gqlBody: "{ a }", allowed: true,
      responseStatus: 200, latencyMs: 10,
    });
    await logRequest(env.DB, {
      tokenId: "hash_a", tokenLabel: "Agent A", userId: "u1",
      operationType: "mutation", gqlBody: "mutation { x }", allowed: false,
      responseStatus: null, latencyMs: null,
    });

    const logs = await queryAuditLogs(env.DB, { allowed: false });
    expect(logs).toHaveLength(1);
    expect(logs[0].operation_type).toBe("mutation");
  });
});
