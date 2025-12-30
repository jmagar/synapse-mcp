// src/schemas/flux/host.test.ts
import { describe, it, expect } from "vitest";
import {
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema
} from "./host.js";

describe("Host Schemas", () => {
  describe("hostStatusSchema", () => {
    it("should validate with optional host", () => {
      const result = hostStatusSchema.parse({
        action: "host",
        subaction: "status"
      });
      expect(result.action_subaction).toBe("host:status");
    });

    it("should validate with specific host", () => {
      const result = hostStatusSchema.parse({
        action: "host",
        subaction: "status",
        host: "tootie"
      });
      expect(result.host).toBe("tootie");
    });
  });

  describe("hostResourcesSchema", () => {
    it("should validate resources query", () => {
      const result = hostResourcesSchema.parse({
        action: "host",
        subaction: "resources",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("host:resources");
    });

    it("should work without host", () => {
      const result = hostResourcesSchema.parse({
        action: "host",
        subaction: "resources"
      });
      expect(result.action_subaction).toBe("host:resources");
    });
  });

  describe("hostInfoSchema", () => {
    it("should validate host info", () => {
      const result = hostInfoSchema.parse({
        action: "host",
        subaction: "info",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("host:info");
    });
  });

  describe("hostUptimeSchema", () => {
    it("should validate uptime query", () => {
      const result = hostUptimeSchema.parse({
        action: "host",
        subaction: "uptime",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("host:uptime");
    });
  });

  describe("hostServicesSchema", () => {
    it("should validate with service filter", () => {
      const result = hostServicesSchema.parse({
        action: "host",
        subaction: "services",
        host: "tootie",
        service: "docker",
        state: "running"
      });
      expect(result.service).toBe("docker");
      expect(result.state).toBe("running");
    });

    it("should default state to all", () => {
      const result = hostServicesSchema.parse({
        action: "host",
        subaction: "services"
      });
      expect(result.state).toBe("all");
    });

    it("should validate all state options", () => {
      const states = ["running", "stopped", "failed", "all"] as const;
      states.forEach((state) => {
        const result = hostServicesSchema.parse({
          action: "host",
          subaction: "services",
          state
        });
        expect(result.state).toBe(state);
      });
    });
  });

  describe("hostNetworkSchema", () => {
    it("should validate network info", () => {
      const result = hostNetworkSchema.parse({
        action: "host",
        subaction: "network"
      });
      expect(result.action_subaction).toBe("host:network");
    });

    it("should validate with specific host", () => {
      const result = hostNetworkSchema.parse({
        action: "host",
        subaction: "network",
        host: "tootie"
      });
      expect(result.host).toBe("tootie");
    });
  });

  describe("hostMountsSchema", () => {
    it("should validate mounts listing", () => {
      const result = hostMountsSchema.parse({
        action: "host",
        subaction: "mounts",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("host:mounts");
    });

    it("should work without host", () => {
      const result = hostMountsSchema.parse({
        action: "host",
        subaction: "mounts"
      });
      expect(result.action_subaction).toBe("host:mounts");
    });
  });
});
