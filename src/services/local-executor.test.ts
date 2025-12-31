import { describe, it, expect } from "vitest";
import { LocalExecutorService } from "./local-executor.js";

describe("LocalExecutorService", () => {
  const service = new LocalExecutorService();

  describe("executeLocalCommand", () => {
    describe("successful command execution", () => {
      it("executes simple command: echo hello", async () => {
        const result = await service.executeLocalCommand("echo", ["hello"]);
        expect(result).toBe("hello");
      });

      it("executes ls command with args", async () => {
        const result = await service.executeLocalCommand("ls", ["-la", "/"]);
        expect(result).toContain("bin");
        expect(result).toContain("etc");
      });

      it("executes uptime command", async () => {
        const result = await service.executeLocalCommand("uptime");
        expect(result).toContain("up");
      });

      it("executes command with cwd option", async () => {
        const result = await service.executeLocalCommand("pwd", [], { cwd: "/tmp" });
        expect(result).toBe("/tmp");
      });

      it("trims whitespace from output", async () => {
        const result = await service.executeLocalCommand("echo", ["  spaced  "]);
        expect(result).toBe("spaced");
      });
    });

    describe("command timeout", () => {
      it("times out long-running command", async () => {
        await expect(
          service.executeLocalCommand("sleep", ["10"], { timeoutMs: 100 })
        ).rejects.toThrow(/timeout|killed/i);
      });

      it("uses default timeout of 30s", async () => {
        // This should complete before default timeout
        const result = await service.executeLocalCommand("echo", ["test"]);
        expect(result).toBe("test");
      });

      it("respects custom timeout", async () => {
        const start = Date.now();
        await expect(
          service.executeLocalCommand("sleep", ["5"], { timeoutMs: 500 })
        ).rejects.toThrow();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000); // Should timeout quickly
      });
    });

    describe("error handling", () => {
      it("throws when command not found", async () => {
        await expect(
          service.executeLocalCommand("nonexistentcommand123456")
        ).rejects.toThrow(/ENOENT|not found/i);
      });

      it("throws when command fails with non-zero exit code", async () => {
        await expect(
          service.executeLocalCommand("ls", ["/nonexistent/path/12345"])
        ).rejects.toThrow();
      });

      it("includes command in error message", async () => {
        try {
          await service.executeLocalCommand("ls", ["/nonexistent/path/12345"]);
          throw new Error("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const err = error as Error;
          expect(err.message).toContain("ls");
        }
      });

      it("handles empty command gracefully", async () => {
        await expect(service.executeLocalCommand("")).rejects.toThrow();
      });
    });

    describe("security", () => {
      it("does not execute shell commands (no pipe)", async () => {
        // execFile doesn't interpret shell metacharacters
        const result = await service.executeLocalCommand("echo", ["test", "|", "cat"]);
        expect(result).toBe("test | cat"); // Literal output, not piped
      });

      it("does not execute shell commands (no semicolon)", async () => {
        const result = await service.executeLocalCommand("echo", ["test;", "ls"]);
        expect(result).toBe("test; ls"); // Literal output
      });

      it("does not execute shell commands (no background)", async () => {
        const result = await service.executeLocalCommand("echo", ["test", "&"]);
        expect(result).toBe("test &"); // Literal output
      });
    });

    describe("docker compose commands", () => {
      it("can execute docker compose ls", async () => {
        // This should work even if no compose projects exist
        try {
          const result = await service.executeLocalCommand("docker", [
            "compose",
            "ls",
            "--format",
            "json"
          ]);
          // Should return valid JSON (empty array if no projects)
          expect(() => JSON.parse(result || "[]")).not.toThrow();
        } catch (error) {
          // If docker is not installed, skip
          if (error instanceof Error && error.message.includes("ENOENT")) {
            console.error("Docker not available, skipping test");
          } else {
            throw error;
          }
        }
      });
    });

    describe("systemctl commands", () => {
      // Note: This test requires systemd to be available on the system
      // Skip on non-systemd systems (containers, WSL without systemd, etc.)
      it("can execute systemctl list-units", async () => {
        try {
          const result = await service.executeLocalCommand("systemctl", [
            "list-units",
            "--type=service",
            "--no-pager"
          ]);
          expect(result).toBeTruthy();
          expect(result.length).toBeGreaterThan(0);
        } catch (error) {
          // Skip if systemd is not available (container, WSL, etc.)
          if (
            error instanceof Error &&
            (error.message.includes("ENOENT") ||
              error.message.includes("not been booted with systemd") ||
              error.message.includes("Failed to connect to bus"))
          ) {
            console.error("systemctl not available or systemd not running, skipping test");
            return;
          }
          throw error;
        }
      });
    });
  });
});
