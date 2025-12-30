// src/schemas/flux/index.ts
import { z } from "zod";
import { preprocessWithDiscriminator } from "../common.js";

// Import all schemas
import {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema
} from "./container.js";

import {
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema
} from "./compose.js";

import {
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  dockerImagesSchema,
  dockerPullSchema,
  dockerBuildSchema,
  dockerRmiSchema,
  dockerNetworksSchema,
  dockerVolumesSchema
} from "./docker.js";

import {
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema
} from "./host.js";

/**
 * Help schema - provides auto-generated documentation
 * This is part of the discriminated union to pass MCP validation
 */
const helpSchema = z.object({
  action_subaction: z.literal("help").describe("Action discriminator for help"),
  action: z.literal("help").describe("Show auto-generated documentation"),
  topic: z.string().optional().describe("Optional: filter to specific topic (e.g., 'container:list')"),
  format: z.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)")
}).describe("Get auto-generated help documentation for flux tool");

/**
 * Internal Zod definition structure for accessing preprocessed schema internals.
 * This is necessary because z.preprocess wraps schemas in a way that hides
 * the inner schema from the public API.
 *
 * Zod 4.x structure: z.preprocess creates a pipe with type='pipe' and out field
 */
interface ZodPreprocessDef {
  type?: string;
  out?: z.ZodTypeAny;
}

/**
 * Extract inner schema from z.preprocess wrapper
 * Only supports Zod 4.x (pipe structure)
 */
function unwrapPreprocess(schema: z.ZodTypeAny): z.ZodTypeAny {
  // Access internal _def property - type assertion needed for internal Zod structure
  const def = (schema as unknown as { _def: ZodPreprocessDef | undefined })._def;
  // Zod 4.x: z.preprocess creates a pipe with type='pipe' and out field
  if (def?.type === 'pipe' && def?.out) return def.out;
  // Return as-is if not wrapped
  return schema;
}

// All inner schemas (unwrapped from preprocess)
// Type assertion is necessary because z.discriminatedUnion requires a tuple type
// with at least 2 elements, but TypeScript infers a regular array from .map()
type DiscriminatedUnionMember = z.ZodObject<z.ZodRawShape>;

// Unwrap all preprocessed schemas
const unwrappedSchemas = [
  // Help (1)
  helpSchema,
  // Container (14)
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema,
  // Compose (9)
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema,
  // Docker (9)
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  dockerImagesSchema,
  dockerPullSchema,
  dockerBuildSchema,
  dockerRmiSchema,
  dockerNetworksSchema,
  dockerVolumesSchema,
  // Host (7)
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema
].map(unwrapPreprocess);

// Runtime validation: ensure all unwrapped schemas are ZodObjects
// This catches errors if Zod internals change or schemas are defined incorrectly
for (let i = 0; i < unwrappedSchemas.length; i++) {
  const schema = unwrappedSchemas[i];
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(
      `Schema unwrap failed at index ${i}: expected ZodObject, got ${schema.constructor.name}. ` +
      'This likely means Zod preprocess structure changed or a schema is incorrectly defined.'
    );
  }
}

// Type assertion to tuple required by discriminatedUnion
const allSchemas = unwrappedSchemas as [DiscriminatedUnionMember, DiscriminatedUnionMember, ...DiscriminatedUnionMember[]];

/** Total number of subactions in the Flux schema */
export const FLUX_SUBACTION_COUNT = allSchemas.length;

/**
 * Flux Tool Schema - Docker infrastructure management
 *
 * Actions: 5 (help, container, compose, docker, host)
 * Subactions: 40 total
 *   - help: 1 (auto-generated documentation)
 *   - container: 14 (list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top)
 *   - compose: 9 (list, status, up, down, restart, logs, build, pull, recreate)
 *   - docker: 9 (info, df, prune, images, pull, build, rmi, networks, volumes)
 *   - host: 7 (status, resources, info, uptime, services, network, mounts)
 *
 * Uses composite discriminator: action_subaction (e.g., "container:list", "help")
 */
export const FluxSchema = z.preprocess(
  preprocessWithDiscriminator,
  z.discriminatedUnion("action_subaction", allSchemas)
).describe('Docker infrastructure management - container, compose, docker, and host operations');

export type FluxInput = z.infer<typeof FluxSchema>;

// Re-export all schemas
export * from "./container.js";
export * from "./compose.js";
export * from "./docker.js";
export * from "./host.js";
