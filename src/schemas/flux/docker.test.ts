// src/schemas/flux/docker.test.ts
import { describe, it, expect } from "vitest";
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

describe("Docker Schemas", () => {
  describe("dockerInfoSchema", () => {
    it("should validate docker info", () => {
      const result = dockerInfoSchema.parse({
        action: "docker",
        subaction: "info",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("docker:info");
    });
  });

  describe("dockerDfSchema", () => {
    it("should validate docker df", () => {
      const result = dockerDfSchema.parse({
        action: "docker",
        subaction: "df",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("docker:df");
    });
  });

  describe("dockerPruneSchema", () => {
    it("should validate prune targets", () => {
      const result = dockerPruneSchema.parse({
        action: "docker",
        subaction: "prune",
        host: "tootie",
        prune_target: "images",
        force: true
      });
      expect(result.prune_target).toBe("images");
      expect(result.force).toBe(true);
    });

    it("should default force to false", () => {
      const result = dockerPruneSchema.parse({
        action: "docker",
        subaction: "prune",
        host: "tootie",
        prune_target: "containers"
      });
      expect(result.force).toBe(false);
    });

    it("should validate all prune targets", () => {
      const targets = ["containers", "images", "volumes", "networks", "buildcache", "all"] as const;
      targets.forEach((target) => {
        const result = dockerPruneSchema.parse({
          action: "docker",
          subaction: "prune",
          host: "tootie",
          prune_target: target
        });
        expect(result.prune_target).toBe(target);
      });
    });
  });

  describe("dockerImagesSchema", () => {
    it("should validate images listing", () => {
      const result = dockerImagesSchema.parse({
        action: "docker",
        subaction: "images",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("docker:images");
      expect(result.dangling_only).toBe(false);
    });

    it("should validate dangling_only filter", () => {
      const result = dockerImagesSchema.parse({
        action: "docker",
        subaction: "images",
        dangling_only: true
      });
      expect(result.dangling_only).toBe(true);
    });

    it("should validate with pagination", () => {
      const result = dockerImagesSchema.parse({
        action: "docker",
        subaction: "images",
        limit: 50,
        offset: 10
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });
  });

  describe("dockerPullSchema", () => {
    it("should validate image pull", () => {
      const result = dockerPullSchema.parse({
        action: "docker",
        subaction: "pull",
        host: "tootie",
        image: "nginx:latest"
      });
      expect(result.image).toBe("nginx:latest");
      expect(result.action_subaction).toBe("docker:pull");
    });
  });

  describe("dockerBuildSchema", () => {
    it("should validate build with all options (absolute context, relative dockerfile)", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/path/to/app",
        tag: "myapp:latest",
        dockerfile: "Dockerfile.prod",
        no_cache: true
      });
      expect(result.context).toBe("/path/to/app");
      expect(result.tag).toBe("myapp:latest");
      expect(result.dockerfile).toBe("Dockerfile.prod");
      expect(result.no_cache).toBe(true);
    });

    it("should default no_cache", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1"
      });
      expect(result.dockerfile).toBeUndefined();
      expect(result.no_cache).toBe(false);
    });

    it("should reject relative context paths", () => {
      expect(() => dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "app",
        tag: "test:v1"
      })).toThrow();
    });

    it("should accept relative dockerfile paths (Docker standard)", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1",
        dockerfile: "Dockerfile"
      });
      expect(result.dockerfile).toBe("Dockerfile");
    });

    it("should accept relative dockerfile in subdirectory", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1",
        dockerfile: "docker/Dockerfile.prod"
      });
      expect(result.dockerfile).toBe("docker/Dockerfile.prod");
    });

    it("should reject dockerfile path traversal with ..", () => {
      expect(() => dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1",
        dockerfile: "../Dockerfile"
      })).toThrow("Path traversal not allowed");
    });

    it("should reject dockerfile with absolute path", () => {
      expect(() => dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1",
        dockerfile: "/etc/passwd"
      })).toThrow("Dockerfile path must be relative to context");
    });

    it("should accept paths with current directory references in context", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/path/./app",
        tag: "test:v1"
      });
      expect(result.context).toBe("/path/./app");
    });

    it("should accept dockerfile with dots in filename", () => {
      const result = dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app",
        tag: "test:v1",
        dockerfile: "Dockerfile.prod"
      });
      expect(result.dockerfile).toBe("Dockerfile.prod");
    });

    it("should reject context path traversal with ..", () => {
      expect(() => dockerBuildSchema.parse({
        action: "docker",
        subaction: "build",
        host: "tootie",
        context: "/app/../etc",
        tag: "test:v1"
      })).toThrow("Path traversal not allowed");
    });
  });

  describe("dockerRmiSchema", () => {
    it("should validate image removal", () => {
      const result = dockerRmiSchema.parse({
        action: "docker",
        subaction: "rmi",
        host: "tootie",
        image: "old-image:v1",
        force: true
      });
      expect(result.image).toBe("old-image:v1");
      expect(result.force).toBe(true);
    });

    it("should default force to false", () => {
      const result = dockerRmiSchema.parse({
        action: "docker",
        subaction: "rmi",
        host: "tootie",
        image: "test:latest"
      });
      expect(result.force).toBe(false);
    });
  });

  describe("dockerNetworksSchema", () => {
    it("should validate networks listing", () => {
      const result = dockerNetworksSchema.parse({
        action: "docker",
        subaction: "networks",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("docker:networks");
    });

    it("should validate with pagination", () => {
      const result = dockerNetworksSchema.parse({
        action: "docker",
        subaction: "networks",
        limit: 30,
        offset: 5
      });
      expect(result.limit).toBe(30);
      expect(result.offset).toBe(5);
    });
  });

  describe("dockerVolumesSchema", () => {
    it("should validate volumes listing", () => {
      const result = dockerVolumesSchema.parse({
        action: "docker",
        subaction: "volumes",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("docker:volumes");
    });

    it("should validate with pagination", () => {
      const result = dockerVolumesSchema.parse({
        action: "docker",
        subaction: "volumes",
        limit: 25,
        offset: 0
      });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(0);
    });
  });
});
