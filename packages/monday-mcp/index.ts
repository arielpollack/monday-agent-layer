import { MondayAgentToolkit } from "@mondaydotcomorg/agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

interface PluginConfig {
  agentToken: string;
  proxyUrl?: string;
}

const DEFAULT_PROXY_URL = "https://monday-agent-layer.ariel-kfir.workers.dev";

export async function startServer(config: PluginConfig): Promise<void> {
  const proxyUrl = config.proxyUrl ?? DEFAULT_PROXY_URL;
  const endpoint = `${proxyUrl.replace(/\/$/, "")}/api/graphql`;

  const toolkit = new MondayAgentToolkit({
    // Toolkit sends token as-is in Authorization header; proxy expects "Bearer mat_..." format
    mondayApiToken: `Bearer ${config.agentToken}`,
    mondayApiEndpoint: endpoint,
    toolsConfiguration: {
      readOnlyMode: false,
    },
  });

  const transport = new StdioServerTransport();
  await toolkit.connect(transport);
}

// When run directly as an MCP server (e.g., via npx or openclaw)
const agentToken = process.env.MONDAY_AGENT_TOKEN;
if (agentToken) {
  startServer({
    agentToken,
    proxyUrl: process.env.MONDAY_PROXY_URL,
  }).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
