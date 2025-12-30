// src/schemas/scout/zfs.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema } from '../common.js';

/**
 * ZFS pool name validation regex
 * Pool names must start with a letter and contain only alphanumeric, underscore, hyphen, or dot
 * SECURITY: Prevents command injection by rejecting shell metacharacters
 */
const ZFS_POOL_REGEX = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/**
 * ZFS dataset/path validation regex
 * Dataset paths can include forward slashes for nested datasets (e.g., pool/dataset/nested)
 * Must start with a letter, segments separated by forward slashes
 * SECURITY: Prevents command injection by rejecting shell metacharacters
 */
const ZFS_DATASET_REGEX = /^[a-zA-Z][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_.-]+)*$/;

/**
 * Validated ZFS pool name schema
 */
const zfsPoolSchema = z.string()
  .regex(ZFS_POOL_REGEX, 'Invalid pool name: must start with a letter and contain only alphanumeric, underscore, hyphen, or dot');

/**
 * Validated ZFS dataset path schema (allows forward slashes for nested datasets)
 */
const zfsDatasetSchema = z.string()
  .regex(ZFS_DATASET_REGEX, 'Invalid dataset path: must start with a letter and contain only alphanumeric, underscore, hyphen, dot, or forward slash');

/**
 * Scout ZFS nested discriminator (3 subactions)
 * Uses standard discriminatedUnion on 'subaction'
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
    pool: zfsDatasetSchema.optional().describe('Pool or dataset path filter'),
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
