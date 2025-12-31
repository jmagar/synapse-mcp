import type {
  HostConfig,
  ContainerInfo,
  ContainerStats,
  ContainerExecResult,
  ContainerProcessList,
  HostStatus,
  LogEntry,
  ImageInfo,
  DockerNetworkInfo,
  DockerVolumeInfo,
  ComposeProject
} from "../types.js";
import type Docker from "dockerode";
import type { NodeSSH } from "node-ssh";
import type { HostResources } from "./ssh.js";
import type {
  DockerSystemInfo,
  DockerDiskUsage,
  PruneResult,
  ListImagesOptions
} from "./docker.js";
import type { PoolStats } from "./ssh-pool.js";

/**
 * Docker service interface for managing Docker containers, images, and resources.
 * Provides operations for container lifecycle management, image operations, system queries,
 * and Docker daemon interactions across multiple hosts.
 */
export interface IDockerService {
  /**
   * Get a Docker client instance for the specified host configuration.
   * Clients are cached per host to reuse connections.
   *
   * @param config - Host configuration containing connection details
   * @returns Docker client instance (dockerode)
   */
  getDockerClient(config: HostConfig): Docker;

  /**
   * List containers across multiple hosts with optional filtering.
   *
   * @param hosts - Array of host configurations to query
   * @param options - Filtering options
   * @param options.state - Filter by container state (all, running, stopped, paused)
   * @param options.nameFilter - Filter by container name (partial match)
   * @param options.imageFilter - Filter by image name (partial match)
   * @param options.labelFilter - Filter by label (format: "key=value")
   * @returns Array of containers with their details and host information
   */
  listContainers(
    hosts: HostConfig[],
    options?: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    }
  ): Promise<ContainerInfo[]>;

  /**
   * Perform a lifecycle action on a container.
   *
   * @param containerId - Container ID or name
   * @param action - Action to perform (start, stop, restart, pause, unpause)
   * @param host - Host configuration where container is located
   */
  containerAction(
    containerId: string,
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    host: HostConfig
  ): Promise<void>;

  /**
   * Retrieve logs from a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration where container is located
   * @param options - Log retrieval options
   * @param options.lines - Number of lines to retrieve (default: 100)
   * @param options.since - Show logs since timestamp or duration (e.g., "2023-01-01T00:00:00Z" or "10m")
   * @param options.until - Show logs until timestamp or duration
   * @param options.stream - Stream to retrieve (all, stdout, stderr)
   * @returns Array of log entries with timestamps and content
   */
  getContainerLogs(
    containerId: string,
    host: HostConfig,
    options?: {
      lines?: number;
      since?: string;
      until?: string;
      stream?: "all" | "stdout" | "stderr";
    }
  ): Promise<LogEntry[]>;

  /**
   * Get resource usage statistics for a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration where container is located
   * @returns Resource statistics including CPU, memory, network, and I/O
   */
  getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats>;

  /**
   * Execute a command inside a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration where container is located
   * @param options - Exec options
   * @param options.command - Command to execute (allowlisted)
   * @param options.user - Run as specific user
   * @param options.workdir - Working directory
   * @param options.timeout - Execution timeout in ms (default 30s, max 5min)
   * @returns Exec result with stdout, stderr, and exit code
   * @throws Error if timeout exceeded or buffer limit exceeded
   */
  execContainer(
    containerId: string,
    host: HostConfig,
    options: { command: string; user?: string; workdir?: string; timeout?: number }
  ): Promise<ContainerExecResult>;

  /**
   * Get running processes inside a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration where container is located
   * @returns Process list with titles and rows
   */
  getContainerProcesses(containerId: string, host: HostConfig): Promise<ContainerProcessList>;

  /**
   * Find which host a container is running on.
   * Searches across all provided hosts.
   *
   * @param containerId - Container ID or name to find
   * @param hosts - Array of host configurations to search
   * @returns Host config and container info if found, null otherwise
   */
  findContainerHost(
    containerId: string,
    hosts: HostConfig[]
  ): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null>;

  /**
   * Get Docker daemon status and version info for multiple hosts.
   *
   * @param hosts - Array of host configurations to check
   * @returns Array of host statuses with daemon info and reachability
   */
  getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]>;

  /**
   * List Docker images across multiple hosts with optional filtering.
   *
   * @param hosts - Array of host configurations to query
   * @param options - Filtering options (dangling, reference, etc.)
   * @returns Array of images with their details and host information
   */
  listImages(hosts: HostConfig[], options?: ListImagesOptions): Promise<ImageInfo[]>;

  /**
   * List Docker networks across multiple hosts.
   *
   * @param hosts - Array of host configurations to query
   * @returns Array of network details with host information
   */
  listNetworks(hosts: HostConfig[]): Promise<DockerNetworkInfo[]>;

  /**
   * List Docker volumes across multiple hosts.
   *
   * @param hosts - Array of host configurations to query
   * @returns Array of volume details with host information
   */
  listVolumes(hosts: HostConfig[]): Promise<DockerVolumeInfo[]>;

  /**
   * Get detailed information about a container.
   *
   * @param containerId - Container ID or name
   * @param host - Host configuration where container is located
   * @returns Full container inspection data from Docker API
   */
  inspectContainer(containerId: string, host: HostConfig): Promise<Docker.ContainerInspectInfo>;

  /**
   * Get Docker daemon system information.
   *
   * @param host - Host configuration to query
   * @returns System info including version, OS, architecture, and resource limits
   */
  getDockerInfo(host: HostConfig): Promise<DockerSystemInfo>;

  /**
   * Get Docker disk usage information.
   *
   * @param host - Host configuration to query
   * @returns Disk usage breakdown for images, containers, volumes, and build cache
   */
  getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage>;

  /**
   * Remove unused Docker resources (prune operation).
   *
   * @param host - Host configuration where pruning should occur
   * @param target - Resource type to prune (containers, images, volumes, networks, buildcache, all)
   * @returns Array of prune results showing what was removed and space reclaimed
   */
  pruneDocker(
    host: HostConfig,
    target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
  ): Promise<PruneResult[]>;

  /**
   * Pull a Docker image from a registry.
   *
   * @param imageName - Image name with optional tag (e.g., "nginx:latest")
   * @param host - Host configuration where image should be pulled
   * @returns Operation status
   */
  pullImage(imageName: string, host: HostConfig): Promise<{ status: string }>;

  /**
   * Recreate a container with the same configuration.
   * Optionally pulls the latest image before recreating.
   *
   * @param containerId - Container ID or name to recreate
   * @param host - Host configuration where container is located
   * @param options - Recreate options
   * @param options.pull - Whether to pull latest image before recreating
   * @returns Operation status and new container ID
   */
  recreateContainer(
    containerId: string,
    host: HostConfig,
    options?: { pull?: boolean }
  ): Promise<{ status: string; containerId: string }>;

  /**
   * Remove a Docker image.
   *
   * @param imageId - Image ID or name to remove
   * @param host - Host configuration where image is located
   * @param options - Removal options
   * @param options.force - Force removal even if image is in use
   * @returns Operation status
   */
  removeImage(
    imageId: string,
    host: HostConfig,
    options?: { force?: boolean }
  ): Promise<{ status: string }>;

  /**
   * Build a Docker image from a Dockerfile.
   *
   * @param host - Host configuration where build should occur
   * @param options - Build options
   * @param options.context - Path to build context directory
   * @param options.tag - Tag for the built image
   * @param options.dockerfile - Path to Dockerfile (relative to context, default: "Dockerfile")
   * @param options.noCache - Disable build cache
   * @returns Operation status
   */
  buildImage(
    host: HostConfig,
    options: { context: string; tag: string; dockerfile?: string; noCache?: boolean }
  ): Promise<{ status: string }>;

  /**
   * Clear all cached Docker client connections.
   * Useful for cleanup during shutdown or when connections need to be reset.
   */
  clearClients(): void;
}

