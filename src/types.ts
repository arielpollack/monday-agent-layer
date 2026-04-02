// src/types.ts

export type Env = {
  Bindings: {
    KV: KVNamespace;
    DB: D1Database;
    JWT_SECRET: string;
    MONDAY_CLIENT_ID: string;
    MONDAY_CLIENT_SECRET: string;
  };
  Variables: {
    userId: string;
    agentToken: AgentTokenData;
  };
};

export interface AgentTokenData {
  userId: string;
  label: string;
  permission: "read" | "readwrite";
  createdAt: string;
  lastUsedAt: string;
}

export interface UserData {
  mondayToken: string;
  name: string;
  email: string;
}
