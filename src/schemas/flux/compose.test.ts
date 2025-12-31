// src/schemas/flux/compose.test.ts
import { describe, it, expect } from "vitest";
import {
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema
} from "./compose.js";

describe("Compose Schemas", () => {
  describe("composeListSchema", () => {
    it("should reject mismatched action", () => {
      expect(() =>
        composeListSchema.parse({
          action: "container",
          subaction: "list",
          host: "tootie"
        })
      ).toThrow();
    });

    it("should validate with host", () => {
      const result = composeListSchema.parse({
        action: "compose",
        subaction: "list",
        host: "tootie"
      });
      expect(result.action_subaction).toBe("compose:list");
    });

    it("should apply defaults for pagination", () => {
      const result = composeListSchema.parse({
        action: "compose",
        subaction: "list",
        host: "tootie"
      });
      expect(result.limit).toBe(20); // DEFAULT_LIMIT
      expect(result.offset).toBe(0);
    });

    it("should validate with name_filter", () => {
      const result = composeListSchema.parse({
        action: "compose",
        subaction: "list",
        host: "tootie",
        name_filter: "plex"
      });
      expect(result.name_filter).toBe("plex");
    });

    it("should accept compose:list without host parameter", () => {
      const input = {
        action: "compose",
        subaction: "list"
      };

      const result = composeListSchema.parse(input);
      expect(result.host).toBeUndefined();
    });
  });

  describe("composeStatusSchema", () => {
    it("should reject mismatched subaction", () => {
      expect(() =>
        composeStatusSchema.parse({
          action: "compose",
          subaction: "list",
          host: "tootie",
          project: "plex"
        })
      ).toThrow();
    });

    it("should require project", () => {
      expect(() =>
        composeStatusSchema.parse({
          action: "compose",
          subaction: "status"
        })
      ).toThrow();
    });

    it("should validate with host and project", () => {
      const result = composeStatusSchema.parse({
        action: "compose",
        subaction: "status",
        host: "tootie",
        project: "plex"
      });
      expect(result.action_subaction).toBe("compose:status");
    });

    it("should validate with service_filter", () => {
      const result = composeStatusSchema.parse({
        action: "compose",
        subaction: "status",
        host: "tootie",
        project: "plex",
        service_filter: "web"
      });
      expect(result.service_filter).toBe("web");
    });

    it("should accept compose:status without host parameter", () => {
      const input = {
        action: "compose",
        subaction: "status",
        project: "plex"
      };

      const result = composeStatusSchema.parse(input);
      expect(result.host).toBeUndefined();
    });
  });

  describe("composeUpSchema", () => {
    it("should reject mismatched action", () => {
      expect(() =>
        composeUpSchema.parse({
          action: "container",
          subaction: "up",
          host: "tootie",
          project: "plex"
        })
      ).toThrow();
    });

    it("should default detach to true", () => {
      const result = composeUpSchema.parse({
        action: "compose",
        subaction: "up",
        host: "tootie",
        project: "plex"
      });
      expect(result.detach).toBe(true);
    });

    it("should allow detach to be set to false", () => {
      const result = composeUpSchema.parse({
        action: "compose",
        subaction: "up",
        host: "tootie",
        project: "plex",
        detach: false
      });
      expect(result.detach).toBe(false);
    });

    it("should accept compose:up without host parameter", () => {
      const input = {
        action: "compose",
        subaction: "up",
        project: "plex"
      };

      const result = composeUpSchema.parse(input);
      expect(result.host).toBeUndefined();
    });
  });

  describe("composeDownSchema", () => {
    it("should reject mismatched subaction", () => {
      expect(() =>
        composeDownSchema.parse({
          action: "compose",
          subaction: "logs",
          host: "tootie",
          project: "plex"
        })
      ).toThrow();
    });

    it("should default remove_volumes to false", () => {
      const result = composeDownSchema.parse({
        action: "compose",
        subaction: "down",
        host: "tootie",
        project: "plex"
      });
      expect(result.remove_volumes).toBe(false);
    });

    it("should reject remove_volumes without force", () => {
      expect(() =>
        composeDownSchema.parse({
          action: "compose",
          subaction: "down",
          host: "tootie",
          project: "plex",
          remove_volumes: true
        })
      ).toThrow(/force=true is required/);
    });

    it("should allow remove_volumes with force=true", () => {
      const result = composeDownSchema.parse({
        action: "compose",
        subaction: "down",
        host: "tootie",
        project: "plex",
        remove_volumes: true,
        force: true
      });
      expect(result.remove_volumes).toBe(true);
      expect(result.force).toBe(true);
    });

    it("should default force to false", () => {
      const result = composeDownSchema.parse({
        action: "compose",
        subaction: "down",
        host: "tootie",
        project: "plex"
      });
      expect(result.force).toBe(false);
    });
  });

  describe("composeRestartSchema", () => {
    it("should reject mismatched action", () => {
      expect(() =>
        composeRestartSchema.parse({
          action: "container",
          subaction: "restart",
          host: "tootie",
          project: "plex"
        })
      ).toThrow();
    });

    it("should validate minimal restart", () => {
      const result = composeRestartSchema.parse({
        action: "compose",
        subaction: "restart",
        host: "tootie",
        project: "plex"
      });
      expect(result.action_subaction).toBe("compose:restart");
    });
  });

  describe("composeLogsSchema", () => {
    it("should reject mismatched subaction", () => {
      expect(() =>
        composeLogsSchema.parse({
          action: "compose",
          subaction: "pull",
          host: "tootie",
          project: "plex"
        })
      ).toThrow();
    });

    it("should allow grep patterns with brackets and quotes (JS filtering)", () => {
      // jsFilterSchema is less strict than shellGrepSchema since it's used
      // for JavaScript String.includes() filtering, not shell grep
      const result = composeLogsSchema.parse({
        action: "compose",
        subaction: "logs",
        host: "tootie",
        project: "plex",
        grep: "[ERROR] User 'admin'"
      });
      expect(result.grep).toBe("[ERROR] User 'admin'");
    });

    it("should reject grep patterns with control characters", () => {
      expect(() =>
        composeLogsSchema.parse({
          action: "compose",
          subaction: "logs",
          host: "tootie",
          project: "plex",
          grep: "error\x00injection"
        })
      ).toThrow(/control characters/);
    });

    it("should default lines to 50", () => {
      const result = composeLogsSchema.parse({
        action: "compose",
        subaction: "logs",
        host: "tootie",
        project: "plex"
      });
      expect(result.lines).toBe(50); // DEFAULT_LOG_LINES
    });

    it("should validate with service filter", () => {
      const result = composeLogsSchema.parse({
        action: "compose",
        subaction: "logs",
        host: "tootie",
        project: "plex",
        service: "web"
      });
      expect(result.service).toBe("web");
    });

    it("should validate with time filters and grep", () => {
      const result = composeLogsSchema.parse({
        action: "compose",
        subaction: "logs",
        host: "tootie",
        project: "plex",
        since: "1h",
        until: "30m",
        grep: "error"
      });
      expect(result.since).toBe("1h");
      expect(result.until).toBe("30m");
      expect(result.grep).toBe("error");
    });

    it("should enforce max log lines limit", () => {
      expect(() =>
        composeLogsSchema.parse({
          action: "compose",
          subaction: "logs",
          host: "tootie",
          project: "plex",
          lines: 999
        })
      ).toThrow();
    });
  });

  describe("composeBuildSchema", () => {
    it("should reject mismatched action", () => {
      expect(() =>
        composeBuildSchema.parse({
          action: "container",
          subaction: "build",
          host: "tootie",
          project: "app"
        })
      ).toThrow();
    });

    it("should default no_cache to false", () => {
      const result = composeBuildSchema.parse({
        action: "compose",
        subaction: "build",
        host: "tootie",
        project: "app"
      });
      expect(result.no_cache).toBe(false);
    });

    it("should validate with no_cache option", () => {
      const result = composeBuildSchema.parse({
        action: "compose",
        subaction: "build",
        host: "tootie",
        project: "app",
        service: "frontend",
        no_cache: true
      });
      expect(result.no_cache).toBe(true);
      expect(result.service).toBe("frontend");
    });
  });

  describe("composePullSchema", () => {
    it("should reject mismatched subaction", () => {
      expect(() =>
        composePullSchema.parse({
          action: "compose",
          subaction: "recreate",
          host: "tootie",
          project: "app"
        })
      ).toThrow();
    });

    it("should validate minimal pull", () => {
      const result = composePullSchema.parse({
        action: "compose",
        subaction: "pull",
        host: "tootie",
        project: "app"
      });
      expect(result.action_subaction).toBe("compose:pull");
    });

    it("should validate with service filter", () => {
      const result = composePullSchema.parse({
        action: "compose",
        subaction: "pull",
        host: "tootie",
        project: "app",
        service: "backend"
      });
      expect(result.service).toBe("backend");
    });
  });

  describe("composeRecreateSchema", () => {
    it("should reject mismatched action", () => {
      expect(() =>
        composeRecreateSchema.parse({
          action: "container",
          subaction: "recreate",
          host: "tootie",
          project: "app"
        })
      ).toThrow();
    });

    it("should validate minimal recreate", () => {
      const result = composeRecreateSchema.parse({
        action: "compose",
        subaction: "recreate",
        host: "tootie",
        project: "app"
      });
      expect(result.action_subaction).toBe("compose:recreate");
    });

    it("should validate with service filter", () => {
      const result = composeRecreateSchema.parse({
        action: "compose",
        subaction: "recreate",
        host: "tootie",
        project: "app",
        service: "api"
      });
      expect(result.service).toBe("api");
    });
  });
});
