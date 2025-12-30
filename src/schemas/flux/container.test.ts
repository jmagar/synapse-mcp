// src/schemas/flux/container.test.ts
import { describe, it, expect } from "vitest";
import {
  containerListSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerExecSchema,
  containerTopSchema
} from "./container.js";

describe("Container Schemas", () => {
  describe("containerListSchema", () => {
    it("should validate minimal input", () => {
      const result = containerListSchema.parse({
        action: "container",
        subaction: "list"
      });
      expect(result.action_subaction).toBe("container:list");
      expect(result.state).toBe("all");
      expect(result.limit).toBe(20); // Uses DEFAULT_LIMIT from constants.ts
    });

    it("should validate with filters", () => {
      const result = containerListSchema.parse({
        action: "container",
        subaction: "list",
        state: "running",
        name_filter: "plex",
        host: "tootie"
      });
      expect(result.state).toBe("running");
      expect(result.name_filter).toBe("plex");
    });
  });

  describe("containerResumeSchema", () => {
    it("should use resume instead of unpause", () => {
      const result = containerResumeSchema.parse({
        action: "container",
        subaction: "resume",
        container_id: "plex"
      });
      expect(result.action_subaction).toBe("container:resume");
      expect(result.subaction).toBe("resume");
    });
  });

  describe("containerLogsSchema", () => {
    it("should validate with time filters", () => {
      const result = containerLogsSchema.parse({
        action: "container",
        subaction: "logs",
        container_id: "nginx",
        since: "1h",
        until: "30m",
        grep: "error",
        stream: "stderr"
      });
      expect(result.since).toBe("1h");
      expect(result.stream).toBe("stderr");
    });

    it("should allow grep patterns with brackets and quotes (JS filtering)", () => {
      // jsFilterSchema is less strict than shellGrepSchema since it's used
      // for JavaScript String.includes() filtering, not shell grep
      const result = containerLogsSchema.parse({
        action: "container",
        subaction: "logs",
        container_id: "nginx",
        grep: "[ERROR] Connection 'failed'"
      });
      expect(result.grep).toBe("[ERROR] Connection 'failed'");
    });

    it("should reject grep patterns with control characters", () => {
      expect(() =>
        containerLogsSchema.parse({
          action: "container",
          subaction: "logs",
          container_id: "nginx",
          grep: "error\x00injection"
        })
      ).toThrow(/control characters/);
    });
  });

  describe("containerExecSchema", () => {
    it("should validate exec with workdir", () => {
      const result = containerExecSchema.parse({
        action: "container",
        subaction: "exec",
        container_id: "app",
        command: "ls -la",
        user: "root",
        workdir: "/app"
      });
      expect(result.workdir).toBe("/app");
    });

    describe("user parameter validation", () => {
      it("should accept simple username", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "whoami",
          user: "root"
        });
        expect(result.user).toBe("root");
      });

      it("should accept numeric uid", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "whoami",
          user: "1000"
        });
        expect(result.user).toBe("1000");
      });

      it("should accept uid:gid format", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "whoami",
          user: "1000:1000"
        });
        expect(result.user).toBe("1000:1000");
      });

      it("should accept username:groupname format", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "whoami",
          user: "www-data:www-data"
        });
        expect(result.user).toBe("www-data:www-data");
      });

      it("should accept username with underscore", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "whoami",
          user: "app_user"
        });
        expect(result.user).toBe("app_user");
      });

      it("should reject user with shell metacharacters", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "whoami",
            user: "root; rm -rf /"
          })
        ).toThrow();
      });

      it("should reject user with backticks", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "whoami",
            user: "`whoami`"
          })
        ).toThrow();
      });

      it("should reject user with newlines", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "whoami",
            user: "root\nmalicious"
          })
        ).toThrow();
      });

      it("should reject user starting with hyphen", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "whoami",
            user: "-malicious"
          })
        ).toThrow();
      });
    });

    describe("workdir parameter validation", () => {
      it("should accept absolute path", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "ls",
          workdir: "/app"
        });
        expect(result.workdir).toBe("/app");
      });

      it("should accept nested absolute path", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "ls",
          workdir: "/var/lib/app/data"
        });
        expect(result.workdir).toBe("/var/lib/app/data");
      });

      it("should accept root path", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "ls",
          workdir: "/"
        });
        expect(result.workdir).toBe("/");
      });

      it("should accept path with dots and dashes", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "ls",
          workdir: "/app-data/v1.0"
        });
        expect(result.workdir).toBe("/app-data/v1.0");
      });

      it("should accept path with underscores", () => {
        const result = containerExecSchema.parse({
          action: "container",
          subaction: "exec",
          container_id: "app",
          command: "ls",
          workdir: "/app_data/my_files"
        });
        expect(result.workdir).toBe("/app_data/my_files");
      });

      it("should reject relative path", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "app/data"
          })
        ).toThrow();
      });

      it("should reject path with shell metacharacters", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "/app; rm -rf /"
          })
        ).toThrow();
      });

      it("should reject path with backticks", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "/app/`whoami`"
          })
        ).toThrow();
      });

      it("should reject path with dollar sign", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "/app/$HOME"
          })
        ).toThrow();
      });

      it("should reject path with newlines", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "/app\n/etc"
          })
        ).toThrow();
      });

      it("should reject path with double dots (directory traversal)", () => {
        expect(() =>
          containerExecSchema.parse({
            action: "container",
            subaction: "exec",
            container_id: "app",
            command: "ls",
            workdir: "/app/../etc"
          })
        ).toThrow();
      });
    });
  });

  describe("containerTopSchema", () => {
    it("should validate top command", () => {
      const result = containerTopSchema.parse({
        action: "container",
        subaction: "top",
        container_id: "plex"
      });
      expect(result.action_subaction).toBe("container:top");
    });
  });
});
