// src/tools/scout.ts
import { ScoutSchema, type ScoutInput } from '../schemas/scout/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';
import { handleScoutSimpleAction } from './handlers/scout-simple.js';
import { handleZfsAction } from './handlers/scout-zfs.js';
import { handleLogsAction } from './handlers/scout-logs.js';

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
  const parsed = ScoutSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Scout input validation failed: ${JSON.stringify(parsed.error.issues)}`);
  }
  const validated = parsed.data as ScoutInput;

  // Route to appropriate handler based on action
  switch (validated.action) {
    // Simple actions (9) - handled by scout-simple handler
    case 'nodes':
    case 'peek':
    case 'exec':
    case 'find':
    case 'delta':
    case 'emit':
    case 'beam':
    case 'ps':
    case 'df':
      return handleScoutSimpleAction(validated, container);

    // Nested actions with subactions
    case 'zfs':
      return handleZfsAction(validated, container);
    case 'logs':
      return handleLogsAction(validated, container);
    default:
      // Zod validation should prevent reaching here
      throw new Error(`Unknown action: ${(validated as { action: string }).action}`);
  }
}
