import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logError } from "../utils/errors.js";

vi.mock("../utils/errors.js", () => ({
  logError: vi.fn(),
  HostOperationError: class HostOperationError extends Error {
    constructor(
      message: string,
      public hostName: string,
      public operation: string,
      public cause?: unknown
    ) {
      super(message);
      this.name = "HostOperationError";
    }
  }
}));

vi.mock("../services/docker.js", () => ({
  loadHostConfigs: vi.fn(),
  listContainers: vi.fn(),
  containerAction: vi.fn(),
  getContainerLogs: vi.fn(),
  getContainerStats: vi.fn(),
  getHostStatus: vi.fn(),
  inspectContainer: vi.fn(),
  findContainerHost: vi.fn(),
  getDockerInfo: vi.fn(),
  getDockerDiskUsage: vi.fn(),
  pruneDocker: vi.fn(),
  listImages: vi.fn(),
  pullImage: vi.fn(),
  recreateContainer: vi.fn(),
  removeImage: vi.fn(),
  buildImage: vi.fn()
}));

vi.mock("../services/ssh.js", () => ({
  getHostResources: vi.fn()
}));

import { loadHostConfigs, listContainers } from "../services/docker.js";

describe("registerUnifiedTool", () => {
  let mockServer: McpServer;
  let registeredTools: Map<string, unknown>;

  beforeEach(() => {
    registeredTools = new Map();
    mockServer = {
      registerTool: vi.fn((name, config, handler) => {
        registeredTools.set(name, { config, handler });
      })
    } as unknown as McpServer;
  });

  it("should register a single 'homelab' tool", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
    expect(registeredTools.has("homelab")).toBe(true);
  });

  it("should register tool with correct title and description", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    const tool = registeredTools.get("homelab") as {
      config: { title: string; description: string };
    };
    expect(tool.config.title).toBe("Homelab Manager");
    expect(tool.config.description).toContain("container");
    expect(tool.config.description).toContain("compose");
    expect(tool.config.description).toContain("host");
    expect(tool.config.description).toContain("docker");
    expect(tool.config.description).toContain("image");
  });

  it("should have a handler function", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    const tool = registeredTools.get("homelab") as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});

describe("routeAction", () => {
  it("should throw error for unknown action", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const result = await handler({ action: "invalid", subaction: "list" });

    expect(result.isError).toBe(true);
    // Zod validation now catches invalid actions before reaching routeAction
    expect(result.content[0].text).toContain("Error");
  });
});

describe("collectStatsParallel error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should log errors when stats collection fails", async () => {
    // Setup mock hosts
    const mockHosts = [{ name: "test-host", host: "localhost", port: 2375 }];
    vi.mocked(loadHostConfigs).mockReturnValue(mockHosts);

    // Mock listContainers to throw an error to trigger catch block
    vi.mocked(listContainers).mockRejectedValueOnce(new Error("Connection timeout"));

    // Dynamically import to access collectStatsParallel through tool handler
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];

    // Trigger stats collection without container_id to invoke collectStatsParallel
    await handler({
      action: "container",
      subaction: "stats",
      response_format: "markdown",
      offset: 0,
      limit: 10
    });

    // Verify logError was called with HostOperationError
    expect(logError).toHaveBeenCalled();
    const errorCall = vi.mocked(logError).mock.calls[0];
    expect(errorCall[0]).toBeInstanceOf(Error);
    expect(errorCall[0]).toHaveProperty("hostName", "test-host");
    expect(errorCall[0]).toHaveProperty("operation", "collectStatsParallel");

    // Verify metadata was included
    expect(errorCall[1]).toHaveProperty("metadata");
    expect(errorCall[1]?.metadata).toHaveProperty("maxContainersPerHost");
  });
});
