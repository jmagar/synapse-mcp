import { describe, it, expect, beforeEach, vi } from "vitest";
import { SSHService } from "./ssh-service.js";
import type { HostConfig } from "../types.js";
import type { ISSHConnectionPool } from "./interfaces.js";
import type { NodeSSH } from "node-ssh";

describe("SSHService", () => {
  let pool: ISSHConnectionPool;
  let service: SSHService;
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

    pool = {
      getConnection: vi.fn(async () => ({
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "ok", stderr: "" })
      })) as never,
      releaseConnection: vi.fn(async () => {}),
      closeConnection: vi.fn(async () => {}),
      closeAll: vi.fn(async () => {}),
      getStats: vi.fn(() => ({}) as never)
    };

    service = new SSHService(pool);
  });

  describe("executeSSHCommand", () => {
    it("should execute commands via pool", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "test output", stderr: "" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      const result = await service.executeSSHCommand(testHost, "echo", ["test"]);
      expect(result).toBe("test output");
      expect(pool.getConnection).toHaveBeenCalledWith(testHost);
      expect(pool.releaseConnection).toHaveBeenCalledWith(testHost, mockConnection);
    });

    it("should handle commands without arguments", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "simple", stderr: "" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      const result = await service.executeSSHCommand(testHost, "pwd");
      expect(result).toBe("simple");
      expect(mockConnection.execCommand).toHaveBeenCalledWith("pwd");
    });

    it("should trim whitespace from output", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "  trimmed  \n", stderr: "" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      const result = await service.executeSSHCommand(testHost, "echo", ["test"]);
      expect(result).toBe("trimmed");
    });

    it("should throw error on non-zero exit code", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({
          code: 1,
          stdout: "",
          stderr: "Command failed"
        })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      await expect(service.executeSSHCommand(testHost, "false")).rejects.toThrow(
        /SSH command failed/
      );
    });

    it("should release connection even on failure", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "error" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      try {
        await service.executeSSHCommand(testHost, "false");
      } catch {
        // Expected to fail
      }

      expect(pool.releaseConnection).toHaveBeenCalledWith(testHost, mockConnection);
    });

    it("should respect timeout option", async () => {
      const mockConnection = {
        execCommand: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ code: 0, stdout: "slow", stderr: "" }), 5000);
            })
        )
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      await expect(
        service.executeSSHCommand(testHost, "sleep", ["10"], { timeoutMs: 100 })
      ).rejects.toThrow(/timeout/);
    });
  });

  describe("getHostResources", () => {
    it("should retrieve and parse host resources", async () => {
      const mockOutput = `test-hostname
---
up 2 days
---
1.5 2.0 2.5
---
4
---
25.5
---
16000 8000 4000
---
/dev/sda1 / 100G 50G 45G 53%`;

      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: mockOutput, stderr: "" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      const result = await service.getHostResources(testHost);

      expect(result.hostname).toBe("test-hostname");
      expect(result.uptime).toBe("up 2 days");
      expect(result.loadAverage).toEqual([1.5, 2.0, 2.5]);
      expect(result.cpu.cores).toBe(4);
      expect(result.cpu.usagePercent).toBe(25.5);
      expect(result.memory.totalMB).toBe(16000);
      expect(result.memory.usedMB).toBe(8000);
      expect(result.memory.freeMB).toBe(4000);
      expect(result.disk.length).toBe(1);
      expect(result.disk[0].filesystem).toBe("/dev/sda1");
      expect(result.disk[0].mount).toBe("/");
      expect(result.disk[0].usagePercent).toBe(53);
    });

    it("should handle missing or invalid sections gracefully", async () => {
      const mockOutput = `hostname
---
up
---
---
---
---
---
`;

      const mockConnection = {
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: mockOutput, stderr: "" })
      } as unknown as NodeSSH;

      (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

      const result = await service.getHostResources(testHost);

      expect(result.hostname).toBe("hostname");
      expect(result.loadAverage).toEqual([0, 0, 0]);
      expect(result.cpu.cores).toBe(1);
      expect(result.memory.totalMB).toBe(0);
      expect(result.disk).toEqual([]);
    });
  });
});
