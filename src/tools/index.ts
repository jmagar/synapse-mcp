import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";

/**
 * Register all homelab tools with the MCP server
 */
export function registerTools(server: McpServer): void {
  registerUnifiedTool(server);
}
