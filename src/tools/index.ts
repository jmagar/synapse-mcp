import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";
import type { ServiceContainer } from "../services/container.js";

/**
 * Register all homelab tools with the MCP server
 */
export function registerTools(server: McpServer, container?: ServiceContainer): void {
  if (!container) {
    throw new Error("ServiceContainer is required for tool registration");
  }
  registerUnifiedTool(server, container);
}