/**
 * SSH service interface for executing commands on remote hosts.
 * Provides secure command execution and resource monitoring via SSH connections.
 */
export interface ISSHService {
  /**
   * Execute a command on a remote host via SSH.
   *
   * @param host - Host configuration containing SSH connection details
   * @param command - Command to execute (will be sanitized for security)
   * @param args - Optional command arguments (sanitized separately)
   * @param options - Execution options
   * @param options.timeoutMs - Command timeout in milliseconds
   * @returns Command output as string (stdout)
   * @throws SSHCommandError if command fails or times out
   */
  executeSSHCommand(
    host: HostConfig,
    command: string,
    args?: string[],
    options?: { timeoutMs?: number }
  ): Promise<string>;

  /**
   * Get system resource information from a remote host.
   * Retrieves CPU, memory, disk usage, and uptime.
   *
   * @param host - Host configuration to query
   * @returns Resource information including CPU, memory, disk, and uptime
   */
  getHostResources(host: HostConfig): Promise<HostResources>;
}

/**
 * Docker Compose service interface for managing multi-container applications.
 * Provides operations for Compose project lifecycle management, service control,
 * and log retrieval.
 */
export interface IComposeService {
  /**
   * Execute a Docker Compose command on a remote host.
   * Low-level method for running arbitrary Compose actions.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param action - Compose action/subcommand (e.g., "up", "down", "ps")
   * @param extraArgs - Additional arguments to pass to the command
   * @returns Command output as string
   */
  composeExec(
    host: HostConfig,
    project: string,
    action: string,
    extraArgs?: string[]
  ): Promise<string>;

