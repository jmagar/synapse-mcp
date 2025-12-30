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
 * Extract inner schema from z.preprocess wrapper
 * Handles both Zod 3.x (innerType) and Zod 4.x (pipe structure)
 */
function unwrapPreprocess(schema: z.ZodTypeAny): z.ZodTypeAny {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  // Zod 4.x: z.preprocess creates a pipe with type='pipe' and out field
  if (def?.type === 'pipe' && def?.out) return def.out;
  // Zod 3.x uses 'innerType'
  if (def?.innerType) return def.innerType;
  // Return as-is if not wrapped
  return schema;
}

// All inner schemas (unwrapped from preprocess)
const allSchemas = [
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
].map(unwrapPreprocess) as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]];

/** Total number of subactions in the Flux schema */
export const FLUX_SUBACTION_COUNT = allSchemas.length;

/**
 * Flux Tool Schema - Docker infrastructure management
 *
 * Actions: 4 (container, compose, docker, host)
 * Subactions: 39 total
 *   - container: 14 (list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top)
 *   - compose: 9 (list, status, up, down, restart, logs, build, pull, recreate)
 *   - docker: 9 (info, df, prune, images, pull, build, rmi, networks, volumes)
 *   - host: 7 (status, resources, info, uptime, services, network, mounts)
 *
 * Uses composite discriminator: action_subaction (e.g., "container:list")
 */
export const FluxSchema = z.preprocess(
  preprocessWithDiscriminator,
  z.discriminatedUnion("action_subaction", allSchemas)
);

export type FluxInput = z.infer<typeof FluxSchema>;

// Re-export all schemas
export * from "./container.js";
export * from "./compose.js";
export * from "./docker.js";
export * from "./host.js";
