// src/schemas/flux/host.ts
import { z } from "zod";
import { responseFormatSchema, hostSchema, preprocessWithDiscriminator } from "../common.js";
import { SYSTEMD_SERVICE_NAME_PATTERN } from "../../utils/index.js";

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
      service: z
        .string()
        .regex(
          SYSTEMD_SERVICE_NAME_PATTERN,
          "Service name must contain only valid systemd characters"
        )
        .optional()
        .describe("Specific systemd service name"),
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

// New infrastructure building block schemas

export const hostPortsSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:ports"),
      action: z.literal("host"),
      subaction: z.literal("ports"),
      host: hostSchema,
      limit: z.number().min(1).max(1000).default(100),
      offset: z.number().min(0).default(0),
      filter: z
        .object({
          protocol: z.enum(["tcp", "udp"]).optional(),
          state: z.enum(["listening", "bound", "reserved"]).optional(),
          source: z.enum(["host", "docker", "compose"]).optional()
        })
        .optional(),
      response_format: responseFormatSchema
    })
    .describe("List all ports in use across all sources (host + docker + compose)")
);

export const hostDoctorSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("host:doctor"),
      action: z.literal("host"),
      subaction: z.literal("doctor"),
      host: hostSchema,
      checks: z
        .array(
          z.enum([
            "resources",
            "containers",
            "logs",
            "processes",
            "docker",
            "network"
          ])
        )
        .optional(),
      response_format: responseFormatSchema
    })
    .describe("Comprehensive health diagnostics")
);

// Type exports
export type HostStatusInput = z.infer<typeof hostStatusSchema>;
export type HostResourcesInput = z.infer<typeof hostResourcesSchema>;
export type HostInfoInput = z.infer<typeof hostInfoSchema>;
export type HostUptimeInput = z.infer<typeof hostUptimeSchema>;
export type HostServicesInput = z.infer<typeof hostServicesSchema>;
export type HostNetworkInput = z.infer<typeof hostMountsSchema>;
export type HostMountsInput = z.infer<typeof hostMountsSchema>;
export type HostPortsInput = z.infer<typeof hostPortsSchema>;
export type HostDoctorInput = z.infer<typeof hostDoctorSchema>;
