import type { HostConfig, ContainerInfo, ContainerStats, HostStatus, LogEntry, ImageInfo } from "../types.js";
import type Docker from "dockerode";
import type { NodeSSH } from "node-ssh";
import type { HostResources } from "./ssh.js";
import type { DockerSystemInfo, DockerDiskUsage, PruneResult, ListImagesOptions } from "./docker.js";
import type { PoolStats } from "./ssh-pool.js";
import type { ComposeProject } from "./compose.js";

export interface IDockerService {
  getDockerClient(config: HostConfig): Docker;
  listContainers(
    hosts: HostConfig[],
    options?: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    }
  ): Promise<ContainerInfo[]>;
  containerAction(containerId: string, action: "start" | "stop" | "restart" | "pause" | "unpause", host: HostConfig): Promise<void>;
  getContainerLogs(
    containerId: string,
    host: HostConfig,
    options?: { lines?: number; since?: string; until?: string; stream?: "all" | "stdout" | "stderr" }
  ): Promise<LogEntry[]>;
  getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats>;
  findContainerHost(containerId: string, hosts: HostConfig[]): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null>;
  getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]>;
  listImages(hosts: HostConfig[], options?: ListImagesOptions): Promise<ImageInfo[]>;
  inspectContainer(containerId: string, host: HostConfig): Promise<Docker.ContainerInspectInfo>;
  getDockerInfo(host: HostConfig): Promise<DockerSystemInfo>;
  getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage>;
  pruneDocker(host: HostConfig, target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"): Promise<PruneResult[]>;
  pullImage(imageName: string, host: HostConfig): Promise<{ status: string }>;
  recreateContainer(containerId: string, host: HostConfig, options?: { pull?: boolean }): Promise<{ status: string; containerId: string }>;
  removeImage(imageId: string, host: HostConfig, options?: { force?: boolean }): Promise<{ status: string }>;
  buildImage(
    host: HostConfig,
    options: { context: string; tag: string; dockerfile?: string; noCache?: boolean }
  ): Promise<{ status: string }>;
}

export interface ISSHService {
  executeSSHCommand(host: HostConfig, command: string, args?: string[], options?: { timeoutMs?: number }): Promise<string>;
  getHostResources(host: HostConfig): Promise<HostResources>;
}

export interface IComposeService {
  composeExec(host: HostConfig, project: string, action: string, extraArgs?: string[]): Promise<string>;
  listComposeProjects(host: HostConfig): Promise<ComposeProject[]>;
  getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject>;
  composeUp(host: HostConfig, project: string, detach?: boolean): Promise<string>;
  composeDown(host: HostConfig, project: string, removeVolumes?: boolean): Promise<string>;
  composeRestart(host: HostConfig, project: string): Promise<string>;
  composeLogs(
    host: HostConfig,
    project: string,
    options?: { tail?: number; follow?: boolean; timestamps?: boolean; since?: string; until?: string; services?: string[] }
  ): Promise<string>;
  composeBuild(host: HostConfig, project: string, options?: { service?: string; noCache?: boolean; pull?: boolean }): Promise<string>;
  composePull(host: HostConfig, project: string, options?: { service?: string; ignorePullFailures?: boolean; quiet?: boolean }): Promise<string>;
  composeRecreate(host: HostConfig, project: string, options?: { service?: string; forceRecreate?: boolean; noDeps?: boolean }): Promise<string>;
}

export interface ISSHConnectionPool {
  getConnection(host: HostConfig): Promise<NodeSSH>;
  releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void>;
  closeConnection(host: HostConfig): Promise<void>;
  closeAll(): Promise<void>;
  getStats(): PoolStats;
}

export interface IServiceFactory {
  createDockerService(): IDockerService;
  createSSHConnectionPool(config?: Partial<{ maxConnections: number }>): ISSHConnectionPool;
  createSSHService(pool: ISSHConnectionPool): ISSHService;
  createComposeService(sshService: ISSHService): IComposeService;
}
