// src/schemas/flux/host.ts
import { z } from "zod";
import { responseFormatSchema, hostSchema, preprocessWithDiscriminator } from "../common.js";

/**
 * Host subaction schemas for Flux tool (7 subactions)
 */

export const hostStatusSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:status"),
      action: z.literal("host"),
      subaction: z.literal("status"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Check Docker connectivity to host")
);

export const hostResourcesSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:resources"),
      action: z.literal("host"),
      subaction: z.literal("resources"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get CPU, memory, and disk usage via SSH")
);

export const hostInfoSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:info"),
      action: z.literal("host"),
      subaction: z.literal("info"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get OS, kernel, architecture, and hostname information")
);

export const hostUptimeSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:uptime"),
      action: z.literal("host"),
      subaction: z.literal("uptime"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get system uptime")
);

export const hostServicesSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:services"),
      action: z.literal("host"),
      subaction: z.literal("services"),
      host: hostSchema.optional(),
      service: z.string().optional().describe("Specific systemd service name"),
      state: z.enum(["running", "stopped", "failed", "all"]).default("all"),
      response_format: responseFormatSchema
    })
    .describe("Get systemd service status")
);

export const hostNetworkSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:network"),
      action: z.literal("host"),
      subaction: z.literal("network"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get network interfaces and IP addresses")
);

export const hostMountsSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:mounts"),
      action: z.literal("host"),
      subaction: z.literal("mounts"),
      host: hostSchema.optional(),
      response_format: responseFormatSchema
    })
    .describe("Get mounted filesystems")
);
