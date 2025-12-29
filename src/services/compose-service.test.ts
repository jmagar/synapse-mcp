import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("ComposeService", () => {
  let ssh: ISSHService;
  let service: ComposeService;

  beforeEach(() => {
    ssh = {
      executeSSHCommand: vi.fn().mockResolvedValue(""),
      getHostResources: vi.fn().mockResolvedValue({}) as never
    };
    service = new ComposeService(ssh);
  });

  it("executes compose commands via SSH service", async () => {
    const host: HostConfig = { name: "test", host: "127.0.0.1", protocol: "http" };
    await service.composeExec(host, "proj", "ps");
    expect(ssh.executeSSHCommand).toHaveBeenCalled();
  });
});
