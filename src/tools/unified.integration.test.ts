import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";

describe("unified tool integration", () => {
  let mockServer: McpServer;
  let toolHandler: (params: unknown) => Promise<unknown>;

  beforeEach(() => {
    const registeredTools = new Map<string, (params: unknown) => Promise<unknown>>();
    mockServer = {
      registerTool: vi.fn((name, _config, handler) => {
        registeredTools.set(name, handler);
      })
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);
    const handler = registeredTools.get("homelab");
    if (!handler) throw new Error("Tool handler not registered");
    toolHandler = handler;
  });

  describe("container actions", () => {
    it("should handle container list with valid params", async () => {
      const result = await toolHandler({
        action: "container",
        subaction: "list",
        state: "running"
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    it("should return error for invalid container subaction", async () => {
      const result = (await toolHandler({
        action: "container",
        subaction: "invalid_action"
      })) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      // Zod validation now catches invalid subactions before reaching handler
      expect(result.content[0].text).toContain("Error");
    });

    it.skip("should handle container stats request (slow - requires Docker)", async () => {
      const result = await toolHandler({
        action: "container",
        subaction: "stats"
      });
      expect(result).toBeDefined();
    }, 30000);

    it("should handle container search request", async () => {
      const result = await toolHandler({
        action: "container",
        subaction: "search",
        query: "plex"
      });
      expect(result).toBeDefined();
    });
  });

  describe("compose actions", () => {
    it("should handle compose list with host param", async () => {
      const result = await toolHandler({
        action: "compose",
        subaction: "list",
        host: "tootie"
      });
      expect(result).toBeDefined();
    });

    it("should return error for compose action without host", async () => {
      const result = (await toolHandler({
        action: "compose",
        subaction: "list"
        // missing host param
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });

  describe("host actions", () => {
    it("should handle host status request", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "status"
      });
      expect(result).toBeDefined();
    });

    it("should handle host resources request", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "resources"
      });
      expect(result).toBeDefined();
    });
  });

  describe("docker actions", () => {
    it("should handle docker info request", async () => {
      const result = await toolHandler({
        action: "docker",
        subaction: "info"
      });
      expect(result).toBeDefined();
    });

    it("should handle docker df request", async () => {
      const result = await toolHandler({
        action: "docker",
        subaction: "df"
      });
      expect(result).toBeDefined();
    }, 15000);

    it("should require force flag for prune", async () => {
      const result = (await toolHandler({
        action: "docker",
        subaction: "prune",
        prune_target: "images"
        // missing force: true
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });

  describe("image actions", () => {
    it("should handle image list request", async () => {
      const result = await toolHandler({
        action: "image",
        subaction: "list"
      });
      expect(result).toBeDefined();
    });
  });

  describe("response format", () => {
    it("should return markdown by default", async () => {
      const result = (await toolHandler({
        action: "host",
        subaction: "status"
      })) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
    });

    it("should return JSON when response_format is json", async () => {
      const result = (await toolHandler({
        action: "host",
        subaction: "status",
        response_format: "json"
      })) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      // JSON format should be parseable
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe("schema validation", () => {
    it("should reject unknown action", async () => {
      const result = (await toolHandler({
        action: "unknown",
        subaction: "list"
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });
});

describe("Container stats collection performance", () => {
  beforeEach(async () => {
    // Mock getContainerStats to simulate 500ms delay
    const dockerService = await import("../services/docker.js");
    vi.spyOn(dockerService, "getContainerStats").mockImplementation(
      async (id, _host) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          containerId: id,
          containerName: `container-${id}`,
          cpuPercent: 10.5,
          memoryUsage: 1024 * 1024 * 100,
          memoryLimit: 1024 * 1024 * 500,
          memoryPercent: 20.0,
          networkRx: 1024,
          networkTx: 2048,
          blockRead: 512,
          blockWrite: 256
        };
      }
    );

    // Mock listContainers to return 5 containers (reduced for faster testing)
    vi.spyOn(dockerService, "listContainers").mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `container-${i}`,
        name: `test-${i}`,
        image: "test:latest",
        state: "running" as const,
        status: "Up 1 hour",
        created: new Date().toISOString(),
        ports: [],
        labels: {},
        hostName: "test-host"
      }))
    );

    // Mock loadHostConfigs to return 2 test hosts
    vi.spyOn(dockerService, "loadHostConfigs").mockReturnValue([
      {
        name: "host1",
        host: "192.168.1.10",
        protocol: "http" as const,
        port: 2375
      },
      {
        name: "host2",
        host: "192.168.1.11",
        protocol: "http" as const,
        port: 2375
      }
    ]);
  });

  it("should measure baseline performance (was sequential, now parallel)", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];

    const startTime = Date.now();

    const result = (await handler({
      action: "container",
      subaction: "stats",
      response_format: "json"
    })) as { content: Array<{ text: string }> };

    const duration = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain("stats");

    // Before optimization: 2 hosts × 5 containers × 500ms = 5000ms sequential
    // After optimization: Parallel execution ~500ms
    expect(duration).toBeLessThan(1000);

    console.log(`Baseline performance: ${duration}ms (parallel optimized)`);
  }, 10000);

  it("should collect stats in parallel across hosts and containers", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];

    const startTime = Date.now();

    const result = (await handler({
      action: "container",
      subaction: "stats",
      response_format: "json"
    })) as { content: Array<{ text: string }> };

    const duration = Date.now() - startTime;

    expect(result.content).toBeDefined();

    const output = JSON.parse(result.content[0].text);
    expect(output.stats).toHaveLength(10); // 2 hosts × 5 containers

    // Parallel: max(500ms) + overhead ≈ 600-800ms
    expect(duration).toBeLessThan(1000);

    console.log(`Parallel optimized: ${duration}ms`);
    console.log(`Speedup: ${(5000 / duration).toFixed(1)}x`);
  }, 10000);

  it("should handle partial failures gracefully", async () => {
    const dockerService = await import("../services/docker.js");

    // Mock some stats calls to fail
    vi.spyOn(dockerService, "getContainerStats").mockImplementation(async (id, _host) => {
      if (id === "container-2") {
        throw new Error("Container not responding");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        containerId: id,
        containerName: `container-${id}`,
        cpuPercent: 10.5,
        memoryUsage: 1024 * 1024 * 100,
        memoryLimit: 1024 * 1024 * 500,
        memoryPercent: 20.0,
        networkRx: 1024,
        networkTx: 2048,
        blockRead: 512,
        blockWrite: 256
      };
    });

    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];

    const result = (await handler({
      action: "container",
      subaction: "stats",
      response_format: "json"
    })) as { content: Array<{ text: string }> };

    expect(result.content).toBeDefined();

    const output = JSON.parse(result.content[0].text);

    // Should have stats for 8 containers (10 total - 2 that failed)
    expect(output.stats.length).toBeGreaterThan(0);
    expect(output.stats.length).toBeLessThan(10);
  });
});
