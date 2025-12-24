import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
