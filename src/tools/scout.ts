// src/tools/scout.ts
import { ScoutSchema, type ScoutInput } from '../schemas/scout/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';

interface HelpInput {
  action: 'help';
  topic?: string;
  format?: 'markdown' | 'json';
}

/**
 * Scout tool handler - SSH remote operations
 *
 * Handles 11 total actions:
 * - Simple: 9 (nodes, peek, exec, find, delta, emit, beam, ps, df)
 * - Nested with subactions:
 *   - zfs: 3 (pools, datasets, snapshots)
 *   - logs: 4 (syslog, journal, dmesg, auth)
 *
 * Plus 'help' pseudo-action for auto-generated documentation.
 */
export async function handleScoutTool(
  input: unknown,
  container: ServiceContainer
): Promise<string> {
  // Handle help action before schema validation
  if (typeof input === 'object' && input !== null && 'action' in input && (input as { action: string }).action === 'help') {
    const helpInput = input as HelpInput;
    const entries = generateHelp(ScoutSchema, helpInput.topic);

    if (helpInput.format === 'json') {
      return formatHelpJson(entries);
    }
    return formatHelpMarkdown(entries);
  }

  // Validate input against Scout schema
  const validated = ScoutSchema.parse(input) as ScoutInput;

  // Route to appropriate handler based on action
  switch (validated.action) {
    case 'nodes':
      return handleNodesAction(validated, container);
    case 'peek':
      return handlePeekAction(validated, container);
    case 'exec':
      return handleExecAction(validated, container);
    case 'find':
      return handleFindAction(validated, container);
    case 'delta':
      return handleDeltaAction(validated, container);
    case 'emit':
      return handleEmitAction(validated, container);
    case 'beam':
      return handleBeamAction(validated, container);
    case 'ps':
      return handlePsAction(validated, container);
    case 'df':
      return handleDfAction(validated, container);
    case 'zfs':
      return handleZfsAction(validated, container);
    case 'logs':
      return handleLogsAction(validated, container);
    default:
      // Zod validation should prevent reaching here
      throw new Error(`Unknown action: ${(validated as { action: string }).action}`);
  }
}

// Placeholder handlers - will be implemented in Tasks 20-22

function handleNodesAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: nodes');
}

function handlePeekAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: peek');
}

function handleExecAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: exec');
}

function handleFindAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: find');
}

function handleDeltaAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: delta');
}

function handleEmitAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: emit');
}

function handleBeamAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: beam');
}

function handlePsAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: ps');
}

function handleDfAction(_input: ScoutInput, _container: ServiceContainer): never {
  throw new Error('Handler not implemented: df');
}

function handleZfsAction(input: ScoutInput, _container: ServiceContainer): never {
  if (input.action !== 'zfs') {
    throw new Error(`Invalid action for zfs handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: zfs:${input.subaction}`);
}

function handleLogsAction(input: ScoutInput, _container: ServiceContainer): never {
  if (input.action !== 'logs') {
    throw new Error(`Invalid action for logs handler: ${input.action}`);
  }
  throw new Error(`Handler not implemented: logs:${input.subaction}`);
}
