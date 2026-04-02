// test/helpers.ts
import { env } from "cloudflare:test";

export async function setupD1() {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      token_label TEXT NOT NULL,
      user_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      gql_body TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      response_status INTEGER,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
