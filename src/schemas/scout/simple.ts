// src/schemas/scout/simple.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema, jsFilterSchema } from '../common.js';
import {
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT
} from '../../constants.js';

/**
 * Scout simple action schemas (9 actions without subactions)
 * Scout uses 'action' as the primary discriminator (not composite like Flux)
 */

// Shared schema for remote target paths in hostname:/path format
const scoutTargetSchema = z.string()
  .min(3)
  .regex(/^[a-zA-Z0-9_-]+:\/.*$/, "Must be 'hostname:/path' format")
  .describe('Remote location in hostname:/path format');

/**
 * Safe filesystem path schema - validates against shell metacharacters and path traversal
 * SECURITY: Prevents command injection (CWE-78) by rejecting dangerous characters
 * SECURITY: Prevents path traversal (CWE-22) by rejecting '..' as path components
 * Allows: alphanumeric, underscore, hyphen, period, forward slash
 *
 * Note: The regex /(^|\/)\.\.(\/|$)/ specifically matches '..' as a path COMPONENT
 * (preceded by start/slash and followed by slash/end). This intentionally allows:
 * - 'file..backup' (dots within filename, not traversal)
 * - 'foo...bar' (multiple dots in filename)
 * These are safe because '..' only enables traversal when it's a complete path component.
 */
const safePathSchema = z.string()
  .min(1)
  .regex(/^[a-zA-Z0-9._\-/]+$/, 'Path contains invalid characters (shell metacharacters not allowed)')
  .refine(
    (path) => !/(^|\/)\.\.(\/|$)/.test(path),
    'Path traversal sequences (..) are not allowed'
  )
  .describe('Filesystem path (must be safe for shell use)');

export const scoutNodesSchema = z.object({
  action: z.literal('nodes'),
  response_format: responseFormatSchema
}).describe('List all configured SSH hosts');

export const scoutPeekSchema = z.object({
  action: z.literal('peek'),
  target: scoutTargetSchema,
  tree: z.boolean().default(false).describe('Show directory tree'),
  depth: z.number().min(1).max(MAX_TREE_DEPTH).default(DEFAULT_TREE_DEPTH),
  response_format: responseFormatSchema
}).describe('Read file or directory contents on a remote host');

export const scoutExecSchema = z.object({
  action: z.literal('exec'),
  target: scoutTargetSchema.describe('Working directory for command'),
  command: z.string().min(1).describe('Shell command to execute'),
  timeout: z.number().int().min(1).max(MAX_COMMAND_TIMEOUT).default(DEFAULT_COMMAND_TIMEOUT),
  response_format: responseFormatSchema
}).describe('Execute command on a remote host');

export const scoutFindSchema = z.object({
  action: z.literal('find'),
  target: scoutTargetSchema.describe('Search root directory'),
  pattern: z.string().min(1).describe('Glob pattern for file matching'),
  depth: z.number().min(1).max(MAX_TREE_DEPTH).default(DEFAULT_TREE_DEPTH),
  limit: z.number().int().min(1).max(MAX_FIND_LIMIT).default(DEFAULT_FIND_LIMIT),
  response_format: responseFormatSchema
}).describe('Find files by glob pattern on a remote host');

export const scoutDeltaSchema = z.object({
  action: z.literal('delta'),
  source: z.string().min(1).describe('File source - local path or remote hostname:/path'),
  target: z.string().optional().describe('File destination for comparison'),
  content: z.string().optional().describe('String content for comparison'),
  response_format: responseFormatSchema
}).refine(
  data => data.target || data.content,
  { message: 'Either target or content must be provided for comparison' }
).describe('Compare files or content between locations');

export const scoutEmitSchema = z.object({
  action: z.literal('emit'),
  targets: z.array(scoutTargetSchema).min(1).describe('Array of remote locations'),
  command: z.string().optional().describe('Shell command to execute on all targets'),
  timeout: z.number().int().min(1).max(MAX_COMMAND_TIMEOUT).default(DEFAULT_COMMAND_TIMEOUT),
  response_format: responseFormatSchema
}).describe('Multi-host operations');

export const scoutBeamSchema = z.object({
  action: z.literal('beam'),
  source: z.string().min(1).describe('File source - local path or remote hostname:/path'),
  destination: z.string().min(1).describe('File destination - local path or remote hostname:/path'),
  response_format: responseFormatSchema
}).describe('File transfer between local and remote hosts');

export const scoutPsSchema = z.object({
  action: z.literal('ps'),
  host: hostSchema,
  grep: jsFilterSchema.optional().describe('Filter output containing this string'),
  user: z.string().optional().describe('Filter processes by username'),
  sort: z.enum(['cpu', 'mem', 'pid', 'time']).default('cpu'),
  limit: z.number().int().min(1).max(1000).default(50),
  response_format: responseFormatSchema
}).describe('List and search processes on a remote host');

export const scoutDfSchema = z.object({
  action: z.literal('df'),
  host: hostSchema,
  path: safePathSchema.optional().describe('Specific filesystem path or mount point'),
  human_readable: z.boolean().default(true),
  response_format: responseFormatSchema
}).describe('Disk usage information for a remote host');
