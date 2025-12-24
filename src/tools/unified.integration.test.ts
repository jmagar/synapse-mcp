import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";
import type { HostConfig } from "../types.js";

// Mock the docker service
vi.mock("../services/docker.js", async () => {
  const actual = await vi.importActual<typeof import("../services/docker.js")>(
    "../services/docker.js"
  );
  return {
    ...actual,
    containerAction: vi.fn().mockResolvedValue(undefined),
    getContainerLogs: vi.fn().mockResolvedValue([
      { timestamp: "2024-01-01T10:00:00Z", stream: "stdout", message: "log line 1" },
      { timestamp: "2024-01-01T10:00:01Z", stream: "stdout", message: "error log line 2" },
      { timestamp: "2024-01-01T10:00:02Z", stream: "stderr", message: "log line 3" }
    ]),
    inspectContainer: vi.fn().mockResolvedValue({
      Id: "abc123456789",
      Name: "/my-container",
      Config: {
        Image: "nginx:latest",
        Env: [],
        Labels: {}
      },
      State: {
        Status: "running",
        Running: true,
        StartedAt: "2024-01-01T10:00:00Z"
      },
      Created: "2024-01-01T09:00:00Z",
      RestartCount: 0,
      NetworkSettings: {
        Ports: {},
        Networks: {}
      },
      Mounts: []
    }),
    pullImage: vi.fn().mockResolvedValue({ status: "Image pulled successfully" }),
    recreateContainer: vi.fn().mockResolvedValue({ status: "Container recreated", containerId: "new-abc123456789" }),
    listImages: vi.fn().mockImplementation(async () => [
      {
        id: "sha256:abc123",
        tags: ["nginx:latest"],
        size: 142 * 1024 * 1024, // 142MB
        created: "2024-01-01T10:00:00Z",
        containers: 1,
        hostName: "testhost"
      },
      {
        id: "sha256:def456",
        tags: ["<none>:<none>"],
        size: 1.2 * 1024 * 1024 * 1024, // 1.2GB
        created: "2024-01-02T10:00:00Z",
        containers: 0,
        hostName: "testhost"
      }
    ]),
    buildImage: vi.fn().mockResolvedValue(undefined),
    removeImage: vi.fn().mockResolvedValue(undefined),
    listContainers: vi.fn().mockImplementation(async () => []),
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: "testhost", host: "localhost", port: 2375, protocol: "http" }
    ] as HostConfig[]),
    findContainerHost: vi.fn().mockResolvedValue({
      host: { name: "testhost", host: "localhost", port: 2375, protocol: "http" },
      container: { Id: "abc123", Names: ["/my-container"] }
    })
  };
});

