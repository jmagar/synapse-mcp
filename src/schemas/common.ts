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
  .nativeEnum(ResponseFormat)
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
export const projectSchema = z.string().min(1).describe("Docker Compose project name");

/**
 * Image name schema with optional tag
 */
export const imageSchema = z.string().min(1).describe("Image name with optional tag");

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
 * Preprocessor to inject composite discriminator key
 * Used by Flux tool to create action_subaction from action + subaction
 *
 * Transforms: { action: "container", subaction: "list" }
 * To: { action: "container", subaction: "list", action_subaction: "container:list" }
 */
export function preprocessWithDiscriminator(data: unknown): unknown {
  if (data && typeof data === "object" && "action" in data && "subaction" in data) {
    const obj = data as Record<string, unknown>;
    return { ...obj, action_subaction: `${obj.action}:${obj.subaction}` };
  }
  return data;
}
