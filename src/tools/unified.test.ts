import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logError } from "../utils/errors.js";
import { ServiceContainer } from "../services/container.js";

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
  formatBytes: (bytes: number) => `${bytes}B`
}));

import { loadHostConfigs } from "../services/docker.js";

describe("registerUnifiedTool", () => {
  let mockServer: McpServer;
  let registeredTools: Map<string, unknown>;
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    registeredTools = new Map();
    mockServer = {
      registerTool: vi.fn((name, config, handler) => {
        registeredTools.set(name, { config, handler });
      })
    } as unknown as McpServer;
    mockContainer = new ServiceContainer();
  });

  it("should register a single 'homelab' tool", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer, mockContainer);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
    expect(registeredTools.has("homelab")).toBe(true);
  });

  it("should register tool with correct title and description", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer, mockContainer);

    const tool = registeredTools.get("homelab") as {
      config: { title: string; description: string };
    };
    expect(tool.config.title).toBe("Homelab Manager");
    expect(tool.config.description).toContain("container");
    expect(tool.config.description).toContain("compose");
    expect(tool.config.description).toContain("host");
    expect(tool.config.description).toContain("docker");
    expect(tool.config.description).toContain("image");
    expect(tool.config.description).toContain("scout");
  });

  it("should have a handler function", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer, mockContainer);

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
    const mockContainer = new ServiceContainer();

    registerUnifiedTool(mockServer, mockContainer);

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

    // Create mock container with mocked docker service
    const mockContainer = new ServiceContainer();
    const mockDockerService = {
      listContainers: vi.fn().mockRejectedValueOnce(new Error("Connection timeout"))
    };
    mockContainer.setDockerService(mockDockerService as never);

    // Dynamically import to access collectStatsParallel through tool handler
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer, mockContainer);

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

describe("handleScoutAction", () => {
  let mockContainer: ServiceContainer;
  let mockHosts: Array<{ name: string; host: string; port: number }>;
  let mockFileService: {
    readFile: ReturnType<typeof vi.fn>;
    listDirectory: ReturnType<typeof vi.fn>;
    treeDirectory: ReturnType<typeof vi.fn>;
    executeCommand: ReturnType<typeof vi.fn>;
    findFiles: ReturnType<typeof vi.fn>;
    transferFile: ReturnType<typeof vi.fn>;
    diffFiles: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHosts = [
      { name: "tootie", host: "192.168.1.10", port: 2375 },
      { name: "web-server", host: "192.168.1.20", port: 2375 }
    ];
    vi.mocked(loadHostConfigs).mockReturnValue(mockHosts);

    mockContainer = new ServiceContainer();
    mockFileService = {
      readFile: vi.fn(),
      listDirectory: vi.fn(),
      treeDirectory: vi.fn(),
      executeCommand: vi.fn(),
      findFiles: vi.fn(),
      transferFile: vi.fn(),
      diffFiles: vi.fn()
    };
    mockContainer.setFileService(mockFileService as never);
  });

  describe("scout:read", () => {
    it("returns file content in markdown format", async () => {
      mockFileService.readFile.mockResolvedValue({
        content: "Hello, world!",
        size: 13,
        truncated: false
      });

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "read",
        host: "tootie",
        path: "/etc/hosts",
        response_format: "markdown"
      });

      expect(mockFileService.readFile).toHaveBeenCalledWith(
        mockHosts[0],
        "/etc/hosts",
        expect.any(Number)
      );
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("tootie:/etc/hosts");
      expect(result.content[0].text).toContain("Hello, world!");
    });

    it("returns file content in JSON format", async () => {
      mockFileService.readFile.mockResolvedValue({
        content: "test content",
        size: 12,
        truncated: false
      });

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "read",
        host: "tootie",
        path: "/test.txt",
        response_format: "json"
      });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent).toHaveProperty("content");
      expect(result.structuredContent).toHaveProperty("size");
    });

    it("errors on unknown host", async () => {
      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "read",
        host: "unknown-host",
        path: "/test.txt",
        response_format: "markdown"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("scout:list", () => {
    it("returns directory listing", async () => {
      mockFileService.listDirectory.mockResolvedValue("total 8\ndrwxr-xr-x 2 root root 4096");

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "list",
        host: "tootie",
        path: "/var/log",
        response_format: "markdown"
      });

      expect(mockFileService.listDirectory).toHaveBeenCalledWith(mockHosts[0], "/var/log", false);
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("tootie:/var/log");
    });
  });

  describe("scout:tree", () => {
    it("returns directory tree", async () => {
      mockFileService.treeDirectory.mockResolvedValue(".\n├── file1\n└── file2");

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "tree",
        host: "tootie",
        path: "/tmp",
        depth: 2,
        response_format: "markdown"
      });

      expect(mockFileService.treeDirectory).toHaveBeenCalledWith(mockHosts[0], "/tmp", 2);
      expect(result.isError).toBeUndefined();
    });
  });

  describe("scout:exec", () => {
    it("executes allowed command", async () => {
      mockFileService.executeCommand.mockResolvedValue({
        stdout: "command output",
        exitCode: 0
      });

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "exec",
        host: "tootie",
        path: "/tmp",
        command: "ls -la",
        response_format: "markdown"
      });

      expect(mockFileService.executeCommand).toHaveBeenCalledWith(
        mockHosts[0],
        "/tmp",
        "ls -la",
        expect.any(Number)
      );
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("command output");
    });
  });

  describe("scout:find", () => {
    it("finds files by pattern", async () => {
      mockFileService.findFiles.mockResolvedValue("/var/log/syslog\n/var/log/auth.log");

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "find",
        host: "tootie",
        path: "/var/log",
        pattern: "*.log",
        response_format: "markdown"
      });

      expect(mockFileService.findFiles).toHaveBeenCalledWith(
        mockHosts[0],
        "/var/log",
        "*.log",
        expect.any(Object)
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("scout:transfer", () => {
    it("transfers file between hosts", async () => {
      mockFileService.transferFile.mockResolvedValue({
        bytesTransferred: 1024
      });

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "transfer",
        source_host: "tootie",
        source_path: "/tmp/file.txt",
        target_host: "web-server",
        target_path: "/tmp/file.txt"
      });

      expect(mockFileService.transferFile).toHaveBeenCalledWith(
        mockHosts[0],
        "/tmp/file.txt",
        mockHosts[1],
        "/tmp/file.txt"
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("scout:diff", () => {
    it("diffs files across hosts", async () => {
      mockFileService.diffFiles.mockResolvedValue("--- file1\n+++ file2\n@@ differences @@");

      const { registerUnifiedTool } = await import("./unified.js");
      const mockServer = { registerTool: vi.fn() } as unknown as McpServer;
      registerUnifiedTool(mockServer, mockContainer);

      const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const result = await handler({
        action: "scout",
        subaction: "diff",
        host1: "tootie",
        path1: "/etc/hosts",
        host2: "web-server",
        path2: "/etc/hosts",
        response_format: "markdown"
      });

      expect(mockFileService.diffFiles).toHaveBeenCalledWith(
        mockHosts[0],
        "/etc/hosts",
        mockHosts[1],
        "/etc/hosts",
        expect.any(Number)
      );
      expect(result.isError).toBeUndefined();
    });
  });
});