  /**
   * List all Docker Compose projects on a host.
   *
   * @param host - Host configuration to query
   * @returns Array of Compose projects with their status and services
   */
  listComposeProjects(host: HostConfig): Promise<ComposeProject[]>;

  /**
   * Get detailed status of a specific Compose project.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @returns Project details including service states and configuration
   */
  getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject>;

  /**
   * Start a Docker Compose project (bring services up).
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param detach - Run in detached mode (default: true)
   * @returns Command output
   */
  composeUp(host: HostConfig, project: string, detach?: boolean): Promise<string>;

  /**
   * Stop and remove a Docker Compose project (bring services down).
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param removeVolumes - Also remove named volumes (default: false)
   * @returns Command output
   */
  composeDown(host: HostConfig, project: string, removeVolumes?: boolean): Promise<string>;

  /**
   * Restart all services in a Docker Compose project.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @returns Command output
   */
  composeRestart(host: HostConfig, project: string): Promise<string>;

  /**
   * Retrieve logs from Docker Compose services.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param options - Log retrieval options
   * @param options.tail - Number of lines to show from end of logs
   * @param options.follow - Follow log output (stream mode)
   * @param options.timestamps - Include timestamps in output
   * @param options.since - Show logs since timestamp or duration
   * @param options.until - Show logs until timestamp or duration
   * @param options.services - Filter logs to specific services
   * @returns Log output as string
   */
  composeLogs(
    host: HostConfig,
    project: string,
    options?: {
      tail?: number;
      follow?: boolean;
      timestamps?: boolean;
      since?: string;
      until?: string;
      services?: string[];
    }
  ): Promise<string>;

  /**
   * Build or rebuild Docker Compose services.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param options - Build options
   * @param options.service - Build only specific service
   * @param options.noCache - Do not use cache when building
   * @param options.pull - Always pull newer versions of base images
   * @returns Command output
   */
  composeBuild(
    host: HostConfig,
    project: string,
    options?: { service?: string; noCache?: boolean; pull?: boolean }
  ): Promise<string>;

  /**
   * Pull service images defined in Docker Compose file.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param options - Pull options
   * @param options.service - Pull only specific service
   * @param options.ignorePullFailures - Continue even if some pulls fail
   * @param options.quiet - Suppress output
   * @returns Command output
   */
  composePull(
    host: HostConfig,
    project: string,
    options?: { service?: string; ignorePullFailures?: boolean; quiet?: boolean }
  ): Promise<string>;

