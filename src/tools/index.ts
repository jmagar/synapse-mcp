// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContainer } from "../services/container.js";
import { handleFluxTool } from './flux.js';
import { handleScoutTool } from './scout.js';
import { FluxSchema } from '../schemas/flux/index.js';
import { ScoutSchema } from '../schemas/scout/index.js';
import { logError, sanitizeParams } from '../utils/errors.js';
import { getSchemaDescription } from '@modelcontextprotocol/sdk/server/zod-compat.js';

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
      description: getSchemaDescription(FluxSchema) ?? 'Docker infrastructure management',
      inputSchema: FluxSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      try {
        const result = await handleFluxTool(params, container);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        logError(error, {
          operation: 'flux:handler',
          metadata: {
            message: 'Flux tool execution failed',
            params: sanitizeParams(params),
            container: { type: container.constructor.name }
          }
        });
        throw error;
      }
    }
  );

  // Register Scout tool using MCP SDK 1.25.1 API
  server.registerTool(
    'scout',
    {
      title: 'Scout Tool',
      description: getSchemaDescription(ScoutSchema) ?? 'SSH remote operations',
      inputSchema: ScoutSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      try {
        const result = await handleScoutTool(params, container);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        logError(error, {
          operation: 'scout:handler',
          metadata: {
            message: 'Scout tool execution failed',
            params: sanitizeParams(params),
            container: { type: container.constructor.name }
          }
        });
        throw error;
      }
    }
  );
}
