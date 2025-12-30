import Docker from "dockerode";
import { readFileSync, existsSync } from "fs";
import { homedir, hostname } from "os";
import { join } from "path";
import { PassThrough } from "stream";
import {
  HostConfig,
  ContainerInfo,
  ContainerStats,
  ContainerExecResult,
  ContainerProcessList,
  HostStatus,
  LogEntry,
  ImageInfo,
  DockerNetworkInfo,
  DockerVolumeInfo
} from "../types.js";
import { DEFAULT_DOCKER_SOCKET, API_TIMEOUT, ENV_HOSTS_CONFIG, DEFAULT_EXEC_TIMEOUT, DEFAULT_EXEC_MAX_BUFFER } from "../constants.js";
import { HostOperationError, logError } from "../utils/errors.js";
import { validateCommandAllowlist } from "../utils/command-security.js";
import type { IDockerService } from "./interfaces.js";

/**
 * Extended volume type that includes CreatedAt field
 * Docker API may return CreatedAt but dockerode types don't include it
 * This interface documents the actual API response shape
 */
interface VolumeWithCreatedAt {
  Name: string;
  Driver: string;
  Scope: string;
  Mountpoint?: string;
  Labels?: { [label: string]: string };
  CreatedAt?: string;
}

/**
 * Check if a string looks like a Unix socket path
 */
export function isSocketPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    (value.endsWith(".sock") || value.includes("/docker") || value.includes("/run/"))
  );
}

/**
 * Create a default Docker client for a given host configuration
 */
function createDefaultDockerClient(config: HostConfig): Docker {
  // Check for explicit socket path OR socket path in host field
  const socketPath = config.dockerSocketPath || (isSocketPath(config.host) ? config.host : null);

  if (socketPath) {
    // Unix socket connection
    return new Docker({ socketPath });
  } else if (config.protocol === "http" || config.protocol === "https") {
    // Remote TCP connection
    return new Docker({
      host: config.host,
      port: config.port || 2375,
      protocol: config.protocol,
      timeout: API_TIMEOUT
    });
  } else {
    throw new Error(`Unsupported protocol: ${config.protocol}`);
  }
}

/**
 * DockerService class implementing IDockerService interface
 * Manages Docker client connections and operations across multiple hosts
 */
export class DockerService implements IDockerService {
  private clientCache = new Map<string, Docker>();

  constructor(private dockerFactory: (config: HostConfig) => Docker = createDefaultDockerClient) {}

  /**
   * Get or create Docker client for a host
   */
  getDockerClient(config: HostConfig): Docker {
    const cacheKey = `${config.name}-${config.host}`;

    const cached = this.clientCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const client = this.dockerFactory(config);
    this.clientCache.set(cacheKey, client);
    return client;
  }

  /**
   * Clears all cached Docker clients.
   *
   * Call this during application shutdown or when you need to force new connections
   * to all Docker hosts. The cached client instances will be removed, and any
   * underlying HTTP/socket connections will be cleaned up by garbage collection
   * when the client objects are no longer referenced.
   *
   * Note: Dockerode clients do not have an explicit close() method. The HTTP agent
   * connections are automatically managed and will be released by the Node.js runtime
   * when the client objects are garbage collected.
   *
   * @example
   * ```typescript
   * // Force fresh connections on next access
   * dockerService.clearClients();
   *
   * // Or during shutdown
   * process.on('SIGTERM', () => {
   *   dockerService.clearClients();
   *   process.exit(0);
   * });
   * ```
   */
  clearClients(): void {
    this.clientCache.clear();
  }