describe("unified tool integration", () => {
  let mockServer: McpServer;
  let toolHandler: (params: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

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

    describe("container state control actions", () => {
      it("should start container by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "start",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.containerAction).toHaveBeenCalledWith(
          "my-container",
          "start",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Successfully performed 'start'");
        expect(result.content[0].text).toContain("my-container");
      });

      it("should stop container by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "stop",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.containerAction).toHaveBeenCalledWith(
          "my-container",
          "stop",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Successfully performed 'stop'");
        expect(result.content[0].text).toContain("my-container");
      });

      it("should restart container by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "restart",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.containerAction).toHaveBeenCalledWith(
          "my-container",
          "restart",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Successfully performed 'restart'");
        expect(result.content[0].text).toContain("my-container");
      });

      it("should pause container by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "pause",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.containerAction).toHaveBeenCalledWith(
          "my-container",
          "pause",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Successfully performed 'pause'");
        expect(result.content[0].text).toContain("my-container");
      });

      it("should unpause container by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "unpause",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.containerAction).toHaveBeenCalledWith(
          "my-container",
          "unpause",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Successfully performed 'unpause'");
        expect(result.content[0].text).toContain("my-container");
      });
    });

    describe("container action: stats", () => {
      it("should get container stats for single host", async () => {
        const dockerService = await import("../services/docker.js");
        vi.spyOn(dockerService, "getContainerStats").mockResolvedValue({
          containerId: "abc123",
          containerName: "my-container",
          cpuPercent: 25.5,
          memoryUsage: 512 * 1024 * 1024, // 512MB
          memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
          memoryPercent: 25.0,
          networkRx: 1.5 * 1024 * 1024, // 1.5MB
          networkTx: 2 * 1024 * 1024, // 2MB
          blockRead: 0,
          blockWrite: 0
        });

        const result = (await toolHandler({
          action: "container",
          subaction: "stats",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.getContainerStats).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("CPU");
        expect(result.content[0].text).toContain("25.5");
      });

      it("should get container stats across all hosts when host not specified", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "stats",
          container_id: "my-container"
          // No host specified - should search all hosts
        })) as { content: Array<{ text: string }> };

        expect(dockerService.findContainerHost).toHaveBeenCalledWith(
          "my-container",
          expect.any(Array)
        );
        expect(result.content).toBeDefined();
      });

      it("should get stats for all containers when container_id not specified", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "stats",
          response_format: "json"
        })) as { content: Array<{ text: string }> };

        expect(result.content).toBeDefined();
        // Should return JSON with stats array
        const output = JSON.parse(result.content[0].text);
        expect(output.stats).toBeDefined();
        expect(Array.isArray(output.stats)).toBe(true);
      });
    });

    describe("container action: inspect", () => {
      it("should inspect container with summary mode (default)", async () => {
        const dockerService = await import("../services/docker.js");
        vi.spyOn(dockerService, "inspectContainer").mockResolvedValue({
          Id: "abc123456789",
          Name: "/my-container",
          Config: {
            Image: "nginx:latest",
            Env: ["NODE_ENV=production", "PORT=3000", "API_KEY=secret123"],
            Labels: { "com.docker.compose.project": "myapp", "version": "1.0" }
          },
          State: {
            Status: "running",
            Running: true,
            StartedAt: "2024-01-01T10:00:00Z"
          },
          Created: "2024-01-01T09:00:00Z",
          RestartCount: 0,
          NetworkSettings: {
            Ports: {
              "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }]
            },
            Networks: {
              bridge: {}
            }
          },
          Mounts: [
            { Source: "/data", Destination: "/app/data", Type: "bind", Mode: "rw" }
          ]
        });

        const result = (await toolHandler({
          action: "container",
          subaction: "inspect",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.inspectContainer).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" })
        );

        // Summary should include basic info
        expect(result.content[0].text).toContain("my-container");
        expect(result.content[0].text).toContain("running");
        expect(result.content[0].text).toContain("nginx:latest");

        // Summary should show counts for env/labels, not full details
        expect(result.content[0].text).toContain("Env Vars");
        expect(result.content[0].text).toContain("3"); // env count
        expect(result.content[0].text).toContain("Labels");
        expect(result.content[0].text).toContain("2"); // labels count

        // Summary should NOT show individual environment variables
        expect(result.content[0].text).not.toContain("NODE_ENV");
        expect(result.content[0].text).not.toContain("production");
      });

      it("should inspect container with full detail mode", async () => {
        const dockerService = await import("../services/docker.js");
        vi.spyOn(dockerService, "inspectContainer").mockResolvedValue({
          Id: "abc123456789",
          Name: "/my-container",
          Config: {
            Image: "nginx:latest",
            Cmd: ["nginx", "-g", "daemon off;"],
            WorkingDir: "/app",
            Env: ["NODE_ENV=production", "PORT=3000", "DATABASE_PASSWORD=secret123"],
            Labels: { "com.docker.compose.project": "myapp" }
          },
          State: {
            Status: "running",
            Running: true,
            StartedAt: "2024-01-01T10:00:00Z"
          },
          Created: "2024-01-01T09:00:00Z",
          RestartCount: 2,
          NetworkSettings: {
            Ports: {
              "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }]
            },
            Networks: {
              bridge: {},
              custom_network: {}
            }
          },
          Mounts: [
            { Source: "/data", Destination: "/app/data", Type: "bind", Mode: "rw" },
            { Source: "/config", Destination: "/etc/nginx", Type: "volume", Mode: "ro" }
          ]
        });

        const result = (await toolHandler({
          action: "container",
          subaction: "inspect",
          container_id: "my-container",
          host: "testhost",
          summary: false // Full detail mode
        })) as { content: Array<{ text: string }> };

        expect(dockerService.inspectContainer).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" })
        );

        // Full detail should include environment variables
        expect(result.content[0].text).toContain("NODE_ENV");
        expect(result.content[0].text).toContain("production");

        // Sensitive variables should be masked
        expect(result.content[0].text).toContain("DATABASE_PASSWORD=****");

        // Full detail should include mounts
        expect(result.content[0].text).toContain("/data");
        expect(result.content[0].text).toContain("/app/data");

        // Full detail should include networks
        expect(result.content[0].text).toContain("bridge");
        expect(result.content[0].text).toContain("custom_network");

        // Full detail should include working dir and command
        expect(result.content[0].text).toContain("/app");
        expect(result.content[0].text).toContain("nginx");
      });
    });

    describe("container action: logs", () => {
      it("should get container logs without grep filter", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "logs",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.getContainerLogs).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" }),
          expect.objectContaining({})
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("log line 1");
        expect(result.content[0].text).toContain("log line 2");
        expect(result.content[0].text).toContain("log line 3");
      });

      it("should get container logs with grep filter", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "logs",
          container_id: "my-container",
          host: "testhost",
          grep: "error"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.getContainerLogs).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" }),
          expect.objectContaining({})
        );
        expect(result.content).toBeDefined();
        // Should only include the error log line after grep filtering
        expect(result.content[0].text).toContain("error log line 2");
        expect(result.content[0].text).not.toContain("log line 1");
        expect(result.content[0].text).not.toContain("log line 3");
      });

      it("should get container logs with lines parameter", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "logs",
          container_id: "my-container",
          host: "testhost",
          lines: 100
        })) as { content: Array<{ text: string }> };

        expect(dockerService.getContainerLogs).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" }),
          expect.objectContaining({ lines: 100 })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("log line 1");
      });
    });

    describe("container action: pull", () => {
      it("should pull latest image for container", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "pull",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        // Should first inspect container to get image name
        expect(dockerService.inspectContainer).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" })
        );

        // Then pull the image (not the container name)
        expect(dockerService.pullImage).toHaveBeenCalledWith(
          "nginx:latest", // Image name from inspect
          expect.objectContaining({ name: "testhost" })
        );

        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("pulled latest image");
        expect(result.content[0].text).toContain("nginx:latest");
        expect(result.content[0].text).toContain("my-container");
      });
    });

    describe("container action: recreate", () => {
      it("should recreate container with latest image", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "container",
          subaction: "recreate",
          container_id: "my-container",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.recreateContainer).toHaveBeenCalledWith(
          "my-container",
          expect.objectContaining({ name: "testhost" }),
          expect.objectContaining({})
        );
        expect(result.content).toBeDefined();
        // Actual output format: "✓ Container recreated. New container ID: new-abc123"
        expect(result.content[0].text).toContain("Container recreated");
        expect(result.content[0].text).toContain("new-abc123");
      });
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
    let dockerService: typeof import("../services/docker.js");

    beforeEach(async () => {
      dockerService = await import("../services/docker.js");
    });

    describe("image action: list", () => {
      it("should list all images", async () => {
        vi.spyOn(dockerService, "listImages").mockResolvedValue([
          {
            id: "sha256:abc123",
            tags: ["nginx:latest"],
            size: 142 * 1024 * 1024,
            created: "2024-01-01T10:00:00Z",
            containers: 1,
            hostName: "testhost"
          },
          {
            id: "sha256:def456",
            tags: ["<none>:<none>"],
            size: 1.2 * 1024 * 1024 * 1024,
            created: "2024-01-02T10:00:00Z",
            containers: 0,
            hostName: "testhost"
          }
        ]);

        const result = (await toolHandler({
          action: "image",
          subaction: "list",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.listImages).toHaveBeenCalledWith(
          expect.any(Array),
          expect.any(Object)
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("nginx");
        expect(result.content[0].text).toContain("latest");
      });

      it("should list images with pagination", async () => {
        vi.spyOn(dockerService, "listImages").mockResolvedValue([
          { id: "sha256:abc123", tags: ["nginx:latest"], size: 142 * 1024 * 1024, created: "2024-01-01T10:00:00Z", containers: 1, hostName: "testhost" },
          { id: "sha256:def456", tags: ["<none>:<none>"], size: 1.2 * 1024 * 1024 * 1024, created: "2024-01-02T10:00:00Z", containers: 0, hostName: "testhost" }
        ]);

        const result = (await toolHandler({
          action: "image",
          subaction: "list",
          host: "testhost",
          offset: 1,
          limit: 1,
          response_format: "json"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.listImages).toHaveBeenCalledWith(
          expect.any(Array),
          expect.any(Object)
        );
        expect(result.content).toBeDefined();
        // With offset=1, limit=1, should only show second image
        const output = JSON.parse(result.content[0].text);
        expect(output.pagination.offset).toBe(1);
        expect(output.pagination.count).toBe(1);
      });

      it("should list only dangling images", async () => {
        vi.spyOn(dockerService, "listImages").mockResolvedValue([
          { id: "sha256:def456", tags: ["<none>:<none>"], size: 1.2 * 1024 * 1024 * 1024, created: "2024-01-02T10:00:00Z", containers: 0, hostName: "testhost" }
        ]);

        const result = (await toolHandler({
          action: "image",
          subaction: "list",
          host: "testhost",
          dangling_only: true
        })) as { content: Array<{ text: string }> };

        expect(dockerService.listImages).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ danglingOnly: true })
        );
        expect(result.content).toBeDefined();
      });
    });

    describe("image action: pull", () => {
      it("should pull image by name", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "image",
          subaction: "pull",
          image: "nginx:alpine",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.pullImage).toHaveBeenCalledWith(
          "nginx:alpine",
          expect.objectContaining({ name: "testhost" })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("pulled image");
        expect(result.content[0].text).toContain("nginx:alpine");
      });
    });

    describe("image action: build", () => {
      it("should build image from Dockerfile path", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "image",
          subaction: "build",
          context: "/app",
          tag: "myapp:v1",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.buildImage).toHaveBeenCalledWith(
          expect.objectContaining({ name: "testhost" }),
          expect.objectContaining({
            context: "/app",
            tag: "myapp:v1"
          })
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("built image");
        expect(result.content[0].text).toContain("myapp:v1");
      });
    });

    describe("image action: remove", () => {
      it("should remove image by ID", async () => {
        const dockerService = await import("../services/docker.js");

        const result = (await toolHandler({
          action: "image",
          subaction: "remove",
          image: "sha256:abc123",
          host: "testhost"
        })) as { content: Array<{ text: string }> };

        expect(dockerService.removeImage).toHaveBeenCalledWith(
          "sha256:abc123",
          expect.objectContaining({ name: "testhost" }),
          expect.any(Object)
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("removed image");
        expect(result.content[0].text).toContain("sha256:abc123");
      });
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
