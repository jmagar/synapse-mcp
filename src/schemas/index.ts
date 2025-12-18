import { z } from "zod";
import { ResponseFormat } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_LOG_LINES, MAX_LOG_LINES } from "../constants.js";

// Common pagination schema
const paginationSchema = {
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Maximum results to return (1-${MAX_LIMIT})`),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination")
};

// Common response format schema
const responseFormatSchema = {
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
};

// Host filter schema
const hostFilterSchema = {
  host: z.string()
    .optional()
    .describe("Filter by specific host name (e.g., 'unraid', 'proxmox-vm1'). Omit for all hosts.")
};

// List containers schema
export const ListContainersSchema = z.object({
  ...hostFilterSchema,
  state: z.enum(["all", "running", "stopped", "paused"])
    .default("all")
    .describe("Filter by container state"),
  name_filter: z.string()
    .optional()
    .describe("Filter containers by name (partial match)"),
  image_filter: z.string()
    .optional()
    .describe("Filter by image name (partial match)"),
  label_filter: z.string()
    .optional()
    .describe("Filter by label (format: 'key=value' or just 'key')"),
  ...paginationSchema,
  ...responseFormatSchema
}).strict();
export type ListContainersInput = z.infer<typeof ListContainersSchema>;

// Container action schema
export const ContainerActionSchema = z.object({
  container_id: z.string()
    .min(1)
    .describe("Container ID or name"),
  host: z.string()
    .optional()
    .describe("Host where container is running (auto-detected if omitted)"),
  action: z.enum(["start", "stop", "restart", "pause", "unpause"])
    .describe("Action to perform on the container")
}).strict();
export type ContainerActionInput = z.infer<typeof ContainerActionSchema>;

// Get logs schema
export const GetLogsSchema = z.object({
  container_id: z.string()
    .min(1)
    .describe("Container ID or name"),
  host: z.string()
    .optional()
    .describe("Host where container is running (auto-detected if omitted)"),
  lines: z.number()
    .int()
    .min(1)
    .max(MAX_LOG_LINES)
    .default(DEFAULT_LOG_LINES)
    .describe(`Number of log lines to retrieve (1-${MAX_LOG_LINES})`),
  since: z.string()
    .optional()
    .describe("Show logs since timestamp (e.g., '2024-01-01T00:00:00Z' or '1h' for relative)"),
  until: z.string()
    .optional()
    .describe("Show logs until timestamp"),
  grep: z.string()
    .optional()
    .describe("Filter logs containing this string (case-insensitive)"),
  stream: z.enum(["all", "stdout", "stderr"])
    .default("all")
    .describe("Which output stream to retrieve"),
  ...responseFormatSchema
}).strict();
export type GetLogsInput = z.infer<typeof GetLogsSchema>;

// Container stats schema
export const ContainerStatsSchema = z.object({
  container_id: z.string()
    .optional()
    .describe("Container ID or name (omit for all running containers)"),
  host: z.string()
    .optional()
    .describe("Host to get stats from"),
  ...responseFormatSchema
}).strict();
export type ContainerStatsInput = z.infer<typeof ContainerStatsSchema>;

// Inspect container schema
export const InspectContainerSchema = z.object({
  container_id: z.string()
    .min(1)
    .describe("Container ID or name"),
  host: z.string()
    .optional()
    .describe("Host where container is running (auto-detected if omitted)"),
  ...responseFormatSchema
}).strict();
export type InspectContainerInput = z.infer<typeof InspectContainerSchema>;

// Host status schema
export const HostStatusSchema = z.object({
  host: z.string()
    .optional()
    .describe("Specific host to check (omit for all hosts)"),
  ...responseFormatSchema
}).strict();
export type HostStatusInput = z.infer<typeof HostStatusSchema>;

// Search containers schema
export const SearchContainersSchema = z.object({
  query: z.string()
    .min(1)
    .describe("Search query to match against container names, images, and labels"),
  ...hostFilterSchema,
  ...paginationSchema,
  ...responseFormatSchema
}).strict();
export type SearchContainersInput = z.infer<typeof SearchContainersSchema>;

// Compose project schema
export const ComposeProjectSchema = z.object({
  project: z.string()
    .min(1)
    .describe("Docker Compose project name"),
  host: z.string()
    .optional()
    .describe("Host where project is running"),
  action: z.enum(["status", "up", "down", "restart", "logs"])
    .describe("Action to perform on the compose project")
}).strict();
export type ComposeProjectInput = z.infer<typeof ComposeProjectSchema>;

// List images schema
export const ListImagesSchema = z.object({
  ...hostFilterSchema,
  dangling_only: z.boolean()
    .default(false)
    .describe("Only show dangling (untagged) images"),
  ...paginationSchema,
  ...responseFormatSchema
}).strict();
export type ListImagesInput = z.infer<typeof ListImagesSchema>;

// Prune schema
export const PruneSchema = z.object({
  host: z.string()
    .optional()
    .describe("Host to prune (omit for all hosts)"),
  target: z.enum(["containers", "images", "volumes", "networks", "buildcache", "all"])
    .describe("What to prune"),
  force: z.boolean()
    .default(false)
    .describe("Confirm destructive operation (required)")
}).strict();
export type PruneInput = z.infer<typeof PruneSchema>;

// Docker info schema
export const DockerInfoSchema = z.object({
  host: z.string()
    .optional()
    .describe("Host to get Docker info from (omit for all hosts)"),
  ...responseFormatSchema
}).strict();
export type DockerInfoInput = z.infer<typeof DockerInfoSchema>;

// Docker disk usage schema
export const DockerDiskUsageSchema = z.object({
  host: z.string()
    .optional()
    .describe("Host to get disk usage from (omit for all hosts)"),
  ...responseFormatSchema
}).strict();
export type DockerDiskUsageInput = z.infer<typeof DockerDiskUsageSchema>;

// Host resources schema (SSH-based)
export const HostResourcesSchema = z.object({
  host: z.string()
    .optional()
    .describe("Host to get resources from (omit for all hosts)"),
  ...responseFormatSchema
}).strict();
export type HostResourcesInput = z.infer<typeof HostResourcesSchema>;
