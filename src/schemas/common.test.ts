// src/schemas/common.test.ts
import { describe, it, expect } from "vitest";
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  containerIdSchema,
  preprocessWithDiscriminator
} from "./common.js";

describe("Common Schemas", () => {
  describe("responseFormatSchema", () => {
    it("should accept markdown", () => {
      const result = responseFormatSchema.parse("markdown");
      expect(result).toBe("markdown");
    });

    it("should accept json", () => {
      const result = responseFormatSchema.parse("json");
      expect(result).toBe("json");
    });

    it("should default to markdown", () => {
      const result = responseFormatSchema.parse(undefined);
      expect(result).toBe("markdown");
    });

    it("should reject invalid format", () => {
      expect(() => responseFormatSchema.parse("xml")).toThrow();
    });
  });

  describe("paginationSchema", () => {
    it("should validate with defaults", () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it("should validate custom values", () => {
      const result = paginationSchema.parse({ limit: 50, offset: 10 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it("should reject limit > 100", () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });

    it("should reject negative offset", () => {
      expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
    });
  });

  describe("hostSchema", () => {
    it("should validate alphanumeric with dashes", () => {
      const result = hostSchema.parse("tootie-server");
      expect(result).toBe("tootie-server");
    });

    it("should validate alphanumeric with underscores", () => {
      const result = hostSchema.parse("tootie_server");
      expect(result).toBe("tootie_server");
    });

    it("should reject invalid characters", () => {
      expect(() => hostSchema.parse("tootie.server")).toThrow();
    });

    it("should reject empty string", () => {
      expect(() => hostSchema.parse("")).toThrow();
    });
  });

  describe("containerIdSchema", () => {
    it("should validate non-empty string", () => {
      const result = containerIdSchema.parse("plex");
      expect(result).toBe("plex");
    });

    it("should reject empty string", () => {
      expect(() => containerIdSchema.parse("")).toThrow();
    });
  });

  describe("preprocessWithDiscriminator", () => {
    it("should inject action_subaction from action and subaction", () => {
      const result = preprocessWithDiscriminator({
        action: "container",
        subaction: "list"
      });
      expect(result).toEqual({
        action: "container",
        subaction: "list",
        action_subaction: "container:list"
      });
    });

    it("should return unchanged if action or subaction missing", () => {
      const result = preprocessWithDiscriminator({ action: "help" });
      expect(result).toEqual({ action: "help" });
    });

    it("should return unchanged if input is null", () => {
      const result = preprocessWithDiscriminator(null);
      expect(result).toBe(null);
    });

    it("should return unchanged if input is not an object", () => {
      const result = preprocessWithDiscriminator("string");
      expect(result).toBe("string");
    });
  });
});
