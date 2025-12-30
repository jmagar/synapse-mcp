// src/tools/flux.ts
import { FluxSchema, type FluxInput } from '../schemas/flux/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';
import { handleContainerAction } from './handlers/container.js';
import { handleComposeAction } from './handlers/compose.js';
import { handleDockerAction } from './handlers/docker.js';
import { handleHostAction } from './handlers/host.js';

interface HelpInput {
  action: 'help';
  topic?: string;
  format?: 'markdown' | 'json';
}

/**
 * Flux tool handler - Docker infrastructure management
 *
 * Handles 4 action categories with 39 total subactions:
 * - container: 14 subactions (list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top)
 * - compose: 9 subactions (list, status, up, down, restart, logs, build, pull, recreate)
 * - docker: 9 subactions (info, df, prune, images, pull, build, rmi, networks, volumes)
 * - host: 7 subactions (status, resources, info, uptime, services, network, mounts)
 *
 * Plus 'help' pseudo-action for auto-generated documentation.
 */
export async function handleFluxTool(
  input: unknown,
  container: ServiceContainer
): Promise<string> {
  // Handle help action before schema validation
  if (typeof input === 'object' && input !== null && 'action' in input && (input as { action: string }).action === 'help') {
    const helpInput = input as HelpInput;
    const entries = generateHelp(FluxSchema, helpInput.topic);

    if (helpInput.format === 'json') {
      return formatHelpJson(entries);
    }
    return formatHelpMarkdown(entries);
  }

  // Validate input against Flux schema
  const validated = FluxSchema.parse(input) as FluxInput;

  // Route to appropriate handler based on action
  switch (validated.action) {
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
