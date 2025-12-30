// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContainer } from "../services/container.js";
import { handleFluxTool } from './flux.js';
import { handleScoutTool } from './scout.js';
import { FluxSchema } from '../schemas/flux/index.js';
import { ScoutSchema } from '../schemas/scout/index.js';

/**
 * Register Flux and Scout tools with the MCP server
 */
export function registerTools(server: McpServer, container?: ServiceContainer): void {
  if (!container) {
    throw new Error("ServiceContainer is required for tool registration");
  }

  // Register Flux tool using MCP SDK 1.25.1 API
  server.registerTool(
    'flux',
    {
      title: 'Flux Tool',
      description: 'Docker infrastructure management - container, compose, docker, and host operations',
      inputSchema: FluxSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      const result = await handleFluxTool(params, container);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // Register Scout tool using MCP SDK 1.25.1 API
  server.registerTool(
    'scout',
    {
      title: 'Scout Tool',
      description: 'SSH remote operations - file, process, and system inspection',
      inputSchema: ScoutSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      const result = await handleScoutTool(params, container);
      return { content: [{ type: 'text', text: result }] };
    }
  );
}