  /**
   * List containers across all hosts with filtering (parallel execution)
   */
  async listContainers(
    hosts: HostConfig[],
    options: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    } = {}
  ): Promise<ContainerInfo[]> {
    // Query all hosts in parallel using Promise.allSettled
    const results = await Promise.allSettled(
      hosts.map((host) => this.listContainersOnHost(host, options))
    );

    // Collect results from successful queries, log failures
    const containers: ContainerInfo[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        containers.push(...result.value);
      } else {
        console.error(`Failed to list containers on ${hosts[i].name}:`, result.reason);
      }
    }

    return containers;
  }

  /**
   * List containers on a single host (internal helper)
   */
  private async listContainersOnHost(
    host: HostConfig,
    options: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    }
  ): Promise<ContainerInfo[]> {
    const docker = this.getDockerClient(host);
    const listOptions: Docker.ContainerListOptions = {
      all: options.state !== "running"
    };

    // Add label filter if specified
    if (options.labelFilter) {
      listOptions.filters = { label: [options.labelFilter] };
    }

    const containers = await docker.listContainers(listOptions);
    const results: ContainerInfo[] = [];

    for (const c of containers) {
      const containerState = c.State?.toLowerCase() as ContainerInfo["state"];

      // Apply state filter
      if (options.state && options.state !== "all") {
        if (options.state === "stopped" && containerState !== "exited") continue;
        if (options.state === "paused" && containerState !== "paused") continue;
        if (options.state === "running" && containerState !== "running") continue;
      }

      const name = c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12);

      // Apply name filter
      if (options.nameFilter && !name.toLowerCase().includes(options.nameFilter.toLowerCase())) {
        continue;
      }

      // Apply image filter
      if (
        options.imageFilter &&
        !c.Image.toLowerCase().includes(options.imageFilter.toLowerCase())
      ) {
        continue;
      }

      results.push({
        id: c.Id,
        name,
        image: c.Image,
        state: containerState,
        status: c.Status,
        created: new Date(c.Created * 1000).toISOString(),
        ports: (c.Ports || []).map((p) => ({
          containerPort: p.PrivatePort,
          hostPort: p.PublicPort,
          protocol: p.Type as "tcp" | "udp",
          hostIp: p.IP
        })),
        labels: c.Labels || {},
        hostName: host.name
      });
    }

    return results;
  }

  /**
   * Find which host a container is on
   */
  async findContainerHost(
    containerId: string,
    hosts: HostConfig[]
  ): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null> {
    for (const host of hosts) {
      try {
        const docker = this.getDockerClient(host);
        const containers = await docker.listContainers({ all: true });

        const found = containers.find(
          (c) =>
            c.Id.startsWith(containerId) ||
            c.Names.some((n) => n.replace(/^\//, "") === containerId)
        );

        if (found) {
          return { host, container: found };
        }
      } catch (error) {
        logError(
          new HostOperationError(
            "Failed to list containers on host",
            host.name,
            "findContainerHost",
            error
          ),
          { metadata: { containerId } }
        );
      }
    }
    return null;
  }

  /**
   * Perform action on container
   */
  async containerAction(
    containerId: string,
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    host: HostConfig
  ): Promise<void> {
    const container = await this.getContainer(containerId, host);

    switch (action) {
      case "start":
        await container.start();
        break;
      case "stop":
        await container.stop({ t: 10 });
        break;
      case "restart":
        await container.restart({ t: 10 });
        break;
      case "pause":
        await container.pause();
        break;
      case "unpause":
        await container.unpause();
        break;
    }
  }

  /**
   * Get container by ID or name
   */
  private async getContainer(containerId: string, host: HostConfig): Promise<Docker.Container> {
    const docker = this.getDockerClient(host);
    return docker.getContainer(containerId);
  }

  /**
   * Get container logs
   */
  async getContainerLogs(
    containerId: string,
    host: HostConfig,
    options: {
      lines?: number;
      since?: string;
      until?: string;
      stream?: "all" | "stdout" | "stderr";
    } = {}
  ): Promise<LogEntry[]> {
    const container = await this.getContainer(containerId, host);

    const logOptions: {
      stdout: boolean;
      stderr: boolean;
      tail: number;
      timestamps: boolean;
      follow: false;
      since?: number;
      until?: number;
    } = {
      stdout: options.stream !== "stderr",
      stderr: options.stream !== "stdout",
      tail: options.lines || 100,
      timestamps: true,
      follow: false
    };

    if (options.since) {
      logOptions.since = parseTimeSpec(options.since);
    }
    if (options.until) {
      logOptions.until = parseTimeSpec(options.until);
    }

    const logs = await container.logs(logOptions);
    return parseDockerLogs(logs.toString());
  }

  /**
   * Get container stats
   */
  async getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats> {
    const container = await this.getContainer(containerId, host);
    const stats = await container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // Memory stats
    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;
    const memPercent = (memUsage / memLimit) * 100;

    // Network stats
    let netRx = 0,
      netTx = 0;
    if (stats.networks) {
      for (const net of Object.values(stats.networks)) {
        netRx += (net as { rx_bytes: number }).rx_bytes || 0;
        netTx += (net as { tx_bytes: number }).tx_bytes || 0;
      }
    }

    // Block I/O
    let blockRead = 0,
      blockWrite = 0;
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
        if (entry.op === "read") blockRead += entry.value;
        if (entry.op === "write") blockWrite += entry.value;
      }
    }

    const info = await container.inspect();

    return {
      containerId,
      containerName: info.Name.replace(/^\//, ""),
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage: memUsage,
      memoryLimit: memLimit,
      memoryPercent: Math.round(memPercent * 100) / 100,
      networkRx: netRx,
      networkTx: netTx,
      blockRead,
      blockWrite
    };
  }

  /**
   * Execute a command inside a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration
   * @param options - Execution options
   * @param options.command - Shell command to execute
   * @param options.user - Optional user to run as
   * @param options.workdir - Optional working directory
   * @param options.timeout - Optional timeout in ms (default 30s, max 5min)
   * @returns Promise resolving to stdout, stderr, and exit code
   * @throws Error if timeout exceeded or buffer limit exceeded
   */
  async execContainer(
    containerId: string,
    host: HostConfig,
    options: { command: string; user?: string; workdir?: string; timeout?: number }
  ): Promise<ContainerExecResult> {
    const container = await this.getContainer(containerId, host);
    const parts = validateCommandAllowlist(options.command);
    const timeout = options.timeout ?? DEFAULT_EXEC_TIMEOUT;
    const maxBuffer = DEFAULT_EXEC_MAX_BUFFER;

    const exec = await container.exec({
      Cmd: parts,
      AttachStdout: true,
      AttachStderr: true,
      User: options.user,
      WorkingDir: options.workdir
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let bufferExceeded = false;

    /**
     * Clean up all streams and clear timeout.
     * This function is idempotent and safe to call multiple times.
     * Uses try-catch to handle race conditions where streams may be
     * destroyed between the check and the destroy call.
     */
    const cleanup = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Safely destroy streams - ignore if already destroyed
      // This prevents race conditions where destroyed state changes between check and call
      try {
        stream.destroy();
      } catch {
        /* already destroyed */
      }
      try {
        stdoutStream.destroy();
      } catch {
        /* already destroyed */
      }
      try {
        stderrStream.destroy();
      } catch {
        /* already destroyed */
      }
    };

    // Track stdout buffer size and reject if limit exceeded
    stdoutStream.on("data", (chunk: Buffer) => {
      if (bufferExceeded) return;

      // Check BEFORE allocating buffer to prevent race condition
      if (stdoutSize + chunk.length > maxBuffer) {
        bufferExceeded = true;
        cleanup();
        return;
      }

      stdoutSize += chunk.length;
      stdoutChunks.push(chunk); // chunk is already a Buffer, no need to copy
    });

    // Track stderr buffer size and reject if limit exceeded
    stderrStream.on("data", (chunk: Buffer) => {
      if (bufferExceeded) return;

      // Check BEFORE allocating buffer to prevent race condition
      if (stderrSize + chunk.length > maxBuffer) {
        bufferExceeded = true;
        cleanup();
        return;
      }

      stderrSize += chunk.length;
      stderrChunks.push(chunk); // chunk is already a Buffer, no need to copy
    });

    try {
      await new Promise<void>((resolve, reject) => {
        // Guard to ensure only one settlement path executes
        let settled = false;

        /**
         * Atomically settle the promise with rejection.
         * Checks settled guard, sets it, cleans up, then rejects.
         * Safe to call multiple times - subsequent calls are no-ops.
         */
        const settleWithRejection = (error: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        /**
         * Atomically settle the promise with success.
         * Checks settled guard, sets it, cleans up, then resolves.
         * Safe to call multiple times - subsequent calls are no-ops.
         */
        const settleWithSuccess = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        // Set up timeout
        timeoutId = setTimeout(() => {
          settleWithRejection(new Error(`Exec timeout: command exceeded ${timeout}ms limit`));
        }, timeout);

        // Handle stream errors
        const handleError = (err: Error): void => {
          settleWithRejection(err);
        };

        stream.on("error", handleError);
        stdoutStream.on("error", handleError);
        stderrStream.on("error", handleError);

        // Check for buffer exceeded after each data event
        const checkBufferExceeded = (): void => {
          if (bufferExceeded) {
            settleWithRejection(new Error(`Buffer limit exceeded: output exceeded ${maxBuffer} bytes`));
          }
        };
        stdoutStream.on("data", checkBufferExceeded);
        stderrStream.on("data", checkBufferExceeded);

        stream.on("end", () => {
          if (bufferExceeded) {
            settleWithRejection(new Error(`Buffer limit exceeded: output exceeded ${maxBuffer} bytes`));
          } else {
            settleWithSuccess();
          }
        });

        this.getDockerClient(host).modem.demuxStream(stream, stdoutStream, stderrStream);
      });

      const inspection = await exec.inspect();

      return {
        stdout: Buffer.concat(stdoutChunks).toString().trimEnd(),
        stderr: Buffer.concat(stderrChunks).toString().trimEnd(),
        exitCode: inspection.ExitCode ?? 0
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  /**
   * List running processes inside a container.
   */
  async getContainerProcesses(
    containerId: string,
    host: HostConfig
  ): Promise<ContainerProcessList> {
    const container = await this.getContainer(containerId, host);
    const result = await container.top();

    return {
      titles: result.Titles ?? [],
      processes: result.Processes ?? []
    };
  }

  /**
   * Get host status overview (parallel execution)
   */
  async getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]> {
    // Query all hosts in parallel - errors are handled in getHostStatusSingle
    return Promise.all(hosts.map((host) => this.getHostStatusSingle(host)));
  }

  /**
   * Get status for a single host (internal helper)
   */
  private async getHostStatusSingle(host: HostConfig): Promise<HostStatus> {
    try {
      const docker = this.getDockerClient(host);
      const containers = await docker.listContainers({ all: true });
      const running = containers.filter((c) => c.State === "running").length;

      return {
        name: host.name,
        host: host.host,
        connected: true,
        containerCount: containers.length,
        runningCount: running
      };
    } catch (error) {
      logError(new HostOperationError("Failed to get host info", host.name, "getHostInfo", error), {
        metadata: { host: host.host }
      });
      return {
        name: host.name,
        host: host.host,
        connected: false,
        containerCount: 0,
        runningCount: 0,
        error: error instanceof Error ? error.message : "Connection failed"
      };
    }
  }

  /**
   * List images across all hosts (parallel execution)
   */
  async listImages(hosts: HostConfig[], options: ListImagesOptions = {}): Promise<ImageInfo[]> {
    const results = await Promise.allSettled(
      hosts.map((host) => this.listImagesOnHost(host, options))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<ImageInfo[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  /**
   * List Docker networks across all hosts (parallel execution)
   */
  async listNetworks(hosts: HostConfig[]): Promise<DockerNetworkInfo[]> {
    const results = await Promise.allSettled(
      hosts.map((host) => this.listNetworksOnHost(host))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<DockerNetworkInfo[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  /**
   * List Docker volumes across all hosts (parallel execution)
   */
  async listVolumes(hosts: HostConfig[]): Promise<DockerVolumeInfo[]> {
    const results = await Promise.allSettled(
      hosts.map((host) => this.listVolumesOnHost(host))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<DockerVolumeInfo[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  /**
   * List images from a single host (internal helper)
   */
  private async listImagesOnHost(
    host: HostConfig,
    options: ListImagesOptions
  ): Promise<ImageInfo[]> {
    const docker = this.getDockerClient(host);
    const images = await docker.listImages({
      filters: options.danglingOnly ? { dangling: ["true"] } : undefined
    });

    return images.map((img) => ({
      id: formatImageId(img.Id),
      tags: img.RepoTags || ["<none>:<none>"],
      size: img.Size,
      created: new Date(img.Created * 1000).toISOString(),
      containers: img.Containers || 0,
      hostName: host.name
    }));
  }

  /**
   * List Docker networks from a single host (internal helper)
   */
  private async listNetworksOnHost(host: HostConfig): Promise<DockerNetworkInfo[]> {
    const docker = this.getDockerClient(host);
    const networks = await docker.listNetworks();

    return networks.map((network) => ({
      id: network.Id,
      name: network.Name,
      driver: network.Driver,
      scope: network.Scope,
      created: network.Created,
      internal: network.Internal,
      attachable: network.Attachable,
      ingress: network.Ingress,
      hostName: host.name
    }));
  }

  /**
   * List Docker volumes from a single host (internal helper)
   */
  private async listVolumesOnHost(host: HostConfig): Promise<DockerVolumeInfo[]> {
    const docker = this.getDockerClient(host);
    const result = await docker.listVolumes();
    const volumes = result?.Volumes ?? [];

    return volumes.map((volume) => {
      // Cast once to document the expected shape with CreatedAt
      const volumeWithCreatedAt = volume as VolumeWithCreatedAt;

      return {
        name: volumeWithCreatedAt.Name,
        driver: volumeWithCreatedAt.Driver,
        scope: volumeWithCreatedAt.Scope,
        mountpoint: volumeWithCreatedAt.Mountpoint,
        createdAt: typeof volumeWithCreatedAt.CreatedAt === "string"
          ? volumeWithCreatedAt.CreatedAt
          : undefined,
        labels: volumeWithCreatedAt.Labels ?? undefined,
        hostName: host.name
      };
    });
  }

  /**
   * Inspect container for detailed info
   */
  async inspectContainer(
    containerId: string,
    host: HostConfig
  ): Promise<Docker.ContainerInspectInfo> {
    const container = await this.getContainer(containerId, host);
    return container.inspect();
  }

  /**
   * Get Docker system info
   */
  async getDockerInfo(host: HostConfig): Promise<DockerSystemInfo> {
    const docker = this.getDockerClient(host);
    const info = await docker.info();
    const version = await docker.version();

    return {
      dockerVersion: version.Version || "unknown",
      apiVersion: version.ApiVersion || "unknown",
      os: info.OperatingSystem || info.OSType || "unknown",
      arch: info.Architecture || "unknown",
      kernelVersion: info.KernelVersion || "unknown",
      cpus: info.NCPU || 0,
      memoryBytes: info.MemTotal || 0,
      storageDriver: info.Driver || "unknown",
      rootDir: info.DockerRootDir || "/var/lib/docker",
      containersTotal: info.Containers || 0,
      containersRunning: info.ContainersRunning || 0,
      containersPaused: info.ContainersPaused || 0,
      containersStopped: info.ContainersStopped || 0,
      images: info.Images || 0
    };
  }

  /**
   * Get Docker disk usage (system df)
   */
  async getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage> {
    const docker = this.getDockerClient(host);
    const df = await docker.df();

    // Calculate image stats
    type ImageInfo = { Size?: number; SharedSize?: number; Containers?: number };
    const images: ImageInfo[] = df.Images || [];
    const imageSize = images.reduce((sum: number, i: ImageInfo) => sum + (i.Size || 0), 0);
    const imageShared = images.reduce((sum: number, i: ImageInfo) => sum + (i.SharedSize || 0), 0);
    const activeImages = images.filter((i: ImageInfo) => i.Containers && i.Containers > 0).length;

    // Calculate container stats
    type ContainerInfo = { SizeRw?: number; SizeRootFs?: number; State?: string };
    const containers: ContainerInfo[] = df.Containers || [];
    const containerSize = containers.reduce(
      (sum: number, c: ContainerInfo) => sum + (c.SizeRw || 0),
      0
    );
    const containerRootFs = containers.reduce(
      (sum: number, c: ContainerInfo) => sum + (c.SizeRootFs || 0),
      0
    );
    const runningContainers = containers.filter((c: ContainerInfo) => c.State === "running").length;

    // Calculate volume stats
    type VolumeInfo = { UsageData?: { Size?: number; RefCount?: number } };
    const volumes: VolumeInfo[] = df.Volumes || [];
    const volumeSize = volumes.reduce(
      (sum: number, v: VolumeInfo) => sum + (v.UsageData?.Size || 0),
      0
    );
    const activeVolumes = volumes.filter(
      (v: VolumeInfo) => v.UsageData?.RefCount && v.UsageData.RefCount > 0
    ).length;

    // Build cache
    type BuildCacheInfo = { Size?: number; InUse?: boolean };
    const buildCache: BuildCacheInfo[] = df.BuildCache || [];
    const buildCacheSize = buildCache.reduce(
      (sum: number, b: BuildCacheInfo) => sum + (b.Size || 0),
      0
    );
    const buildCacheReclaimable = buildCache
      .filter((b: BuildCacheInfo) => !b.InUse)
      .reduce((sum: number, b: BuildCacheInfo) => sum + (b.Size || 0), 0);

    const unusedVolumeSize = volumes
      .filter((v: VolumeInfo) => !v.UsageData?.RefCount)
      .reduce((sum: number, v: VolumeInfo) => sum + (v.UsageData?.Size || 0), 0);

    const totalSize = imageSize + containerSize + volumeSize + buildCacheSize;
    const totalReclaimable =
      imageSize - imageShared + containerSize + unusedVolumeSize + buildCacheReclaimable;

    return {
      images: {
        total: images.length,
        active: activeImages,
        size: imageSize,
        reclaimable: imageSize - imageShared
      },
      containers: {
        total: containers.length,
        running: runningContainers,
        size: containerSize + containerRootFs,
        reclaimable: containerSize
      },
      volumes: {
        total: volumes.length,
        active: activeVolumes,
        size: volumeSize,
        reclaimable: unusedVolumeSize
      },
      buildCache: {
        total: buildCache.length,
        size: buildCacheSize,
        reclaimable: buildCacheReclaimable
      },
      totalSize,
      totalReclaimable
    };
  }

  /**
   * Prune Docker resources
   */
  async pruneDocker(
    host: HostConfig,
    target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
  ): Promise<PruneResult[]> {
    const docker = this.getDockerClient(host);
    const results: PruneResult[] = [];

    const targets =
      target === "all"
        ? (["containers", "images", "volumes", "networks", "buildcache"] as const)
        : ([target] as const);

    for (const t of targets) {
      try {
        switch (t) {
          case "containers": {
            const res = await docker.pruneContainers();
            results.push({
              type: "containers",
              spaceReclaimed: res.SpaceReclaimed || 0,
              itemsDeleted: res.ContainersDeleted?.length || 0,
              details: res.ContainersDeleted
            });
            break;
          }
          case "images": {
            const res = await docker.pruneImages();
            results.push({
              type: "images",
              spaceReclaimed: res.SpaceReclaimed || 0,
              itemsDeleted: res.ImagesDeleted?.length || 0,
              details: res.ImagesDeleted?.map((i) => i.Deleted || i.Untagged || "")
            });
            break;
          }
          case "volumes": {
            const res = await docker.pruneVolumes();
            results.push({
              type: "volumes",
              spaceReclaimed: res.SpaceReclaimed || 0,
              itemsDeleted: res.VolumesDeleted?.length || 0,
              details: res.VolumesDeleted
            });
            break;
          }
          case "networks": {
            const res = await docker.pruneNetworks();
            results.push({
              type: "networks",
              spaceReclaimed: 0,
              itemsDeleted: res.NetworksDeleted?.length || 0,
              details: res.NetworksDeleted
            });
            break;
          }
          case "buildcache": {
            const res = (await docker.pruneBuilder()) as {
              SpaceReclaimed?: number;
              CachesDeleted?: string[];
            };
            results.push({
              type: "buildcache",
              spaceReclaimed: res.SpaceReclaimed || 0,
              itemsDeleted: res.CachesDeleted?.length || 0,
              details: res.CachesDeleted
            });
            break;
          }
        }
      } catch (error) {
        logError(
          new HostOperationError("Docker cleanup failed", host.name, "dockerCleanup", error),
          {
            metadata: { type: t }
          }
        );
        results.push({
          type: t,
          spaceReclaimed: 0,
          itemsDeleted: 0,
          details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
        });
      }
    }

    return results;
  }

  /**
   * Pull an image on a host
   */
  async pullImage(imageName: string, host: HostConfig): Promise<{ status: string }> {
    if (!imageName || imageName.trim() === "") {
      throw new Error("Image name is required");
    }

    const docker = this.getDockerClient(host);

    return new Promise((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(new Error(`Failed to pull image: ${err.message}`));
          return;
        }

        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) {
            reject(new Error(`Pull failed: ${err.message}`));
          } else {
            resolve({ status: `Successfully pulled ${imageName}` });
          }
        });
      });
    });
  }

  /**
   * Recreate a container (stop, remove, pull latest, start with same config)
   */
  async recreateContainer(
    containerId: string,
    host: HostConfig,
    options: { pull?: boolean } = {}
  ): Promise<{ status: string; containerId: string }> {
    const docker = this.getDockerClient(host);
    const container = docker.getContainer(containerId);

    // Get current container config
    const info = await container.inspect();
    const imageName = info.Config.Image;

    // Stop container if running
    if (info.State.Running) {
      await container.stop();
    }

    // Remove container
    await container.remove();

    // Pull latest image if requested
    if (options.pull !== false) {
      await this.pullImage(imageName, host);
    }

    // Create new container with same config
    const newContainer = await docker.createContainer({
      ...info.Config,
      HostConfig: info.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: info.NetworkSettings.Networks
      }
    });

    // Start new container
    await newContainer.start();

    return {
      status: "Container recreated successfully",
      containerId: newContainer.id
    };
  }

  /**
   * Remove an image
   */
  async removeImage(
    imageId: string,
    host: HostConfig,
    options: { force?: boolean } = {}
  ): Promise<{ status: string }> {
    const docker = this.getDockerClient(host);
    const image = docker.getImage(imageId);

    await image.remove({ force: options.force });

    return { status: `Successfully removed image ${imageId}` };
  }

  /**
   * Build an image from a Dockerfile (SSH-based for remote hosts)
   *
   * SECURITY: Implements path traversal protection (CWE-22)
   * - Requires absolute paths for context and dockerfile
   * - Rejects any path containing .. or . components
   * - Validates character set to prevent injection
   *
   * @param host - Docker host configuration
   * @param options - Build options (context, tag, dockerfile, noCache)
   * @returns Promise resolving to build status
   * @throws Error if paths contain directory traversal or invalid characters
   */
  async buildImage(
    host: HostConfig,
    options: {
      context: string;
      tag: string;
      dockerfile?: string;
      noCache?: boolean;
    }
  ): Promise<{ status: string }> {
    // For remote builds, we need to use SSH and docker build command
    // dockerode's build() requires local tar stream which won't work for remote

    const { context, tag, dockerfile, noCache } = options;

    // Validate inputs
    if (!/^[a-zA-Z0-9._\-/:]+$/.test(tag)) {
      throw new Error(`Invalid image tag: ${tag}`);
    }

    // Use secure path validation (prevents directory traversal)
    const { validateSecurePath } = await import("../utils/path-security.js");
    validateSecurePath(context, "context");

    if (dockerfile) {
      validateSecurePath(dockerfile, "dockerfile");
    }

    const args: string[] = ["build", "-t", tag];

    if (noCache) {
      args.push("--no-cache");
    }

    if (dockerfile) {
      args.push("-f", dockerfile);
    }

    args.push(context);

    // Execute via SSH for remote hosts, or locally for socket connections
    if (host.host.startsWith("/")) {
      // Local socket - use docker directly
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);

      await execFileAsync("docker", args, { timeout: 600000 }); // 10 min timeout for builds
    } else {
      // Remote - use SSH
      const { validateHostForSsh, sanitizeForShell } = await import("./ssh.js");
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);

      validateHostForSsh(host);

      const sshArgs = [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        "-o",
        "StrictHostKeyChecking=accept-new",
        sanitizeForShell(host.name),
        `docker ${args.join(" ")}`
      ];

      await execFileAsync("ssh", sshArgs, { timeout: 600000 });
    }

    return { status: `Successfully built image ${tag}` };
  }
}

/**
 * Config file search paths (in order of priority)
 */
const CONFIG_PATHS = [
  process.env.SYNAPSE_CONFIG_FILE, // Explicit path
  join(process.cwd(), "synapse.config.json"), // Current directory
  join(homedir(), ".config", "synapse-mcp", "config.json"), // XDG style
  join(homedir(), ".synapse-mcp.json") // Dotfile style
].filter(Boolean) as string[];

/**
 * Auto-add local Docker socket if it exists and isn't already configured
 */
function ensureLocalSocket(hosts: HostConfig[]): HostConfig[] {
  // Check if local socket exists
  if (!existsSync(DEFAULT_DOCKER_SOCKET)) {
    return hosts;
  }

  // Check if any host already uses the local socket
  const hasLocalSocket = hosts.some(
    (h) =>
      h.dockerSocketPath === DEFAULT_DOCKER_SOCKET ||
      h.host === DEFAULT_DOCKER_SOCKET ||
      (h.host === "localhost" && h.dockerSocketPath)
  );

  if (hasLocalSocket) {
    return hosts;
  }

  // Auto-add local socket entry
  const localName =
    hostname()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") || "local";
  console.error(`Auto-adding local Docker socket as "${localName}"`);

  return [
    ...hosts,
    {
      name: localName,
      host: DEFAULT_DOCKER_SOCKET,
      protocol: "http" as const,
      dockerSocketPath: DEFAULT_DOCKER_SOCKET
    }
  ];
}

/**
 * Load host configurations from config file, env var, or defaults
 */
export function loadHostConfigs(): HostConfig[] {
  let hosts: HostConfig[] = [];

  // 1. Try config file first
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw);
        const configHosts = config.hosts || config; // Support { hosts: [...] } or just [...]
        if (Array.isArray(configHosts) && configHosts.length > 0) {
          console.error(`Loaded ${configHosts.length} hosts from ${configPath}`);
          hosts = configHosts as HostConfig[];
          break;
        }
      } catch (error) {
        logError(error, {
          operation: "loadHostConfigs",
          metadata: { configPath, source: "file" }
        });
      }
    }
  }

  // 2. Fall back to env var if no config file
  if (hosts.length === 0) {
    const configJson = process.env[ENV_HOSTS_CONFIG];
    if (configJson) {
      try {
        hosts = JSON.parse(configJson) as HostConfig[];
        console.error(`Loaded ${hosts.length} hosts from SYNAPSE_HOSTS_CONFIG env`);
      } catch (error) {
        logError(error, {
          operation: "loadHostConfigs",
          metadata: { source: "SYNAPSE_HOSTS_CONFIG" }
        });
      }
    }
  }

  // 3. If still no hosts, default to local socket only
  if (hosts.length === 0) {
    console.error("No config found, using local Docker socket");
    return [
      {
        name: "local",
        host: "localhost",
        protocol: "http",
        dockerSocketPath: DEFAULT_DOCKER_SOCKET
      }
    ];
  }

  // 4. Auto-add local socket if exists and not configured
  return ensureLocalSocket(hosts);
}

