// src/services/users.ts
import type { UserData } from "../types";

export async function saveUser(kv: KVNamespace, userId: string, data: UserData): Promise<void> {
  await kv.put(`user:${userId}`, JSON.stringify(data));
}

export async function getUser(kv: KVNamespace, userId: string): Promise<UserData | null> {
  const raw = await kv.get(`user:${userId}`);
  return raw ? JSON.parse(raw) : null;
}
