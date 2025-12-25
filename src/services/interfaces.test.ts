import { describe, it, expect } from "vitest";
import type {
  IDockerService,
  ISSHService,
  IComposeService,
  ISSHConnectionPool,
  IServiceFactory
} from "./interfaces.js";

describe("Service Interfaces", () => {
  it("should define IDockerService interface", () => {
    const mockService: IDockerService = {
      getDockerClient: () => ({}) as never,
      listContainers: async () => [],
      containerAction: async () => {},
      getContainerLogs: async () => [],
      getContainerStats: async () => ({}) as never,
      findContainerHost: async () => null,
      getHostStatus: async () => [],
      listImages: async () => [],
      inspectContainer: async () => ({}) as never,
      getDockerInfo: async () => ({}) as never,
      getDockerDiskUsage: async () => ({}) as never,
      pruneDocker: async () => [],
      pullImage: async () => ({ status: "ok" }),
      recreateContainer: async () => ({ status: "ok", containerId: "id" }),
      removeImage: async () => ({ status: "ok" }),
      buildImage: async () => ({ status: "ok" })
    };

    expect(mockService).toBeDefined();
  });

  it("should define ISSHService interface", () => {
    const mockService: ISSHService = {
      executeSSHCommand: async () => "",
      getHostResources: async () => ({}) as never
    };

    expect(mockService).toBeDefined();
  });

  it("should define IComposeService interface", () => {
    const mockService: IComposeService = {
      composeExec: async () => "",
      listComposeProjects: async () => [],
      getComposeStatus: async () => ({}) as never,
      composeUp: async () => "",
      composeDown: async () => "",
      composeRestart: async () => "",
      composeLogs: async () => "",
      composeBuild: async () => "",
      composePull: async () => "",
      composeRecreate: async () => ""
    };

    expect(mockService).toBeDefined();
  });

  it("should define ISSHConnectionPool interface", () => {
    const mockPool: ISSHConnectionPool = {
      getConnection: async () => ({}) as never,
      releaseConnection: async () => {},
      closeConnection: async () => {},
      closeAll: async () => {},
      getStats: () => ({}) as never
    };

    expect(mockPool).toBeDefined();
  });

  it("should define IServiceFactory interface", () => {
    const mockFactory: IServiceFactory = {
      createDockerService: () => ({}) as never,
      createSSHConnectionPool: () => ({}) as never,
      createSSHService: () => ({}) as never,
      createComposeService: () => ({}) as never
    };

    expect(mockFactory).toBeDefined();
  });
});
