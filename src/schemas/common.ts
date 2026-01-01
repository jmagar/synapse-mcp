// src/schemas/common.ts
/**
 * Common schemas shared across Flux and Scout tools
 *
 * These are the building blocks used by the unified schema system.
 * All schemas here are designed to be composable and reusable.
 */
import { z } from "zod";
import { ResponseFormat } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";

/**
 * Response format schema for output formatting
 * Defaults to markdown for human-readable output
 */
export const responseFormatSchema = z
  .enum(Object.values(ResponseFormat) as [ResponseFormat, ...ResponseFormat[]])
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' or 'json'");

/**
 * Pagination schema for list operations
 * Used to control result set size and implement pagination
 */
export const paginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum results to return"),
  offset: z.number().int().min(0).default(0).describe("Number of results to skip for pagination")
});

/**
 * Host name schema with validation
 * Accepts alphanumeric characters with dashes and underscores
 */
export const hostSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "Host must be alphanumeric with dashes/underscores")
  .describe("Target Docker host");

/**
 * Container ID or name schema
 * Validates non-empty string for container identification
 */
export const containerIdSchema = z.string().min(1).describe("Container name or ID");

/**
 * Project name schema for Docker Compose
 */
export const projectSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "Project name must be alphanumeric with dashes/underscores")
  .describe("Docker Compose project name");

/**
 * Image name schema with optional tag
 */
export const imageSchema = z.string().min(1).describe("Image name with optional tag");

/**
 * Schema for grep patterns passed to shell commands.
 *
 * @description Strict validation that blocks shell metacharacters to prevent
 * command injection (CWE-78). Use this ONLY for patterns passed to shell
 * commands like `grep`, `awk`, or other CLI tools via SSH or exec.
 *
 * This schema intentionally rejects common log message characters like
 * brackets `[]`, quotes `'"`, and parentheses `()` because these have
 * special meaning in shell contexts and could enable injection attacks.
 *
 * @example
 * // CORRECT - For shell grep commands (scout-logs)
 * const scoutLogsSchema = z.object({
 *   host: hostSchema,
 *   grep: shellGrepSchema.optional()  // Passed to: grep -E "${pattern}"
 * });
 *
 * @example
 * // Valid patterns for shell grep
 * shellGrepSchema.parse("error");           // Simple word
 * shellGrepSchema.parse("connection reset"); // Words with spaces
 * shellGrepSchema.parse("nginx.*failed");   // Basic regex
 * shellGrepSchema.parse("status: 5..");     // Numbers and punctuation
 *
 * @example
 * // INVALID - These throw ZodError
 * shellGrepSchema.parse("[ERROR]");    // Brackets are shell metacharacters
 * shellGrepSchema.parse("'admin'");    // Quotes are shell metacharacters
 * shellGrepSchema.parse("$(whoami)");  // Command substitution attempt
 * shellGrepSchema.parse("foo; rm -rf"); // Command chaining attempt
 *
 * @example
 * // INCORRECT - Don't use for JavaScript filtering
 * // For client-side String.includes() matching, use jsFilterSchema instead
 * // which allows brackets, quotes, and other common log characters
 *
 * @see {@link jsFilterSchema} for JavaScript-side filtering with String.includes()
 */