/**
 * Parse time specification (absolute or relative) - pure helper function
 */
function parseTimeSpec(spec: string): number {
  // Check for relative time like "1h", "30m", "2d"
  const relativeMatch = spec.match(/^(\d+)([smhd])$/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };
    return Math.floor(Date.now() / 1000) - value * multipliers[unit];
  }

  // Absolute timestamp
  return Math.floor(new Date(spec).getTime() / 1000);
}

/**
 * Parse Docker log output into structured entries - pure helper function
 */
function parseDockerLogs(raw: string): LogEntry[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const entries: LogEntry[] = [];

  for (const line of lines) {
    // Docker log format: timestamp message
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);
    if (match) {
      entries.push({
        timestamp: match[1],
        stream: "stdout", // Default, actual stream info requires demuxing
        message: match[2]
      });
    } else if (line.trim()) {
      entries.push({
        timestamp: new Date().toISOString(),
        stream: "stdout",
        message: line
      });
    }
  }

  return entries;
}

/**
 * List images options
 */
export interface ListImagesOptions {
  danglingOnly?: boolean;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format uptime from created timestamp
 */
export function formatUptime(created: string): string {
  const diff = Date.now() - new Date(created).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format Docker image ID (truncate sha256: prefix and limit to 12 chars)
 */
export function formatImageId(id: string): string {
  const cleaned = id.replace(/^sha256:/, "");
  return cleaned.slice(0, 12) || cleaned;
}

/**
 * Docker system info response
 */
export interface DockerSystemInfo {
  dockerVersion: string;
  apiVersion: string;
  os: string;
  arch: string;
  kernelVersion: string;
  cpus: number;
  memoryBytes: number;
  storageDriver: string;
  rootDir: string;
  containersTotal: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
}

/**
 * Docker disk usage response
 */
export interface DockerDiskUsage {
  images: {
    total: number;
    active: number;
    size: number;
    reclaimable: number;
  };
  containers: {
    total: number;
    running: number;
    size: number;
    reclaimable: number;
  };
  volumes: {
    total: number;
    active: number;
    size: number;
    reclaimable: number;
  };
  buildCache: {
    total: number;
    size: number;
    reclaimable: number;
  };
  totalSize: number;
  totalReclaimable: number;
}

/**
 * Prune result
 */
export interface PruneResult {
  type: string;
  spaceReclaimed: number;
  itemsDeleted: number;
  details?: string[];
}
