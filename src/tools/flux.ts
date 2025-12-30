// src/tools/flux.ts
import { FluxSchema, type FluxInput } from '../schemas/flux/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';
import { handleContainerAction } from './handlers/container.js';
import { handleComposeAction } from './handlers/compose.js';
import { handleDockerAction } from './handlers/docker.js';
import { handleHostAction } from './handlers/host.js';

/**
 * Flux tool handler - Docker infrastructure management
 *
 * Handles 5 action categories with 40 total subactions:
 * - help: 1 subaction (auto-generated documentation)
 * - container: 14 subactions (list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top)
 * - compose: 9 subactions (list, status, up, down, restart, logs, build, pull, recreate)
 * - docker: 9 subactions (info, df, prune, images, pull, build, rmi, networks, volumes)
 * - host: 7 subactions (status, resources, info, uptime, services, network, mounts)
 */
export async function handleFluxTool(
  input: unknown,
  container: ServiceContainer
): Promise<string> {
  // Validate input against Flux schema
  const validated = FluxSchema.parse(input) as FluxInput;

  // Route to appropriate handler based on action
  switch (validated.action) {
    case 'help': {
      // Type narrowing for help action
      const helpData = validated as { action: 'help'; topic?: string; format?: 'markdown' | 'json' };
      const entries = generateHelp(FluxSchema, helpData.topic);
      if (helpData.format === 'json') {
        return formatHelpJson(entries);
      }
      return formatHelpMarkdown(entries);
    }
    case 'container':
      return handleContainerAction(validated, container);
    case 'compose':
      return handleComposeAction(validated, container);
    case 'docker':
      return handleDockerAction(validated, container);
    case 'host':
      return handleHostAction(validated, container);
    default:
      // Zod validation should prevent reaching here
      throw new Error(`Unknown action: ${(validated as { action: string }).action}`);
  }
}
