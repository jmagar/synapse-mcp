// src/schemas/scout/index.ts
import { z } from 'zod';
import {
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema
} from './simple.js';
import { scoutZfsSchema } from './zfs.js';
import { scoutLogsSchema } from './logs.js';

/**
 * Scout Tool Schema - SSH remote operations
 *
 * Actions: 11 total
 *   Simple: 9 (nodes, peek, exec, find, delta, emit, beam, ps, df)
 *   Nested: 2 with subactions
 *     - zfs: 3 subactions (pools, datasets, snapshots)
 *     - logs: 4 subactions (syslog, journal, dmesg, auth)
 *
 * IMPORTANT: Uses z.union (not z.discriminatedUnion) because zfs and logs
 * are nested discriminated unions. You cannot nest discriminated unions
 * directly in z.discriminatedUnion - it requires literal discriminator values.
 *
 * Simple actions use literal 'action' discriminator
 * Nested actions use 'subaction' as secondary discriminator
 */
export const ScoutSchema = z.union([
  // Simple actions (9)
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema,

  // Nested discriminators (2) - these are already discriminated unions
  scoutZfsSchema,
  scoutLogsSchema
]).describe('SSH remote operations - file, process, and system inspection');

export type ScoutInput = z.infer<typeof ScoutSchema>;

// Re-export all schemas for individual use
export * from './simple.js';
export * from './zfs.js';
export * from './logs.js';
