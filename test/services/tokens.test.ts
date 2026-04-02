// test/services/tokens.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createToken, getToken, listTokens, revokeToken, updateLastUsed, hashToken } from "../../src/services/tokens";

describe("token service", () => {
  beforeEach(async () => {
    const keys = await env.KV.list({ prefix: "token:" });
    for (const key of keys.keys) {
      await env.KV.delete(key.name);
    }
    const userKeys = await env.KV.list({ prefix: "user_tokens:" });
    for (const key of userKeys.keys) {
      await env.KV.delete(key.name);
    }
  });

  it("creates a token with mat_ prefix and stores it in KV", async () => {
    const token = await createToken(env.KV, "user1", "My Agent", "read");
    expect(token.startsWith("mat_")).toBe(true);
    expect(token.length).toBe(68);

    const data = await getToken(env.KV, token);
    expect(data).not.toBeNull();
    expect(data!.userId).toBe("user1");
    expect(data!.label).toBe("My Agent");
    expect(data!.permission).toBe("read");
  });

  it("lists tokens for a user", async () => {
    await createToken(env.KV, "user1", "Agent A", "read");
    await createToken(env.KV, "user1", "Agent B", "readwrite");

    const tokens = await listTokens(env.KV, "user1");
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.label).sort()).toEqual(["Agent A", "Agent B"]);
  });

  it("revokes a token", async () => {
    const token = await createToken(env.KV, "user1", "Agent A", "read");
    await revokeToken(env.KV, "user1", token);

    const data = await getToken(env.KV, token);
    expect(data).toBeNull();

    const tokens = await listTokens(env.KV, "user1");
    expect(tokens).toHaveLength(0);
  });

  it("updates lastUsedAt", async () => {
    const token = await createToken(env.KV, "user1", "Agent A", "read");
    const before = (await getToken(env.KV, token))!.lastUsedAt;

    await new Promise((r) => setTimeout(r, 10));
    await updateLastUsed(env.KV, token);

    const after = (await getToken(env.KV, token))!.lastUsedAt;
    expect(after).not.toBe(before);
  });

  it("hashToken produces consistent SHA-256 hex", async () => {
    const hash1 = await hashToken("mat_test123");
    const hash2 = await hashToken("mat_test123");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});
