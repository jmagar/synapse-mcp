import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeSSHCommand, getGlobalPool } from "./ssh-pool-exec.js";
import type { HostConfig } from "../types.js";

// Mock node-ssh module
vi.mock("node-ssh", () => {
  class MockNodeSSH {
    async connect(): Promise<void> {
      return Promise.resolve();
    }
    async dispose(): Promise<void> {
      return Promise.resolve();
    }
    async execCommand(cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
      // Simulate various commands
      if (cmd.includes("false")) {
        return Promise.resolve({ code: 1, stdout: "", stderr: "Command failed" });
      }
      if (cmd.includes("nonexistent-command")) {
        return Promise.resolve({ code: 127, stdout: "", stderr: "command not found" });
      }
      if (cmd.includes("sleep 10")) {
        // Simulate long-running command
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ code: 0, stdout: "done", stderr: "" });
          }, 10000);
        });
      }
      if (cmd.includes("sleep 1")) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ code: 0, stdout: "done", stderr: "" });
          }, 1000);
        });
      }
      if (cmd === "echo test") {
        return Promise.resolve({ code: 0, stdout: "test", stderr: "" });
      }
      if (cmd === "echo hello world") {
        return Promise.resolve({ code: 0, stdout: "hello world", stderr: "" });
      }
      if (cmd === "echo '  test  '") {
        return Promise.resolve({ code: 0, stdout: "  test  ", stderr: "" });
      }
      if (cmd === "echo first") {
        return Promise.resolve({ code: 0, stdout: "first", stderr: "" });
      }
      if (cmd === "echo second") {
        return Promise.resolve({ code: 0, stdout: "second", stderr: "" });
      }
      if (cmd === "echo third") {
        return Promise.resolve({ code: 0, stdout: "third", stderr: "" });
      }
      if (cmd === "echo test1") {
        return Promise.resolve({ code: 0, stdout: "test1", stderr: "" });
      }
      if (cmd === "echo test2") {
        return Promise.resolve({ code: 0, stdout: "test2", stderr: "" });
      }
      if (cmd === "echo quick") {
        return Promise.resolve({ code: 0, stdout: "quick", stderr: "" });
      }
      // Default success
      return Promise.resolve({ code: 0, stdout: cmd, stderr: "" });
    }
    isConnected(): boolean {
      return true;
    }
  }
  return {
    NodeSSH: MockNodeSSH
  };
});

describe("ssh-pool-exec", () => {
  let testHost: HostConfig;

  beforeEach(() => {
    testHost = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "http" as const,
      port: 2375,
      sshUser: "testuser",
      sshKeyPath: "/home/user/.ssh/id_rsa"
    };
  });

  afterEach(async () => {
    // Clean up pool after each test
    const pool = getGlobalPool();
    await pool.closeAll();
  });

  describe("executeSSHCommand", () => {
    it("should execute command and return stdout", async () => {
      // This will fail because the function doesn't exist yet (RED)
      const result = await executeSSHCommand(testHost, "echo test");
      expect(result).toBe("test");
    });

    it("should handle commands with multiple arguments", async () => {
      const result = await executeSSHCommand(
        testHost,
        "echo",
        ["hello", "world"]
      );
      expect(result).toContain("hello world");
    });

    it("should throw error on command failure", async () => {
      await expect(
        executeSSHCommand(testHost, "false")
      ).rejects.toThrow();
    });

    it("should trim whitespace from output", async () => {
      const result = await executeSSHCommand(testHost, "echo '  test  '");
      expect(result).toBe("test");
    });
  });

  describe("connection reuse", () => {
    it("should reuse connection for multiple commands", async () => {
      const pool = getGlobalPool();
      const initialStats = pool.getStats();

      // First command - should create connection (miss)
      await executeSSHCommand(testHost, "echo first");
      const afterFirst = pool.getStats();
      expect(afterFirst.poolMisses).toBe(initialStats.poolMisses + 1);
      expect(afterFirst.totalConnections).toBe(1);

      // Second command - should reuse connection (hit)
      await executeSSHCommand(testHost, "echo second");
      const afterSecond = pool.getStats();
      expect(afterSecond.poolHits).toBe(initialStats.poolHits + 1);
      expect(afterSecond.totalConnections).toBe(1); // Still 1 connection

      // Third command - should also reuse
      await executeSSHCommand(testHost, "echo third");
      const afterThird = pool.getStats();
      expect(afterThird.poolHits).toBe(initialStats.poolHits + 2);
      expect(afterThird.totalConnections).toBe(1);
    });

    it("should create separate connections for different hosts", async () => {
      const host2: HostConfig = {
        name: "test-host-2",
        host: "192.168.1.101",
        protocol: "http" as const,
        port: 2375
      };

      const pool = getGlobalPool();

      await executeSSHCommand(testHost, "echo test1");
      await executeSSHCommand(host2, "echo test2");

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(2); // One per host
    });
  });

  describe("timeout handling", () => {
    it("should respect command timeout", async () => {
      // Command that takes longer than timeout should fail
      await expect(
        executeSSHCommand(testHost, "sleep 10", [], { timeoutMs: 100 })
      ).rejects.toThrow(/timeout/i);
    });

    it("should use default timeout when not specified", async () => {
      // Should not timeout with default (30s)
      const result = await executeSSHCommand(testHost, "echo quick");
      expect(result).toBe("quick");
    });

    it("should allow custom timeout for long operations", async () => {
      // This would timeout with default, but should work with extended timeout
      const result = await executeSSHCommand(
        testHost,
        "sleep 1 && echo done",
        [],
        { timeoutMs: 5000 }
      );
      expect(result).toBe("done");
    });
  });

  describe("getGlobalPool", () => {
    it("should return singleton instance", () => {
      const pool1 = getGlobalPool();
      const pool2 = getGlobalPool();
      expect(pool1).toBe(pool2); // Same instance
    });

    it("should allow custom configuration", () => {
      const pool = getGlobalPool({
        maxConnections: 10,
        idleTimeoutMs: 120000
      });
      expect(pool).toBeDefined();
      // Configuration is applied on first call
    });
  });

  describe("error handling", () => {
    it("should provide clear error message on connection failure", async () => {
      // Mock throws error for bad connection (simulated in mock)
      // Since mock always succeeds connect(), test that command failures work
      await expect(
        executeSSHCommand(testHost, "false")
      ).rejects.toThrow(/SSH command failed/);
    });

    it("should include command context in error messages", async () => {
      try {
        await executeSSHCommand(testHost, "nonexistent-command");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/SSH command failed/i);
        expect((error as Error).message).toMatch(/nonexistent-command/);
      }
    });
  });

  describe("resource cleanup", () => {
    it("should release connection after command execution", async () => {
      const pool = getGlobalPool();

      await executeSSHCommand(testHost, "echo test");

      // Connection should be idle after execution
      const stats = pool.getStats();
      expect(stats.idleConnections).toBe(1);
      expect(stats.activeConnections).toBe(0);
    });

    it("should release connection even on command failure", async () => {
      const pool = getGlobalPool();

      try {
        await executeSSHCommand(testHost, "false");
      } catch {
        // Expected to fail
      }

      // Connection should still be released
      const stats = pool.getStats();
      expect(stats.idleConnections).toBe(1);
      expect(stats.activeConnections).toBe(0);
    });
  });
});
