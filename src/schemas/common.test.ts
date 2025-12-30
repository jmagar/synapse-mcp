// src/schemas/common.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  projectSchema,
  containerIdSchema,
  preprocessWithDiscriminator,
  execUserSchema,
  execWorkdirSchema,
  shellGrepSchema,
  jsFilterSchema
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

    it("should use a Zod enum schema (not native enum)", () => {
      expect(responseFormatSchema._def.innerType).toBeInstanceOf(z.ZodEnum);
      expect(responseFormatSchema._def.innerType.constructor.name).toBe("ZodEnum");
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

  describe("projectSchema", () => {
    it("should validate alphanumeric with dashes", () => {
      const result = projectSchema.parse("my-project");
      expect(result).toBe("my-project");
    });

    it("should validate alphanumeric with underscores", () => {
      const result = projectSchema.parse("my_project");
      expect(result).toBe("my_project");
    });

    it("should reject invalid characters", () => {
      expect(() => projectSchema.parse("bad.project")).toThrow();
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

    it("should return unchanged if subaction missing", () => {
      const result = preprocessWithDiscriminator({ action: "help" });
      expect(result).toEqual({ action: "help" });
    });

    it("should return unchanged if action missing", () => {
      const result = preprocessWithDiscriminator({ subaction: "list" });
      expect(result).toEqual({ subaction: "list" });
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

  describe("execUserSchema", () => {
    describe("valid formats", () => {
      it("should accept simple username", () => {
        expect(execUserSchema.parse("root")).toBe("root");
      });

      it("should accept username with underscore", () => {
        expect(execUserSchema.parse("app_user")).toBe("app_user");
      });

      it("should accept username with hyphen", () => {
        expect(execUserSchema.parse("www-data")).toBe("www-data");
      });

      it("should accept numeric uid", () => {
        expect(execUserSchema.parse("1000")).toBe("1000");
      });

      it("should accept uid:gid format", () => {
        expect(execUserSchema.parse("1000:1000")).toBe("1000:1000");
      });

      it("should accept username:groupname format", () => {
        expect(execUserSchema.parse("www-data:www-data")).toBe("www-data:www-data");
      });

      it("should accept mixed username:gid format", () => {
        expect(execUserSchema.parse("app_user:1000")).toBe("app_user:1000");
      });
    });

    describe("invalid formats", () => {
      it("should reject empty string", () => {
        expect(() => execUserSchema.parse("")).toThrow();
      });

      it("should reject user starting with hyphen", () => {
        expect(() => execUserSchema.parse("-malicious")).toThrow();
      });

      it("should reject shell metacharacters (semicolon)", () => {
        expect(() => execUserSchema.parse("root; rm -rf /")).toThrow();
      });

      it("should reject shell metacharacters (backticks)", () => {
        expect(() => execUserSchema.parse("`whoami`")).toThrow();
      });

      it("should reject newlines", () => {
        expect(() => execUserSchema.parse("root\nmalicious")).toThrow();
      });

      it("should reject spaces", () => {
        expect(() => execUserSchema.parse("bad user")).toThrow();
      });

      it("should reject dollar signs", () => {
        expect(() => execUserSchema.parse("$USER")).toThrow();
      });

      it("should reject multiple colons", () => {
        expect(() => execUserSchema.parse("user:group:extra")).toThrow();
      });
    });
  });

  describe("execWorkdirSchema", () => {
    describe("valid paths", () => {
      it("should accept root path", () => {
        expect(execWorkdirSchema.parse("/")).toBe("/");
      });

      it("should accept simple absolute path", () => {
        expect(execWorkdirSchema.parse("/app")).toBe("/app");
      });

      it("should accept nested absolute path", () => {
        expect(execWorkdirSchema.parse("/var/lib/app/data")).toBe("/var/lib/app/data");
      });

      it("should accept path with dashes", () => {
        expect(execWorkdirSchema.parse("/app-data")).toBe("/app-data");
      });

      it("should accept path with underscores", () => {
        expect(execWorkdirSchema.parse("/app_data")).toBe("/app_data");
      });

      it("should accept path with dots", () => {
        expect(execWorkdirSchema.parse("/app/v1.0")).toBe("/app/v1.0");
      });
    });

    describe("invalid paths", () => {
      it("should reject empty string", () => {
        expect(() => execWorkdirSchema.parse("")).toThrow();
      });

      it("should reject relative path", () => {
        expect(() => execWorkdirSchema.parse("app/data")).toThrow();
      });

      it("should reject directory traversal (..)", () => {
        expect(() => execWorkdirSchema.parse("/app/../etc")).toThrow();
      });

      it("should reject shell metacharacters (semicolon)", () => {
        expect(() => execWorkdirSchema.parse("/app; rm -rf /")).toThrow();
      });

      it("should reject shell metacharacters (backticks)", () => {
        expect(() => execWorkdirSchema.parse("/app/`whoami`")).toThrow();
      });

      it("should reject dollar signs (variable expansion)", () => {
        expect(() => execWorkdirSchema.parse("/app/$HOME")).toThrow();
      });

      it("should reject newlines", () => {
        expect(() => execWorkdirSchema.parse("/app\n/etc")).toThrow();
      });

      it("should reject spaces", () => {
        expect(() => execWorkdirSchema.parse("/app data")).toThrow();
      });

      it("should reject pipes", () => {
        expect(() => execWorkdirSchema.parse("/app|cat")).toThrow();
      });
    });
  });

  describe("shellGrepSchema", () => {
    describe("valid patterns", () => {
      it("should accept simple text", () => {
        expect(shellGrepSchema.parse("error")).toBe("error");
      });

      it("should accept alphanumeric with spaces", () => {
        expect(shellGrepSchema.parse("connection failed")).toBe("connection failed");
      });

      it("should accept hyphenated patterns", () => {
        expect(shellGrepSchema.parse("some-error-message")).toBe("some-error-message");
      });

      it("should accept patterns with dots", () => {
        expect(shellGrepSchema.parse("192.168.1.1")).toBe("192.168.1.1");
      });
    });

    describe("invalid patterns (shell metacharacters)", () => {
      it("should reject semicolons", () => {
        expect(() => shellGrepSchema.parse("error; rm -rf /")).toThrow(/shell metacharacters/);
      });

      it("should reject pipes", () => {
        expect(() => shellGrepSchema.parse("error | grep foo")).toThrow(/shell metacharacters/);
      });

      it("should reject backticks", () => {
        expect(() => shellGrepSchema.parse("`whoami`")).toThrow(/shell metacharacters/);
      });

      it("should reject dollar signs", () => {
        expect(() => shellGrepSchema.parse("$HOME")).toThrow(/shell metacharacters/);
      });

      it("should reject brackets", () => {
        expect(() => shellGrepSchema.parse("[ERROR]")).toThrow(/shell metacharacters/);
      });

      it("should reject single quotes", () => {
        expect(() => shellGrepSchema.parse("User 'admin'")).toThrow(/shell metacharacters/);
      });

      it("should reject double quotes", () => {
        expect(() => shellGrepSchema.parse('User "admin"')).toThrow(/shell metacharacters/);
      });

      it("should reject parentheses", () => {
        expect(() => shellGrepSchema.parse("(deprecated)")).toThrow(/shell metacharacters/);
      });

      it("should reject empty string", () => {
        expect(() => shellGrepSchema.parse("")).toThrow();
      });

      it("should reject patterns exceeding 200 chars", () => {
        expect(() => shellGrepSchema.parse("a".repeat(201))).toThrow();
      });
    });
  });

  describe("jsFilterSchema", () => {
    describe("valid patterns", () => {
      it("should accept simple text", () => {
        expect(jsFilterSchema.parse("error")).toBe("error");
      });

      it("should accept patterns with brackets", () => {
        expect(jsFilterSchema.parse("[ERROR]")).toBe("[ERROR]");
      });

      it("should accept patterns with single quotes", () => {
        expect(jsFilterSchema.parse("User 'admin'")).toBe("User 'admin'");
      });

      it("should accept patterns with double quotes", () => {
        expect(jsFilterSchema.parse('User "admin"')).toBe('User "admin"');
      });

      it("should accept patterns with parentheses", () => {
        expect(jsFilterSchema.parse("(deprecated)")).toBe("(deprecated)");
      });

      it("should accept patterns with shell operators (safe for JS)", () => {
        // These are dangerous for shell but safe for String.includes()
        expect(jsFilterSchema.parse("error | warning")).toBe("error | warning");
        expect(jsFilterSchema.parse("cmd; next")).toBe("cmd; next");
      });

      it("should accept complex log patterns", () => {
        const pattern = "[2024-01-15T10:30:00Z] ERROR (auth): User 'admin' failed";
        expect(jsFilterSchema.parse(pattern)).toBe(pattern);
      });

      it("should accept patterns up to 500 chars", () => {
        expect(jsFilterSchema.parse("a".repeat(500))).toBe("a".repeat(500));
      });
    });

    describe("invalid patterns", () => {
      it("should reject empty string", () => {
        expect(() => jsFilterSchema.parse("")).toThrow();
      });

      it("should reject null bytes", () => {
        expect(() => jsFilterSchema.parse("error\x00injection")).toThrow(/control characters/);
      });

      it("should reject newlines", () => {
        expect(() => jsFilterSchema.parse("line1\nline2")).toThrow(/control characters/);
      });

      it("should reject carriage returns", () => {
        expect(() => jsFilterSchema.parse("line1\rline2")).toThrow(/control characters/);
      });

      it("should reject tabs", () => {
        expect(() => jsFilterSchema.parse("col1\tcol2")).toThrow(/control characters/);
      });

      it("should reject patterns exceeding 500 chars", () => {
        expect(() => jsFilterSchema.parse("a".repeat(501))).toThrow();
      });
    });
  });
});
