// src/schemas/scout/zfs.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema, zfsPoolSchema, zfsDatasetSchema } from '../common.js';

/**
 * Scout ZFS nested discriminator (3 subactions)
 * Uses standard discriminatedUnion on 'subaction'
 *
 * SECURITY: Pool and dataset names are validated against shell metacharacters
 * to prevent command injection (CWE-78) when passed to zpool/zfs commands.
 */
export const scoutZfsSchema = z.discriminatedUnion('subaction', [
  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('pools'),
    host: hostSchema,
    pool: zfsPoolSchema.optional().describe('Pool name filter'),
    health: z.enum(['online', 'degraded', 'faulted']).optional(),
    response_format: responseFormatSchema
  }).describe('List ZFS storage pools'),

  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('datasets'),
    host: hostSchema,
    pool: zfsPoolSchema.optional().describe('Pool name filter'),
    type: z.enum(['filesystem', 'volume']).optional(),
    recursive: z.boolean().default(false).describe('Include child datasets'),
    response_format: responseFormatSchema
  }).describe('List ZFS datasets'),

  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('snapshots'),
    host: hostSchema,
    pool: zfsPoolSchema.optional().describe('Pool name filter'),
    dataset: zfsDatasetSchema.optional().describe('Filter to specific dataset'),
    limit: z.number().int().min(1).max(1000).optional(),
    response_format: responseFormatSchema
  }).describe('List ZFS snapshots')
]);
