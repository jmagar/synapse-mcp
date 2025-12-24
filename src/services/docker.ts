import Docker from "dockerode";
import { readFileSync, existsSync } from "fs";
import { homedir, hostname } from "os";
import { join } from "path";
import {
  HostConfig,
  ContainerInfo,
  ContainerStats,
  HostStatus,
  LogEntry,
  ImageInfo
} from "../types.js";
import { DEFAULT_DOCKER_SOCKET, API_TIMEOUT, ENV_HOSTS_CONFIG } from "../constants.js";

/**
 * Check if a string looks like a Unix socket path
 */
export function isSocketPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    (value.endsWith(".sock") || value.includes("/docker") || value.includes("/run/"))
  );
}

// Connection cache for Docker clients (exported for testing and cleanup)
export const dockerClients = new Map<string, Docker>();

/**
 * Clear all cached Docker clients (for graceful shutdown)
 */
export function clearDockerClients(): void {
  dockerClients.clear();
}

/**
 * Config file search paths (in order of priority)
 */
const CONFIG_PATHS = [
  process.env.HOMELAB_CONFIG_FILE, // Explicit path
  join(process.cwd(), "homelab.config.json"), // Current directory
  join(homedir(), ".config", "homelab-mcp", "config.json"), // XDG style
  join(homedir(), ".homelab-mcp.json") // Dotfile style
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
        console.error(`Failed to parse config file ${configPath}:`, error);
      }
    }
  }

  // 2. Fall back to env var if no config file
  if (hosts.length === 0) {
    const configJson = process.env[ENV_HOSTS_CONFIG];
    if (configJson) {
      try {
        hosts = JSON.parse(configJson) as HostConfig[];
        console.error(`Loaded ${hosts.length} hosts from HOMELAB_HOSTS_CONFIG env`);
      } catch (error) {
        console.error("Failed to parse HOMELAB_HOSTS_CONFIG:", error);
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
 * Get or create Docker client for a host
 */
export function getDockerClient(config: HostConfig): Docker {
  const cacheKey = `${config.name}-${config.host}`;

  const cached = dockerClients.get(cacheKey);
  if (cached) {
    return cached;
  }

  let docker: Docker;

  // Check for explicit socket path OR socket path in host field
  const socketPath = config.dockerSocketPath || (isSocketPath(config.host) ? config.host : null);

  if (socketPath) {
    // Local socket connection
    docker = new Docker({ socketPath });
  } else if (config.protocol === "http" || config.protocol === "https") {
    // Remote TCP connection
    docker = new Docker({
      host: config.host,
      port: config.port || 2375,
      protocol: config.protocol,
      timeout: API_TIMEOUT
    });
  } else {
    throw new Error(`Unsupported protocol: ${config.protocol}`);
  }

  dockerClients.set(cacheKey, docker);
  return docker;
}

/**
 * Find which host a container is on
 */
export async function findContainerHost(
  containerId: string,
  hosts: HostConfig[]
): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null> {
  for (const host of hosts) {
    try {
      const docker = getDockerClient(host);
      const containers = await docker.listContainers({ all: true });

      const found = containers.find(
        (c) =>
          c.Id.startsWith(containerId) || c.Names.some((n) => n.replace(/^\//, "") === containerId)
      );

      if (found) {
        return { host, container: found };
      }
    } catch {
      // Host unreachable, continue to next
    }
  }
  return null;
}

/**
 * List options for filtering containers
 */
interface ListContainersOptions {
  state?: "all" | "running" | "stopped" | "paused";
  nameFilter?: string;
  imageFilter?: string;
  labelFilter?: string;
}

/**
 * List containers on a single host (internal helper)
 */
async function listContainersOnHost(
  host: HostConfig,
  options: ListContainersOptions
): Promise<ContainerInfo[]> {
  const docker = getDockerClient(host);
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
    if (options.imageFilter && !c.Image.toLowerCase().includes(options.imageFilter.toLowerCase())) {
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
 * List containers across all hosts with filtering (parallel execution)
 */
export async function listContainers(
  hosts: HostConfig[],
  options: ListContainersOptions = {}
): Promise<ContainerInfo[]> {
  // Query all hosts in parallel using Promise.allSettled
  const results = await Promise.allSettled(
    hosts.map((host) => listContainersOnHost(host, options))
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
 * Get container by ID or name
 */
export async function getContainer(
  containerId: string,
  host: HostConfig
): Promise<Docker.Container> {
  const docker = getDockerClient(host);
  return docker.getContainer(containerId);
}

/**
 * Perform action on container
 */
export async function containerAction(
  containerId: string,
  action: "start" | "stop" | "restart" | "pause" | "unpause",
  host: HostConfig
): Promise<void> {
  const container = await getContainer(containerId, host);

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
 * Get container logs
 */
export async function getContainerLogs(
  containerId: string,
  host: HostConfig,
  options: {
    lines?: number;
    since?: string;
    until?: string;
    stream?: "all" | "stdout" | "stderr";
  } = {}
): Promise<LogEntry[]> {
  const container = await getContainer(containerId, host);

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
 * Parse Docker log output into structured entries
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
 * Parse time specification (absolute or relative)
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
 * Get container stats
 */
export async function getContainerStats(
  containerId: string,
  host: HostConfig
): Promise<ContainerStats> {
  const container = await getContainer(containerId, host);
  const stats = await container.stats({ stream: false });

  // Calculate CPU percentage
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
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
 * Get status for a single host (internal helper)
 */
async function getHostStatusSingle(host: HostConfig): Promise<HostStatus> {
  try {
    const docker = getDockerClient(host);
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
 * Get host status overview (parallel execution)
 */
export async function getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]> {
  // Query all hosts in parallel - errors are handled in getHostStatusSingle
  return Promise.all(hosts.map((host) => getHostStatusSingle(host)));
}

/**
 * List images options
 */
export interface ListImagesOptions {
  danglingOnly?: boolean;
}

/**
 * List images from a single host (internal helper)
 */
async function listImagesOnHost(
  host: HostConfig,
  options: ListImagesOptions
): Promise<ImageInfo[]> {
  const docker = getDockerClient(host);
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
 * List images across all hosts (parallel execution)
 */
export async function listImages(
  hosts: HostConfig[],
  options: ListImagesOptions = {}
): Promise<ImageInfo[]> {
  const results = await Promise.allSettled(hosts.map((host) => listImagesOnHost(host, options)));

  return results
    .filter((r): r is PromiseFulfilledResult<ImageInfo[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

/**
 * Inspect container for detailed info
 */
export async function inspectContainer(
  containerId: string,
  host: HostConfig
): Promise<Docker.ContainerInspectInfo> {
  const container = await getContainer(containerId, host);
  return container.inspect();
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
 * Check Docker connection health and clear stale clients
 */
export async function checkConnection(host: HostConfig): Promise<boolean> {
  const cacheKey = `${host.name}-${host.host}`;
  try {
    const docker = getDockerClient(host);
    await docker.ping();
    return true;
  } catch {
    // Remove stale client from cache on failure
    dockerClients.delete(cacheKey);
    return false;
  }
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

/**
 * Get Docker system info
 */
export async function getDockerInfo(host: HostConfig): Promise<DockerSystemInfo> {
  const docker = getDockerClient(host);
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
export async function getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage> {
  const docker = getDockerClient(host);
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
export async function pruneDocker(
  host: HostConfig,
  target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
): Promise<PruneResult[]> {
  const docker = getDockerClient(host);
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
export async function pullImage(imageName: string, host: HostConfig): Promise<{ status: string }> {
  if (!imageName || imageName.trim() === "") {
    throw new Error("Image name is required");
  }

  const docker = getDockerClient(host);

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
export async function recreateContainer(
  containerId: string,
  host: HostConfig,
  options: { pull?: boolean } = {}
): Promise<{ status: string; containerId: string }> {
  const docker = getDockerClient(host);
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
    await pullImage(imageName, host);
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
export async function removeImage(
  imageId: string,
  host: HostConfig,
  options: { force?: boolean } = {}
): Promise<{ status: string }> {
  const docker = getDockerClient(host);
  const image = docker.getImage(imageId);

  await image.remove({ force: options.force });

  return { status: `Successfully removed image ${imageId}` };
}

/**
 * Build an image from a Dockerfile (SSH-based for remote hosts)
 */
export async function buildImage(
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
  if (!/^[a-zA-Z0-9._\-/]+$/.test(context)) {
    throw new Error(`Invalid build context: ${context}`);
  }

  const args: string[] = ["build", "-t", tag];

  if (noCache) {
    args.push("--no-cache");
  }

  if (dockerfile) {
    if (!/^[a-zA-Z0-9._\-/]+$/.test(dockerfile)) {
      throw new Error(`Invalid dockerfile path: ${dockerfile}`);
    }
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