  /**
   * Recreate containers for Docker Compose services.
   * Useful for applying configuration changes without rebuilding images.
   *
   * @param host - Host configuration where project is located
   * @param project - Compose project name
   * @param options - Recreate options
   * @param options.service - Recreate only specific service
   * @param options.forceRecreate - Force recreation even if config hasn't changed
   * @param options.noDeps - Don't recreate dependent services
   * @returns Command output
   */
  composeRecreate(
    host: HostConfig,
    project: string,
    options?: { service?: string; forceRecreate?: boolean; noDeps?: boolean }
  ): Promise<string>;
}

/**
 * SSH connection pool interface for managing reusable SSH connections.
 * Provides connection pooling to reduce overhead of establishing SSH connections
 * and improve performance for repeated operations.
 */
export interface ISSHConnectionPool {
  /**
   * Get an SSH connection from the pool for the specified host.
   * Creates a new connection if none exists or all are in use.
   *
   * @param host - Host configuration for the connection
   * @returns Active SSH connection ready for use
   * @throws SSHConnectionError if connection cannot be established
   */
  getConnection(host: HostConfig): Promise<NodeSSH>;

  /**
   * Return an SSH connection to the pool for reuse.
   * Connection remains open and available for future requests.
   *
   * @param host - Host configuration the connection belongs to
   * @param connection - SSH connection to release back to pool
   */
  releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void>;

  /**
   * Close a specific host's connection and remove from pool.
   * Use when connection is no longer needed or has errors.
   *
   * @param host - Host configuration whose connection should be closed
   */
  closeConnection(host: HostConfig): Promise<void>;

  /**
   * Close all connections in the pool and clear pool state.
   * Use during shutdown or cleanup.
   */
  closeAll(): Promise<void>;

  /**
   * Get connection pool statistics.
   * Useful for monitoring pool health and performance.
   *
   * @returns Statistics including active connections, pool size, and usage metrics
   */
  getStats(): PoolStats;
}

/**
 * Local command executor interface for executing commands on localhost.
 * Provides secure command execution using Node.js child_process for local operations
 * without SSH overhead.
 */
export interface ILocalExecutorService {
  /**
   * Execute a command locally using Node.js execFile.
   * Uses execFile (not shell) to prevent command injection.
   *
   * @param command - Command to execute (path or binary name)
   * @param args - Array of command arguments
   * @param options - Execution options
   * @param options.timeoutMs - Command timeout in milliseconds (default: 30000)
   * @param options.cwd - Working directory for command execution
   * @returns Command output as string (stdout, trimmed)
   * @throws Error if command fails (non-zero exit code), times out, or binary not found
   * @note stderr output is included in error messages but does not cause failure by itself
   */
  executeLocalCommand(
    command: string,
    args?: string[],
    options?: { timeoutMs?: number; cwd?: string }
  ): Promise<string>;
}

/**
 * Service factory interface for creating service instances with dependency injection.
 * Provides centralized creation of all service instances with proper dependency wiring.
 */
export interface IServiceFactory {
  /**
   * Create a Docker service instance.
   * Docker service manages Docker API connections and operations.
   *
   * @returns Docker service instance
   */
  createDockerService(): IDockerService;

  /**
   * Create an SSH connection pool instance.
   *
   * @param config - Optional pool configuration
   * @param config.maxConnections - Maximum number of connections per host (default: 5)
   * @returns SSH connection pool instance
   */
  createSSHConnectionPool(config?: Partial<{ maxConnections: number }>): ISSHConnectionPool;

  /**
   * Create an SSH service instance.
   * SSH service requires a connection pool for managing connections.
   *
   * @param pool - SSH connection pool to use for managing connections
   * @returns SSH service instance
   */
  createSSHService(pool: ISSHConnectionPool): ISSHService;

  /**
   * Create a local executor service instance.
   * Local executor runs commands on localhost without SSH.
   *
   * @returns Local executor service instance
   */
  createLocalExecutor(): ILocalExecutorService;

  /**
   * Create a Docker Compose service instance.
   * Compose service requires SSH service for remote commands and local executor for local commands.
   *
   * @param sshService - SSH service to use for remote command execution
   * @param localExecutor - Local executor service for local command execution
   * @returns Compose service instance
   */
  createComposeService(sshService: ISSHService, localExecutor: ILocalExecutorService): IComposeService;

