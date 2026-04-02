// src/services/audit.ts

export interface AuditLogEntry {
  tokenId: string;
  tokenLabel: string;
  userId: string;
  operationType: "query" | "mutation";
  gqlBody: string;
  allowed: boolean;
  responseStatus: number | null;
  latencyMs: number | null;
}

export interface AuditLogRow {
  id: number;
  token_id: string;
  token_label: string;
  user_id: string;
  operation_type: string;
  gql_body: string;
  allowed: number;
  response_status: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AuditQueryFilters {
  tokenLabel?: string;
  allowed?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function logRequest(db: D1Database, entry: AuditLogEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (token_id, token_label, user_id, operation_type, gql_body, allowed, response_status, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entry.tokenId,
      entry.tokenLabel,
      entry.userId,
      entry.operationType,
      entry.gqlBody,
      entry.allowed ? 1 : 0,
      entry.responseStatus,
      entry.latencyMs
    )
    .run();
}

export async function queryAuditLogs(
  db: D1Database,
  filters: AuditQueryFilters
): Promise<AuditLogRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.tokenLabel) {
    conditions.push("token_label = ?");
    params.push(filters.tokenLabel);
  }
  if (filters.allowed !== undefined) {
    conditions.push("allowed = ?");
    params.push(filters.allowed ? 1 : 0);
  }
  if (filters.from) {
    conditions.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("created_at <= ?");
    params.push(filters.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const query = `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<AuditLogRow>();
  return result.results;
}
