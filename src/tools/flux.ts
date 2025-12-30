// src/tools/flux.ts
import { FluxSchema, type FluxInput } from '../schemas/flux/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';

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

/**
 * Placeholder handler for container actions
 * Will be implemented in Task 16
 */
function handleContainerAction(input: FluxInput, _container: ServiceContainer): Promise<string> {
  // Type guard to ensure we have container action
  if (input.action !== 'container') {
    throw new Error(`Invalid action for container handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: container:${input.subaction}`);
}

/**
 * Placeholder handler for compose actions
 * Will be implemented in Task 17
 */
function handleComposeAction(input: FluxInput, _container: ServiceContainer): Promise<string> {
  // Type guard to ensure we have compose action
  if (input.action !== 'compose') {
    throw new Error(`Invalid action for compose handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: compose:${input.subaction}`);
}

/**
 * Placeholder handler for docker actions
 * Will be implemented in Task 18
 */
function handleDockerAction(input: FluxInput, _container: ServiceContainer): Promise<string> {
  // Type guard to ensure we have docker action
  if (input.action !== 'docker') {
    throw new Error(`Invalid action for docker handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: docker:${input.subaction}`);
}

/**
 * Placeholder handler for host actions
 * Will be implemented in Task 19
 */
function handleHostAction(input: FluxInput, _container: ServiceContainer): Promise<string> {
  // Type guard to ensure we have host action
  if (input.action !== 'host') {
    throw new Error(`Invalid action for host handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: host:${input.subaction}`);
}
