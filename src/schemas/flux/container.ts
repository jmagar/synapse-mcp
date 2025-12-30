// src/schemas/flux/container.ts
import { z } from "zod";
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  containerIdSchema,
  preprocessWithDiscriminator,
  jsFilterSchema,
  execUserSchema,
  execWorkdirSchema
} from "../common.js";
import { DEFAULT_LOG_LINES, MAX_LOG_LINES, DEFAULT_EXEC_TIMEOUT, MAX_EXEC_TIMEOUT } from "../../constants.js";

/**
 * Container subaction schemas for Flux tool (14 subactions)
 */

export const containerListSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:list"),
      action: z.literal("container"),
      subaction: z.literal("list"),
      host: hostSchema.optional(),
      state: z.enum(["running", "exited", "paused", "restarting", "all"]).default("all"),
      name_filter: z.string().optional().describe("Partial match on container name"),
      image_filter: z.string().optional().describe("Partial match on image name"),
      label_filter: z.string().optional().describe("Key-value pairs in format key=value"),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("List containers with optional filtering")
);

export const containerStartSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:start"),
      action: z.literal("container"),
      subaction: z.literal("start"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Start a stopped container")
);

export const containerStopSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:stop"),
      action: z.literal("container"),
      subaction: z.literal("stop"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Stop a running container")
);

export const containerRestartSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:restart"),
      action: z.literal("container"),
      subaction: z.literal("restart"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Restart a container")
);

export const containerPauseSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:pause"),
      action: z.literal("container"),
      subaction: z.literal("pause"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Pause a running container")
);

export const containerResumeSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:resume"),
      action: z.literal("container"),
      subaction: z.literal("resume"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Resume a paused container")
);

export const containerLogsSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:logs"),
      action: z.literal("container"),
      subaction: z.literal("logs"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
      since: z.string().optional().describe('ISO 8601 timestamp or relative time (e.g., "1h")'),
      until: z.string().optional().describe("ISO 8601 timestamp or relative time"),
      grep: jsFilterSchema.optional().describe("Filter log lines containing this string"),
      stream: z.enum(["stdout", "stderr", "both"]).default("both"),
      response_format: responseFormatSchema
    })
    .describe("Get container logs with optional filtering")
);

export const containerStatsSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:stats"),
      action: z.literal("container"),
      subaction: z.literal("stats"),
      container_id: containerIdSchema.optional(),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get resource usage statistics")
);

export const containerInspectSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:inspect"),
      action: z.literal("container"),
      subaction: z.literal("inspect"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      summary: z.boolean().default(false).describe("true = basic info only, false = full details"),
      response_format: responseFormatSchema
    })
    .describe("Get detailed container information")
);

export const containerSearchSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:search"),
      action: z.literal("container"),
      subaction: z.literal("search"),
      query: z.string().min(1).describe("Full-text search string"),
      host: hostSchema.optional(),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("Search containers by query string")
);

export const containerPullSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:pull"),
      action: z.literal("container"),
      subaction: z.literal("pull"),
      container_id: containerIdSchema,
      image: z.string().trim().min(1).optional().describe("Explicit image to pull if container metadata is missing"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Pull latest image for a container")
);

export const containerRecreateSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:recreate"),
      action: z.literal("container"),
      subaction: z.literal("recreate"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      pull: z.boolean().default(true).describe("Pull latest image before recreate"),
      response_format: responseFormatSchema
    })
    .describe("Recreate a container with optional image pull")
);

export const containerExecSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:exec"),
      action: z.literal("container"),
      subaction: z.literal("exec"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      command: z.string().min(1).describe("Shell command to execute"),
      user: execUserSchema.optional().describe("Run as specific user (e.g., root, 1000, 1000:1000)"),
      workdir: execWorkdirSchema.optional().describe("Absolute path for working directory"),
      timeout: z
        .number()
        .int()
        .min(1000)
        .max(MAX_EXEC_TIMEOUT)
        .default(DEFAULT_EXEC_TIMEOUT)
        .describe("Execution timeout in milliseconds (default 30s, max 5min)"),
      response_format: responseFormatSchema
    })
    .describe("Execute command inside a container")
);

export const containerTopSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("container:top"),
      action: z.literal("container"),
      subaction: z.literal("top"),
      container_id: containerIdSchema,
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Show running processes in a container")
);