export const shellGrepSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^;&|`$()<>{}[\]\\"\n\r\t']+$/, "Grep pattern contains shell metacharacters")
  .describe("Shell-safe grep pattern (shell metacharacters not allowed)");

/**
 * Backwards-compatible alias for existing schema imports.
 */
export const safeGrepSchema = shellGrepSchema;

/**
 * Schema for filter patterns used in JavaScript String.includes() matching.
 *
 * @description Relaxed validation for patterns that are ONLY used client-side
 * in JavaScript with `String.includes()`. These patterns are never passed to
 * shell commands, so shell metacharacters are safe to allow.
 *
 * This schema allows characters commonly found in log messages that would be
 * rejected by shellGrepSchema:
 * - Brackets: `[ERROR]`, `[INFO]`, `[2024-01-15]`
 * - Quotes: `User 'admin'`, `key="value"`
 * - Parentheses: `(deprecated)`, `method(arg)`
 * - Special chars: `$PATH`, `a|b`, `foo;bar`
 *
 * Only control characters (0x00-0x1F) are rejected to prevent log injection
 * and display corruption.
 *
 * @example
 * // CORRECT - For JavaScript String.includes() filtering
 * const containerLogsSchema = z.object({
 *   container: containerIdSchema,
 *   filter: jsFilterSchema.optional()  // Used with: line.includes(filter)
 * });
 *
 * @example
 * // Valid patterns for JS filtering (allows log message syntax)
 * jsFilterSchema.parse("[ERROR]");           // Brackets allowed
 * jsFilterSchema.parse("User 'admin'");      // Quotes allowed
 * jsFilterSchema.parse("status=(failed)");   // Parentheses allowed
 * jsFilterSchema.parse("key=\"value\"");     // Escaped quotes allowed
 * jsFilterSchema.parse("path: /var/log");    // Forward slashes allowed
 *
 * @example
 * // INVALID - These throw ZodError
 * jsFilterSchema.parse("line\ninjection");   // Newlines are control chars
 * jsFilterSchema.parse("has\ttab");          // Tabs are control chars
 * jsFilterSchema.parse("null\x00byte");      // Null bytes rejected
 *
 * @example
 * // INCORRECT - Don't use for shell commands
 * // For patterns passed to grep/awk via SSH, use shellGrepSchema instead
 * // which blocks shell metacharacters for security
 *
 * @see {@link shellGrepSchema} for shell-safe grep patterns
 */
export const jsFilterSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) => {
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code >= 0 && code <= 31) return false;
      }
      return true;
    },
    { message: "Filter pattern contains control characters" }
  )
  .describe("Filter pattern for JavaScript String.includes() matching");

/**
 * ZFS pool name schema with security validation
 * SECURITY: Prevents command injection (CWE-78) by rejecting shell metacharacters
 * Valid characters: alphanumeric, underscore, hyphen, period
 * Must start with a letter (per ZFS naming requirements)
 * Does NOT allow forward slash (pools are top-level only)
 */
export const zfsPoolSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z][a-zA-Z0-9_\-.]*$/, "Pool name must start with a letter and contain only alphanumeric, dashes, underscores, or periods")
  .describe("ZFS pool name");

/**
 * ZFS dataset name schema with security validation
 * SECURITY: Prevents command injection (CWE-78) by rejecting shell metacharacters
 * Valid characters: alphanumeric, underscore, hyphen, period, forward slash, @, #
 * Must start with a letter (per ZFS naming requirements)
 * Allows hierarchical paths like tank/data/backup
 * Allows snapshot notation like tank/data@snap
 * Allows bookmark notation like tank/data#bookmark
 *
 * Note: Colon (:) is intentionally excluded. While ZFS allows it for user properties
 * (e.g., com.example:property), this schema is for dataset/snapshot/bookmark paths only.
 * If user property support is needed, create a separate zfsPropertySchema.
 */
export const zfsDatasetSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z][a-zA-Z0-9_\-./@#]*$/, "Dataset name must start with a letter and contain only alphanumeric, dashes, underscores, periods, slashes, @, or #")
  .describe("ZFS dataset name (can include path like pool/dataset, snapshot @, or bookmark #)");

/**
 * Exec user schema with security validation
 * SECURITY: Prevents command injection by validating Docker exec user format
 * Valid formats:
 *   - Simple username: root, www-data, app_user
 *   - Numeric UID: 1000
 *   - UID:GID: 1000:1000
 *   - username:groupname: www-data:www-data
 * Must start with alphanumeric or underscore (not hyphen to prevent option injection)
 */
export const execUserSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9_][a-zA-Z0-9_-]*(?::[a-zA-Z0-9_][a-zA-Z0-9_-]*)?$|^\d+(?::\d+)?$/,
    "User must be a valid username, uid, username:groupname, or uid:gid format"
  )
  .describe("User to run command as (e.g., root, 1000, 1000:1000)");

/**
 * Exec workdir schema with security validation
 * SECURITY: Prevents path traversal and command injection
 * Requirements:
 *   - Must be an absolute path (starts with /)
 *   - Only allows safe characters: alphanumeric, underscore, hyphen, period, forward slash
 *   - Does NOT allow: shell metacharacters, directory traversal (..), variable expansion ($)
 *
 * @note The root path `/` is intentionally allowed. Some Docker containers
 * (especially minimal/distroless or scratch-based images) have very minimal
 * filesystems where `/` may be the only valid working directory. Additionally,
 * many official images use `/` as the default WORKDIR. Restricting this would
 * break legitimate use cases.
 *
 * @example Valid paths
 * ```typescript
 * execWorkdirSchema.parse("/")              // Root path (allowed for minimal containers)
 * execWorkdirSchema.parse("/app")           // Simple absolute path
 * execWorkdirSchema.parse("/var/lib/data")  // Nested path
 * execWorkdirSchema.parse("/app-v1.0")      // Path with dashes and dots
 * ```
 *
 * @example Invalid paths
 * ```typescript
 * execWorkdirSchema.parse("app")            // Relative path (no leading /)
 * execWorkdirSchema.parse("/app/../etc")    // Directory traversal
 * execWorkdirSchema.parse("/app; rm -rf /") // Shell metacharacters
 * execWorkdirSchema.parse("/app/$HOME")     // Variable expansion
 * execWorkdirSchema.parse("/path with spaces") // Spaces not allowed
 * ```
 */
export const execWorkdirSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^\/[a-zA-Z0-9_\-./]*$/, "Working directory must be an absolute path with safe characters only")
  .refine((path) => !path.includes(".."), {
    message: "Working directory cannot contain directory traversal (..)"
  })
  .describe("Absolute path for working directory");

/**
 * Preprocessor to inject composite discriminator key
 * Used by Flux tool to create action_subaction from action + subaction
 *
 * Transforms: { action: "container", subaction: "list" }
 * To: { action: "container", subaction: "list", action_subaction: "container:list" }
 *
 * Special case for help: { action: "help" }
 * To: { action: "help", action_subaction: "help" }
 */
export function preprocessWithDiscriminator(data: unknown): unknown {
  if (data && typeof data === "object" && "action" in data) {
    const obj = data as Record<string, unknown>;

    // Handle subaction case: inject action_subaction from action + subaction
    if ("subaction" in data) {
      return { ...obj, action_subaction: `${obj.action}:${obj.subaction}` };
    }
  }
  return data;
}
