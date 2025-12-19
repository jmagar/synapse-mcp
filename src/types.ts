// Host configuration for multi-host homelab setup
export interface HostConfig {
  name: string;
  host: string;
  port?: number;
  protocol: "http" | "https" | "ssh";
  // For SSH connections (to Docker socket)
  sshUser?: string;
  sshKeyPath?: string;
  // For direct Docker API
  dockerSocketPath?: string;
  // Tags for filtering
  tags?: string[];
}

// Container info returned from Docker API
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: "running" | "paused" | "exited" | "created" | "restarting" | "removing" | "dead";
  status: string;
  created: string;
  ports: PortBinding[];
  labels: Record<string, string>;
  hostName: string;
}

export interface PortBinding {
  containerPort: number;
  hostPort?: number;
  protocol: "tcp" | "udp";
  hostIp?: string;
}

// Container stats for monitoring
export interface ContainerStats {
  containerId: string;
  containerName: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

// Log entry with metadata
export interface LogEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

// Service health aggregation
export interface ServiceHealth {
  name: string;
  host: string;
  containerId: string;
  state: string;
  uptime: string;
  restartCount: number;
  healthStatus?: "healthy" | "unhealthy" | "starting" | "none";
  lastHealthCheck?: string;
}

// Response format enum
export enum ResponseFormat {
  JSON = "json",
  MARKDOWN = "markdown"
}

// Pagination metadata
export interface PaginationMeta {
  total: number;
  count: number;
  offset: number;
  hasMore: boolean;
  nextOffset?: number;
}

// Generic paginated response
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// Host status for overview
export interface HostStatus {
  name: string;
  host: string;
  connected: boolean;
  containerCount: number;
  runningCount: number;
  error?: string;
}

// Compose project info
export interface ComposeProject {
  name: string;
  host: string;
  services: string[];
  status: "running" | "partial" | "stopped";
  configPath?: string;
}

// Docker image info
export interface ImageInfo {
  id: string;
  tags: string[];
  size: number;
  created: string;
  containers: number;
  hostName: string;
}
