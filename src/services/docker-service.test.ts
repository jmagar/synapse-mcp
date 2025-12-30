import { describe, it, expect, beforeEach, vi } from "vitest";
import { DockerService } from "./docker.js";
import type { HostConfig } from "../types.js";
import type Docker from "dockerode";
import { PassThrough } from "stream";
import { DEFAULT_EXEC_MAX_BUFFER } from "../constants.js";

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

  it("lists networks for a host", async () => {
    const host: HostConfig = {
      name: "host1",
      host: "server1",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const mockClient = {
      listNetworks: vi.fn().mockResolvedValue([
        {
          Id: "net-1",
          Name: "bridge",
          Driver: "bridge",
          Scope: "local",
          Created: "2024-01-01T00:00:00Z",
          Internal: false,
          Attachable: false,
          Ingress: false
        }
      ])
    } as unknown as Docker;

    mockFactory = vi.fn(() => mockClient);
    service = new DockerService(mockFactory);

    const result = await service.listNetworks([host]);

    expect(mockClient.listNetworks).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "net-1",
      name: "bridge",
      driver: "bridge",
      scope: "local",
      hostName: "host1"
    });
  });

  it("lists volumes for a host", async () => {
    const host: HostConfig = {
      name: "host1",
      host: "server1",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const mockClient = {
      listVolumes: vi.fn().mockResolvedValue({
        Volumes: [
          {
            Name: "plex_data",
            Driver: "local",
            Scope: "local",
            Mountpoint: "/var/lib/docker/volumes/plex_data/_data",
            CreatedAt: "2024-01-01T00:00:00Z",
            Labels: { app: "plex" }
          }
        ]
      })
    } as unknown as Docker;

    mockFactory = vi.fn(() => mockClient);
    service = new DockerService(mockFactory);

    const result = await service.listVolumes([host]);

    expect(mockClient.listVolumes).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "plex_data",
      driver: "local",
      scope: "local",
      hostName: "host1",
      createdAt: "2024-01-01T00:00:00Z",
      labels: { app: "plex" }
    });
  });

  it("handles volumes with missing or invalid CreatedAt", async () => {
    const host: HostConfig = {
      name: "host1",
      host: "server1",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const mockClient = {
      listVolumes: vi.fn().mockResolvedValue({
        Volumes: [
          {
            Name: "volume_no_created",
            Driver: "local",
            Scope: "local",
            Mountpoint: "/var/lib/docker/volumes/volume_no_created/_data"
            // CreatedAt missing
          },
          {
            Name: "volume_number_created",
            Driver: "local",
            Scope: "local",
            Mountpoint: "/var/lib/docker/volumes/volume_number_created/_data",
            CreatedAt: 12345 // Invalid type (number instead of string)
          },
          {
            Name: "volume_valid_created",
            Driver: "local",
            Scope: "local",
            Mountpoint: "/var/lib/docker/volumes/volume_valid_created/_data",
            CreatedAt: "2024-01-15T12:00:00Z"
          }
        ]
      })
    } as unknown as Docker;

    mockFactory = vi.fn(() => mockClient);
    service = new DockerService(mockFactory);

    const result = await service.listVolumes([host]);

    expect(result).toHaveLength(3);

    // Volume without CreatedAt should have undefined
    expect(result[0].createdAt).toBeUndefined();

    // Volume with non-string CreatedAt should have undefined
    expect(result[1].createdAt).toBeUndefined();

    // Volume with valid CreatedAt should preserve it
    expect(result[2].createdAt).toBe("2024-01-15T12:00:00Z");
  });

  describe("execContainer", () => {
    const testHost: HostConfig = {
      name: "test",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    it("executes a command and returns output", async () => {
      const mockStream = new PassThrough();
      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };
      const mockModem = {
        demuxStream: vi.fn((stream, stdout, stderr) => {
          stdout.write("hello world");
          stdout.end();
          stderr.end();
          stream.emit("end");
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      const result = await service.execContainer("container-123", testHost, {
        command: "hostname"
      });

      expect(result.stdout).toBe("hello world");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });

    it("times out after specified duration", async () => {
      vi.useFakeTimers();
      try {
        const mockStream = new PassThrough();
        const mockExec = {
          start: vi.fn().mockResolvedValue(mockStream),
          inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
        };
        const mockContainer = {
          exec: vi.fn().mockResolvedValue(mockExec)
        };
        const mockModem = {
          demuxStream: vi.fn(() => {
            // Never emit 'end' - simulates a hanging command
          })
        };
        const mockClient = {
          getContainer: vi.fn().mockReturnValue(mockContainer),
          modem: mockModem
        } as unknown as Docker;

        mockFactory = vi.fn(() => mockClient);
        service = new DockerService(mockFactory);

        const execPromise = service.execContainer("container-123", testHost, {
          command: "tail /var/log/syslog",
          timeout: 5000
        });

        // Set up the expectation first, then advance timers
        // This ensures the rejection is handled before vitest sees it as unhandled
        const expectation = expect(execPromise).rejects.toThrow(/timeout/i);

        // Flush all timers to ensure the timeout fires even if scheduled late
        await vi.runAllTimersAsync();

        await expectation;
      } finally {
        vi.useRealTimers();
      }
    });

    it("uses default timeout when not specified", async () => {
      vi.useFakeTimers();

      const mockStream = new PassThrough();
      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };
      const mockModem = {
        demuxStream: vi.fn(() => {
          // Never emit 'end' - simulates a hanging command
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      const execPromise = service.execContainer("container-123", testHost, {
        command: "tail /var/log/syslog"
      });

      // Set up the expectation first, then advance timers
      const expectation = expect(execPromise).rejects.toThrow(/timeout/i);

      // Flush all timers to ensure the timeout fires even if scheduled late
      await vi.runAllTimersAsync();

      await expectation;

      vi.useRealTimers();
    });

    it("rejects when stdout buffer exceeds limit", async () => {
      const mockStream = new PassThrough();
      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };

      const mockModem = {
        demuxStream: vi.fn((_stream, stdout, _stderr) => {
          // Write data exceeding the buffer limit immediately after demux is called
          setImmediate(() => {
            const chunkSize = 1024 * 1024; // 1MB
            const chunks = Math.ceil(DEFAULT_EXEC_MAX_BUFFER / chunkSize) + 2;

            for (let i = 0; i < chunks; i++) {
              stdout.write(Buffer.alloc(chunkSize, "x"));
            }
          });
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      await expect(
        service.execContainer("container-123", testHost, {
          command: "cat /dev/zero"
        })
      ).rejects.toThrow(/buffer.*limit|exceeded/i);
    });

    it("rejects when stderr buffer exceeds limit", async () => {
      const mockStream = new PassThrough();
      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };

      const mockModem = {
        demuxStream: vi.fn((_stream, _stdout, stderr) => {
          // Write data exceeding the buffer limit immediately after demux is called
          setImmediate(() => {
            const chunkSize = 1024 * 1024; // 1MB
            const chunks = Math.ceil(DEFAULT_EXEC_MAX_BUFFER / chunkSize) + 2;

            for (let i = 0; i < chunks; i++) {
              stderr.write(Buffer.alloc(chunkSize, "x"));
            }
          });
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      await expect(
        service.execContainer("container-123", testHost, {
          command: "cat /dev/zero"
        })
      ).rejects.toThrow(/buffer.*limit|exceeded/i);
    });

    it("cleans up streams on timeout", async () => {
      vi.useFakeTimers();

      const mockStream = new PassThrough();
      const destroySpy = vi.spyOn(mockStream, "destroy");

      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };
      const mockModem = {
        demuxStream: vi.fn(() => {
          // Never emit 'end' - simulates a hanging command
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      const execPromise = service.execContainer("container-123", testHost, {
        command: "tail /var/log/syslog",
        timeout: 5000
      });

      // Set up the expectation first to handle the rejection
      const expectation = expect(execPromise).rejects.toThrow(/timeout/i);

      await vi.runAllTimersAsync();

      await expectation;

      expect(destroySpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("cleans up streams on buffer overflow", async () => {
      const mockStream = new PassThrough();
      const destroySpy = vi.spyOn(mockStream, "destroy");

      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };

      const mockModem = {
        demuxStream: vi.fn((_stream, stdout, _stderr) => {
          // Write data exceeding the buffer limit immediately after demux is called
          setImmediate(() => {
            const chunkSize = 1024 * 1024;
            const chunks = Math.ceil(DEFAULT_EXEC_MAX_BUFFER / chunkSize) + 2;

            for (let i = 0; i < chunks; i++) {
              stdout.write(Buffer.alloc(chunkSize, "x"));
            }
          });
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      await expect(
        service.execContainer("container-123", testHost, {
          command: "cat /dev/zero"
        })
      ).rejects.toThrow(/buffer.*limit|exceeded/i);

      expect(destroySpy).toHaveBeenCalled();
    });

    it("cleans up streams on stream error", async () => {
      const mockStream = new PassThrough();
      const destroySpy = vi.spyOn(mockStream, "destroy");

      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 })
      };
      const mockContainer = {
        exec: vi.fn().mockResolvedValue(mockExec)
      };

      const mockModem = {
        demuxStream: vi.fn((_stream, stdout, _stderr) => {
          // Emit an error on the captured stream immediately after demux is called
          setImmediate(() => {
            stdout.emit("error", new Error("Stream error"));
          });
        })
      };
      const mockClient = {
        getContainer: vi.fn().mockReturnValue(mockContainer),
        modem: mockModem
      } as unknown as Docker;

      mockFactory = vi.fn(() => mockClient);
      service = new DockerService(mockFactory);

      await expect(
        service.execContainer("container-123", testHost, {
          command: "hostname"
        })
      ).rejects.toThrow("Stream error");

      expect(destroySpy).toHaveBeenCalled();
    });
  });
});
