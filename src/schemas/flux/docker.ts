// src/schemas/flux/docker.ts
import { z } from "zod";
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  imageSchema,
  preprocessWithDiscriminator
} from "../common.js";

/**
 * Docker subaction schemas for Flux tool (9 subactions)
 */

export const dockerInfoSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:info"),
      action: z.literal("docker"),
      subaction: z.literal("info"),
      host: hostSchema,
      response_format: responseFormatSchema
    })
    .describe("Get Docker daemon information")
);

export const dockerDfSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:df"),
      action: z.literal("docker"),
      subaction: z.literal("df"),
      host: hostSchema,
      response_format: responseFormatSchema
    })
    .describe("Get Docker disk usage information")
);

export const dockerPruneSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:prune"),
      action: z.literal("docker"),
      subaction: z.literal("prune"),
      host: hostSchema,
      prune_target: z.enum(["containers", "images", "volumes", "networks", "buildcache", "all"]),
      force: z.boolean().default(false),
      response_format: responseFormatSchema
    })
    .describe("Remove unused Docker resources")
);

export const dockerImagesSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:images"),
      action: z.literal("docker"),
      subaction: z.literal("images"),
      host: hostSchema.optional(),
      dangling_only: z.boolean().default(false).describe("Only show untagged images"),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("List Docker images")
);

export const dockerPullSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:pull"),
      action: z.literal("docker"),
      subaction: z.literal("pull"),
      host: hostSchema,
      image: imageSchema,
      response_format: responseFormatSchema
    })
    .describe("Pull a Docker image")
);

export const dockerBuildSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:build"),
      action: z.literal("docker"),
      subaction: z.literal("build"),
      host: hostSchema,
      context: z.string().min(1).describe("Path to build context directory"),
      tag: z.string().min(1).describe("Image name:tag for the built image"),
      dockerfile: z.string().default("Dockerfile").describe("Path to Dockerfile"),
      no_cache: z.boolean().default(false),
      response_format: responseFormatSchema
    })
    .describe("Build a Docker image")
);

export const dockerRmiSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:rmi"),
      action: z.literal("docker"),
      subaction: z.literal("rmi"),
      host: hostSchema,
      image: imageSchema,
      force: z.boolean().default(false),
      response_format: responseFormatSchema
    })
    .describe("Remove a Docker image")
);

export const dockerNetworksSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:networks"),
      action: z.literal("docker"),
      subaction: z.literal("networks"),
      host: hostSchema.optional(),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("List Docker networks")
);

export const dockerVolumesSchema = z.preprocess(
  preprocessWithDiscriminator,
  z
    .object({
      action_subaction: z.literal("docker:volumes"),
      action: z.literal("docker"),
      subaction: z.literal("volumes"),
      host: hostSchema.optional(),
      ...paginationSchema.shape,
      response_format: responseFormatSchema
    })
    .describe("List Docker volumes")
);
