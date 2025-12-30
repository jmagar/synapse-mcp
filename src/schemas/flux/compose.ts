// src/schemas/flux/compose.ts
import { z } from "zod";
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  projectSchema,
  preprocessWithDiscriminator
} from "../common.js";
import { DEFAULT_LOG_LINES, MAX_LOG_LINES } from "../../constants.js";

/**
 * Compose subaction schemas for Flux tool (9 subactions)
 */

export const composeListSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:list"),
      action: z.literal("compose"),
      subaction: z.literal("list"),
      host: hostSchema,
      name_filter: z.string().optional().describe("Partial match on project name"),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("List all Docker Compose projects")
);

export const composeStatusSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:status"),
      action: z.literal("compose"),
      subaction: z.literal("status"),
      host: hostSchema,
      project: projectSchema,
      service_filter: z.string().optional().describe("Filter to specific service(s)"),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("Get Docker Compose project status")
);

export const composeUpSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:up"),
      action: z.literal("compose"),
      subaction: z.literal("up"),
      host: hostSchema,
      project: projectSchema,
      detach: z.boolean().default(true).describe("Run in background"),
      response_format: responseFormatSchema
    })
    .describe("Start a Docker Compose project")
);

export const composeDownSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:down"),
      action: z.literal("compose"),
      subaction: z.literal("down"),
      host: hostSchema,
      project: projectSchema,
      remove_volumes: z.boolean().default(false).describe("Delete volumes (destructive!)"),
      response_format: responseFormatSchema
    })
    .describe("Stop a Docker Compose project")
);

export const composeRestartSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:restart"),
      action: z.literal("compose"),
      subaction: z.literal("restart"),
      host: hostSchema,
      project: projectSchema,
      response_format: responseFormatSchema
    })
    .describe("Restart a Docker Compose project")
);

export const composeLogsSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:logs"),
      action: z.literal("compose"),
      subaction: z.literal("logs"),
      host: hostSchema,
      project: projectSchema,
      service: z.string().optional().describe("Target specific service"),
      lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
      since: z.string().optional(),
      until: z.string().optional(),
      grep: z.string().optional(),
      response_format: responseFormatSchema
    })
    .describe("Get Docker Compose project logs")
);

export const composeBuildSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:build"),
      action: z.literal("compose"),
      subaction: z.literal("build"),
      host: hostSchema,
      project: projectSchema,
      service: z.string().optional().describe("Target specific service"),
      no_cache: z.boolean().default(false).describe("Rebuild from scratch"),
      response_format: responseFormatSchema
    })
    .describe("Build Docker Compose project images")
);

export const composePullSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:pull"),
      action: z.literal("compose"),
      subaction: z.literal("pull"),
      host: hostSchema,
      project: projectSchema,
      service: z.string().optional(),
      response_format: responseFormatSchema
    })
    .describe("Pull Docker Compose project images")
);

export const composeRecreateSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("compose:recreate"),
      action: z.literal("compose"),
      subaction: z.literal("recreate"),
      host: hostSchema,
      project: projectSchema,
      service: z.string().optional(),
      response_format: responseFormatSchema
    })
    .describe("Recreate Docker Compose project containers")
);
