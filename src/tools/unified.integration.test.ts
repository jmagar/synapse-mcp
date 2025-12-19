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
    toolHandler = registeredTools.get("homelab")!;
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
      const result = await toolHandler({
        action: "container",
        subaction: "invalid_action"
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown");
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
      const result = await toolHandler({
        action: "compose",
        subaction: "list"
        // missing host param
      }) as { isError: boolean };

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
      const result = await toolHandler({
        action: "docker",
        subaction: "prune",
        prune_target: "images"
        // missing force: true
      }) as { isError: boolean };

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
      const result = await toolHandler({
        action: "host",
        subaction: "status"
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
    });

    it("should return JSON when response_format is json", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "status",
        response_format: "json"
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      // JSON format should be parseable
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe("schema validation", () => {
    it("should reject unknown action", async () => {
      const result = await toolHandler({
        action: "unknown",
        subaction: "list"
      }) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });
});
