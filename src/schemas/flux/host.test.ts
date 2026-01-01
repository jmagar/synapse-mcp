// src/schemas/flux/host.test.ts
import { describe, it, expect } from "vitest";
import {
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema,
  hostPortsSchema,
  hostDoctorSchema,
  type HostNetworkInput
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

    it("should reject invalid service names", () => {
      expect(() =>
        hostServicesSchema.parse({
          action: "host",
          subaction: "services",
          service: "docker;rm -rf /"
        })
      ).toThrowError(/Service name must contain only valid systemd characters/);
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

    it("should have correct type inference for HostNetworkInput", () => {
      // This test ensures HostNetworkInput type matches hostNetworkSchema
      const networkInput: HostNetworkInput = {
        action: "host",
        subaction: "network",
        action_subaction: "host:network",
        response_format: "markdown"
      };
      const result = hostNetworkSchema.parse(networkInput);
      expect(result.subaction).toBe("network");
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

  describe("hostPortsSchema", () => {
    it("should validate valid host:ports input", () => {
      const result = hostPortsSchema.parse({
        action: "host",
        subaction: "ports",
        host: "squirts"
      });
      expect(result.action_subaction).toBe("host:ports");
    });

    it("should use default pagination values", () => {
      const result = hostPortsSchema.parse({
        action: "host",
        subaction: "ports",
        host: "squirts"
      });
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    });

    it("should validate with custom pagination", () => {
      const result = hostPortsSchema.parse({
        action: "host",
        subaction: "ports",
        host: "squirts",
        limit: 50,
        offset: 100
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });

    it("should validate with filters", () => {
      const result = hostPortsSchema.parse({
        action: "host",
        subaction: "ports",
        host: "squirts",
        filter: {
          protocol: "tcp",
          state: "listening",
          source: "docker"
        }
      });
      expect(result.filter?.protocol).toBe("tcp");
      expect(result.filter?.state).toBe("listening");
      expect(result.filter?.source).toBe("docker");
    });

    it("should reject invalid protocol", () => {
      expect(() =>
        hostPortsSchema.parse({
          action: "host",
          subaction: "ports",
          host: "squirts",
          filter: {
            protocol: "invalid"
          }
        })
      ).toThrow();
    });

    it("should reject invalid limit range", () => {
      expect(() =>
        hostPortsSchema.parse({
          action: "host",
          subaction: "ports",
          host: "squirts",
          limit: 2000
        })
      ).toThrow();
    });
  });

  describe("hostDoctorSchema", () => {
    it("should validate valid host:doctor input", () => {
      const result = hostDoctorSchema.parse({
        action: "host",
        subaction: "doctor",
        host: "squirts"
      });
      expect(result.action_subaction).toBe("host:doctor");
    });

    it("should validate with specific checks", () => {
      const result = hostDoctorSchema.parse({
        action: "host",
        subaction: "doctor",
        host: "squirts",
        checks: ["resources", "containers", "logs"]
      });
      expect(result.checks).toEqual(["resources", "containers", "logs"]);
    });

    it("should validate all check types", () => {
      const result = hostDoctorSchema.parse({
        action: "host",
        subaction: "doctor",
        host: "squirts",
        checks: ["resources", "containers", "logs", "processes", "docker", "network"]
      });
      expect(result.checks).toHaveLength(6);
    });

    it("should reject invalid check type", () => {
      expect(() =>
        hostDoctorSchema.parse({
          action: "host",
          subaction: "doctor",
          host: "squirts",
          checks: ["invalid"]
        })
      ).toThrow();
    });

    it("should allow no checks specified", () => {
      const result = hostDoctorSchema.parse({
        action: "host",
        subaction: "doctor",
        host: "squirts"
      });
      expect(result.checks).toBeUndefined();
    });
  });
});
