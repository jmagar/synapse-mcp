import { z } from "zod";
import { ResponseFormat } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_LOG_LINES, MAX_LOG_LINES } from "../constants.js";

// ===== Base schemas =====
const responseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' or 'json'");

const paginationSchema = {
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0)
};

// ===== Container subactions =====
const containerListSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("list"),
  host: z.string().optional(),
  state: z.enum(["all", "running", "stopped", "paused"]).default("all"),
  name_filter: z.string().optional(),
  image_filter: z.string().optional(),
  label_filter: z.string().optional(),
  ...paginationSchema,
  response_format: responseFormatSchema
});

// Individual container control schemas (for proper discrimination)
const containerStartSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("start"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerStopSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("stop"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerRestartSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("restart"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerPauseSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("pause"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerUnpauseSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("unpause"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerLogsSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("logs"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  since: z.string().optional(),
  until: z.string().optional(),
  grep: z.string().optional(),
  stream: z.enum(["all", "stdout", "stderr"]).default("all"),
  response_format: responseFormatSchema
});

const containerStatsSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("stats"),
  container_id: z.string().optional(),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const containerInspectSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("inspect"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  summary: z.boolean().default(true).describe("Return summary instead of full inspect (reduces output size)"),
  response_format: responseFormatSchema
});

const containerSearchSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("search"),
  query: z.string().min(1),
  host: z.string().optional(),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const containerPullSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("pull"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerRecreateSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("recreate"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  pull: z.boolean().default(true).describe("Pull latest image before recreating")
});

// ===== Compose subactions =====
const composeListSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("list"),
  host: z.string().min(1),
  name_filter: z.string().optional().describe("Filter projects by name (case-insensitive substring match)"),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const composeStatusSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("status"),
  host: z.string().min(1),
  project: z.string().min(1),
  service_filter: z.string().optional().describe("Filter services by name"),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const composeUpSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("up"),
  host: z.string().min(1),
  project: z.string().min(1),
  detach: z.boolean().default(true)
});

const composeDownSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("down"),
  host: z.string().min(1),
  project: z.string().min(1),
  remove_volumes: z.boolean().default(false)
});

const composeRestartSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("restart"),
  host: z.string().min(1),
  project: z.string().min(1)
});

const composeLogsSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("logs"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional(),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  response_format: responseFormatSchema
});

const composeBuildSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("build"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional(),
  no_cache: z.boolean().default(false)
});

const composeRecreateSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("recreate"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional()
});

const composePullSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("pull"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional()
});

// ===== Host subactions =====
const hostStatusSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("status"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const hostResourcesSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("resources"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

// ===== Docker subactions =====
const dockerInfoSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("info"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const dockerDfSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("df"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const dockerPruneSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("prune"),
  host: z.string().optional(),
  prune_target: z.enum(["containers", "images", "volumes", "networks", "buildcache", "all"]),
  force: z.boolean().default(false)
});

// ===== Image subactions =====
const imageListSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("list"),
  host: z.string().optional(),
  dangling_only: z.boolean().default(false),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const imagePullSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("pull"),
  host: z.string().min(1),
  image: z.string().min(1).describe("Image name with optional tag (e.g., 'nginx:latest')")
});

const imageBuildSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("build"),
  host: z.string().min(1),
  context: z.string().min(1).describe("Path to build context directory"),
  tag: z.string().min(1).describe("Image tag (e.g., 'myapp:v1')"),
  dockerfile: z.string().optional().describe("Path to Dockerfile (default: context/Dockerfile)"),
  no_cache: z.boolean().default(false)
});

const imageRemoveSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("remove"),
  host: z.string().min(1),
  image: z.string().min(1).describe("Image ID or name:tag"),
  force: z.boolean().default(false)
});

// ===== Unified schema using z.union (flat structure for proper validation) =====
// NOTE: z.discriminatedUnion requires all variants to share the same discriminator.
// Since we have action + subaction pairs, we use z.union with refinement for clarity.
export const UnifiedHomelabSchema = z.union([
  // Container actions
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerUnpauseSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  // Compose actions
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composeRecreateSchema,
  composePullSchema,
  // Host actions
  hostStatusSchema,
  hostResourcesSchema,
  // Docker actions
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  // Image actions
  imageListSchema,
  imagePullSchema,
  imageBuildSchema,
  imageRemoveSchema
]);

export type UnifiedHomelabInput = z.infer<typeof UnifiedHomelabSchema>;

// Re-export individual schemas for type narrowing
export {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerUnpauseSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composeRecreateSchema,
  composePullSchema,
  hostStatusSchema,
  hostResourcesSchema,
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  imageListSchema,
  imagePullSchema,
  imageBuildSchema,
  imageRemoveSchema
};