  /**
   * Create a File service instance.
   * File service requires SSH service for remote file operations.
   *
   * @param sshService - SSH service to use for remote command execution
   * @returns File service instance
   */
  createFileService(sshService: ISSHService): IFileService;
}

/**
 * File service interface for remote file operations via SSH.
 * Provides secure file reading, directory listing, command execution,
 * and file transfer capabilities across hosts.
 */
export interface IFileService {
  /**
   * Read content from a file on a remote host.
   *
   * @param host - Host configuration where the file is located
   * @param path - Absolute path to the file to read
   * @param maxSize - Maximum bytes to read (content truncated if exceeded)
   * @returns Object containing file content, size, and truncation status
   */
  readFile(
    host: HostConfig,
    path: string,
    maxSize: number
  ): Promise<{ content: string; size: number; truncated: boolean }>;

  /**
   * List contents of a directory on a remote host.
   *
   * @param host - Host configuration where the directory is located
   * @param path - Absolute path to the directory
   * @param showHidden - Whether to show hidden files (prefixed with .)
   * @returns Directory listing as string (ls output)
   */
  listDirectory(host: HostConfig, path: string, showHidden: boolean): Promise<string>;

  /**
   * Get tree representation of a directory structure.
   *
   * @param host - Host configuration where the directory is located
   * @param path - Absolute path to the directory
   * @param depth - Maximum depth to traverse
   * @returns Tree output as string
   */
  treeDirectory(host: HostConfig, path: string, depth: number): Promise<string>;

  /**
   * Execute a command in a working directory on a remote host.
   * SECURITY: Commands are validated against an allowlist by default.
   *
   * @param host - Host configuration where to execute
   * @param path - Working directory for command execution
   * @param command - Command to execute (must be in allowlist unless env override)
   * @param timeout - Command timeout in milliseconds
   * @returns Object containing stdout and exit code
   */
  executeCommand(
    host: HostConfig,
    path: string,
    command: string,
    timeout: number
  ): Promise<{ stdout: string; exitCode: number }>;

  /**
   * Find files matching a pattern on a remote host.
   *
   * @param host - Host configuration to search
   * @param path - Base directory to search from
   * @param pattern - Glob pattern to match (e.g., "*.log")
   * @param options - Search options
   * @param options.type - File type filter (f=file, d=directory, l=symlink)
   * @param options.maxDepth - Maximum search depth
   * @param options.limit - Maximum number of results
   * @returns Newline-separated list of matching paths
   */
  findFiles(
    host: HostConfig,
    path: string,
    pattern: string,
    options: { type?: "f" | "d" | "l"; maxDepth?: number; limit?: number }
  ): Promise<string>;

  /**
   * Transfer a file between hosts via SCP.
   *
   * @param sourceHost - Source host configuration
   * @param sourcePath - Path to source file
   * @param targetHost - Target host configuration
   * @param targetPath - Destination path
   * @returns Transfer result with bytes transferred and optional warning
   */
  transferFile(
    sourceHost: HostConfig,
    sourcePath: string,
    targetHost: HostConfig,
    targetPath: string
  ): Promise<{ bytesTransferred: number; warning?: string }>;

  /**
   * Compare two files and return diff output.
   * Supports comparing files on the same host or across different hosts.
   *
   * @param host1 - First host configuration
   * @param path1 - Path to first file
   * @param host2 - Second host configuration
   * @param path2 - Path to second file
   * @param contextLines - Number of context lines in diff output
   * @returns Unified diff output string
   */
  diffFiles(
    host1: HostConfig,
    path1: string,
    host2: HostConfig,
    path2: string,
    contextLines: number
  ): Promise<string>;
}

/**
 * Minimal interface for listing compose projects
 * Used by ComposeDiscovery to avoid circular dependency with ComposeService
 */
export interface IComposeProjectLister {
  listComposeProjects(host: HostConfig): Promise<ComposeProject[]>;
}
