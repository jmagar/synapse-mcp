import { describe, it, expect } from "vitest";
import { ServiceContainer } from "./container.js";
import type { IDockerService, ISSHService, IComposeService } from "./interfaces.js";

describe("ServiceContainer", () => {
  it("creates default services lazily", () => {
    const container = new ServiceContainer();
    expect(container.getDockerService()).toBeDefined();
    expect(container.getSSHService()).toBeDefined();
    expect(container.getComposeService()).toBeDefined();
  });

  it("allows service overrides", () => {
    const container = new ServiceContainer();
    const docker = {} as IDockerService;
    const ssh = {} as ISSHService;
    const compose = {} as IComposeService;

    container.setDockerService(docker);
    container.setSSHService(ssh);
    container.setComposeService(compose);

    expect(container.getDockerService()).toBe(docker);
    expect(container.getSSHService()).toBe(ssh);
    expect(container.getComposeService()).toBe(compose);
  });
});
