import { describe, it, expect, beforeEach, vi } from "vitest";
import { DockerService } from "./docker.js";
import type { HostConfig } from "../types.js";
import type Docker from "dockerode";

describe("DockerService", () => {
  let service: DockerService;
  let mockFactory: (config: HostConfig) => Docker;

  beforeEach(() => {
    // Mock includes only essential methods for initial DI tests
    // Additional methods will be mocked as needed when testing specific operations
    mockFactory = vi.fn(
      () =>
        ({
          listContainers: vi.fn().mockResolvedValue([]),
          ping: vi.fn().mockResolvedValue(true),
          info: vi.fn().mockResolvedValue({}),
          version: vi.fn().mockResolvedValue({})
        }) as unknown as Docker
    );

    service = new DockerService(mockFactory);
  });

  it("creates a service instance", () => {
    expect(service).toBeInstanceOf(DockerService);
  });

  it("uses injected factory to create Docker clients", () => {
    const host: HostConfig = {
      name: "test",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };
    const client = service.getDockerClient(host);
    expect(mockFactory).toHaveBeenCalledWith(host);
    expect(client).toBeDefined();
  });

  it("caches Docker clients per host", () => {
    const host: HostConfig = {
      name: "test",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };
    const client1 = service.getDockerClient(host);
    const client2 = service.getDockerClient(host);
    expect(mockFactory).toHaveBeenCalledTimes(1);
    expect(client1).toBe(client2);
  });

  it("clears cached Docker clients", () => {
    const host: HostConfig = {
      name: "test",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };
    service.getDockerClient(host);
    service.clearClients();
    service.getDockerClient(host);
    expect(mockFactory).toHaveBeenCalledTimes(2);
  });

  it("maintains separate cache entries per host", () => {
    const host1: HostConfig = {
      name: "host1",
      host: "server1",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };
    const host2: HostConfig = {
      name: "host2",
      host: "server2",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };
    const client1 = service.getDockerClient(host1);
    const client2 = service.getDockerClient(host2);
    expect(mockFactory).toHaveBeenCalledTimes(2);
    expect(client1).not.toBe(client2);
  });
});
