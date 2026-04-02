// src/services/tokens.ts
import type { AgentTokenData } from "../types";

export function generateTokenString(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mat_${hex}`;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createToken(
  kv: KVNamespace,
  userId: string,
  label: string,
  permission: "read" | "readwrite"
): Promise<string> {
  const token = generateTokenString();
  const now = new Date().toISOString();
  const data: AgentTokenData = { userId, label, permission, createdAt: now, lastUsedAt: now };

  await kv.put(`token:${token}`, JSON.stringify(data));

  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  index.push(token);
  await kv.put(`user_tokens:${userId}`, JSON.stringify(index));

  return token;
}

export async function getToken(kv: KVNamespace, token: string): Promise<AgentTokenData | null> {
  const raw = await kv.get(`token:${token}`);
  return raw ? JSON.parse(raw) : null;
}

export async function listTokens(
  kv: KVNamespace,
  userId: string
): Promise<(AgentTokenData & { token: string })[]> {
  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const results: (AgentTokenData & { token: string })[] = [];

  for (const token of index) {
    const data = await getToken(kv, token);
    if (data) {
      results.push({ ...data, token });
    }
  }
  return results;
}

export async function revokeToken(kv: KVNamespace, userId: string, token: string): Promise<void> {
  await kv.delete(`token:${token}`);

  const indexRaw = await kv.get(`user_tokens:${userId}`);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const updated = index.filter((t) => t !== token);
  await kv.put(`user_tokens:${userId}`, JSON.stringify(updated));
}

export async function updateLastUsed(kv: KVNamespace, token: string): Promise<void> {
  const data = await getToken(kv, token);
  if (!data) return;
  data.lastUsedAt = new Date().toISOString();
  await kv.put(`token:${token}`, JSON.stringify(data));
}
