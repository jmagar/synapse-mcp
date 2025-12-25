import { describe, it, expect, vi, beforeEach } from "vitest";
import { composeLogs } from "./compose.js";

// Mock ssh-pool-exec module using vi.hoisted
const { mockExecuteSSHCommand } = vi.hoisted(() => {
  return {
    mockExecuteSSHCommand: vi.fn()
  };
});

vi.mock("./ssh-pool-exec.js", () => {
  return {
    executeSSHCommand: mockExecuteSSHCommand
  };
});

/**
 * Mock helper: Simulate successful SSH command execution
 */
const mockSSHSuccess = (stdout: string): void => {
  mockExecuteSSHCommand.mockResolvedValue(stdout);
};

/**
 * Mock helper: Simulate failed SSH command execution
 */
const mockSSHError = (errorMessage: string): void => {
  mockExecuteSSHCommand.mockRejectedValue(new Error(errorMessage));
};

/**
 * PHASE 7: Comprehensive tests for composeLogs()
 *
 * Tests verify the function that retrieves logs from Docker Compose services.
 * Function location: compose.ts lines 280-325
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes (function already implemented)
 * - REFACTOR: Improve test clarity if needed
 */
describe("composeLogs", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success paths", () => {
    // Step 69: composeLogs should call composeExec with "logs" action
    it("should call composeExec with logs action", async () => {
      mockSSHSuccess("log output");

      await composeLogs(mockHostConfig, "myproject");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        expect.stringContaining("docker compose -p myproject logs"),
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 71: composeLogs with tail option should pass --tail flag
    it("should pass --tail flag when tail option provided", async () => {
      mockSSHSuccess("last 100 logs");

      await composeLogs(mockHostConfig, "myproject", { tail: 100 });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--tail 100");
    });

    // Step 73: composeLogs with timestamps should pass -t flag
    it("should pass -t flag when timestamps option provided", async () => {
      mockSSHSuccess("timestamped logs");

      await composeLogs(mockHostConfig, "myproject", { timestamps: true });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("-t");
    });
  });

  describe("service targeting", () => {
    // Step 74: composeLogs with service name should target specific service
    it("should target specific service when service name provided", async () => {
      mockSSHSuccess("web service logs");

      await composeLogs(mockHostConfig, "myproject", { services: ["web"] });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("web");
      expect(command).toMatch(/logs.*web$/);
    });

    // Step 75: composeLogs with multiple services should pass all services
    it("should pass multiple services when array provided", async () => {
      mockSSHSuccess("multi-service logs");

      await composeLogs(mockHostConfig, "myproject", { services: ["web", "api", "worker"] });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("web");
      expect(command).toContain("api");
      expect(command).toContain("worker");
    });

    // Step 76: composeLogs without service should get all logs
    it("should get all logs when no service specified", async () => {
      mockSSHSuccess("all service logs");

      await composeLogs(mockHostConfig, "myproject");

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      // Should only contain project flag and logs command, no service names
      expect(command).toBe("docker compose -p myproject logs --no-color");
    });
  });

  describe("options combination", () => {
    // Step 77: composeLogs with multiple options should combine flags
    it("should combine multiple options correctly", async () => {
      mockSSHSuccess("combined options logs");

      await composeLogs(mockHostConfig, "myproject", {
        tail: 50,
        timestamps: true
      });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--tail 50");
      expect(command).toContain("-t");
    });

    // Step 78: composeLogs with since option should pass --since flag
    it("should pass --since flag when since option provided", async () => {
      mockSSHSuccess("logs since timestamp");

      await composeLogs(mockHostConfig, "myproject", { since: "2024-01-01" });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--since 2024-01-01");
    });

    // Step 79: composeLogs with until option should pass --until flag
    it("should pass --until flag when until option provided", async () => {
      mockSSHSuccess("logs until timestamp");

      await composeLogs(mockHostConfig, "myproject", { until: "2024-12-31" });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--until 2024-12-31");
    });

    // Step 80: composeLogs should construct correct command
    it("should construct correct command with all options", async () => {
      mockSSHSuccess("complete command logs");

      await composeLogs(mockHostConfig, "web-stack", {
        tail: 200,
        timestamps: true,
        since: "1h",
        until: "now",
        services: ["nginx", "app"]
      });

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p web-stack logs --no-color --tail 200 -t --since 1h --until now nginx app",
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 81: composeLogs should handle empty output
    it("should handle empty output", async () => {
      mockSSHSuccess("");

      const result = await composeLogs(mockHostConfig, "myproject");

      expect(result).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should include --no-color flag by default", async () => {
      mockSSHSuccess("logs");

      await composeLogs(mockHostConfig, "myproject");

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--no-color");
    });

    it("should validate service names", async () => {
      await expect(
        composeLogs(mockHostConfig, "myproject", { services: ["invalid service name"] })
      ).rejects.toThrow(/Invalid service name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should accept service names with hyphens and underscores", async () => {
      mockSSHSuccess("valid service logs");

      await composeLogs(mockHostConfig, "myproject", {
        services: ["web-service", "api_worker", "cache-v2_prod"]
      });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("web-service");
      expect(command).toContain("api_worker");
      expect(command).toContain("cache-v2_prod");
    });

    it("should handle tail value of 0", async () => {
      mockSSHSuccess("no logs");

      await composeLogs(mockHostConfig, "myproject", { tail: 0 });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--tail 0");
    });

    it("should not include tail flag when tail is undefined", async () => {
      mockSSHSuccess("all logs");

      await composeLogs(mockHostConfig, "myproject", {});

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).not.toContain("--tail");
    });

    it("should handle since with relative time format", async () => {
      mockSSHSuccess("recent logs");

      await composeLogs(mockHostConfig, "myproject", { since: "5m" });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--since 5m");
    });

    it("should handle until with ISO timestamp", async () => {
      mockSSHSuccess("historical logs");

      await composeLogs(mockHostConfig, "myproject", { until: "2024-01-15T10:30:00Z" });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      expect(command).toContain("--until 2024-01-15T10:30:00Z");
    });

    it("should pass correct project name validation", async () => {
      await expect(
        composeLogs(mockHostConfig, "invalid;project")
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        composeLogs(mockHostConfig, "")
      ).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should propagate SSH errors", async () => {
      mockSSHError("Connection failed");

      await expect(
        composeLogs(mockHostConfig, "myproject")
      ).rejects.toThrow(/Compose command failed.*Connection failed/);
    });

    it("should use 30 second timeout", async () => {
      mockSSHSuccess("logs");

      await composeLogs(mockHostConfig, "myproject");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { timeoutMs: 30000 }
      );
    });

    it("should handle empty services array", async () => {
      mockSSHSuccess("all logs");

      await composeLogs(mockHostConfig, "myproject", { services: [] });

      const command = mockExecuteSSHCommand.mock.calls[0][1];
      // Should not add any service names to command
      expect(command).toBe("docker compose -p myproject logs --no-color");
    });

    it("should order flags correctly in command", async () => {
      mockSSHSuccess("ordered logs");

      await composeLogs(mockHostConfig, "stack", {
        tail: 10,
        timestamps: true,
        services: ["web"]
      });

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p stack logs --no-color --tail 10 -t web",
        [],
        { timeoutMs: 30000 }
      );
    });
  });
});
