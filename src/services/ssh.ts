import { HostConfig } from "../types.js";
import { SSHService } from "./ssh-service.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";

/**
 * Temporary global SSH service for backward compatibility
 * @deprecated Use ServiceContainer.getSSHService() instead
 */
let globalSSHService: SSHService | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getGlobalSSHService(): SSHService {
  if (!globalSSHService) {
    const pool = new SSHConnectionPoolImpl({
      maxConnections: parseInt(process.env.HOMELAB_SSH_MAX_CONNECTIONS || "5", 10),
      idleTimeoutMs: parseInt(process.env.HOMELAB_SSH_IDLE_TIMEOUT_MS || "60000", 10),
      connectionTimeoutMs: parseInt(process.env.HOMELAB_SSH_CONNECTION_TIMEOUT_MS || "5000", 10),
      enableHealthChecks: process.env.HOMELAB_SSH_ENABLE_HEALTH_CHECKS !== "false",
      healthCheckIntervalMs: parseInt(
        process.env.HOMELAB_SSH_HEALTH_CHECK_INTERVAL_MS || "30000",
        10
      )
    });
    globalSSHService = new SSHService(pool);
  }
  return globalSSHService;
}

/**
 * Sanitize string for safe shell usage
 * Rejects any potentially dangerous characters
 */
export function sanitizeForShell(input: string): string {
  // Only allow alphanumeric, dots, hyphens, underscores, and forward slashes (for paths)
  if (!/^[a-zA-Z0-9._\-/]+$/.test(input)) {
    throw new Error(`Invalid characters in input: ${input}`);
  }
  return input;
}

/**
 * Validate host configuration for SSH
 */
export function validateHostForSsh(host: HostConfig): void {
  // Validate hostname/IP - allow alphanumeric, dots, hyphens, colons (IPv6), and brackets
  if (host.host && !/^[a-zA-Z0-9.\-:[\]/]+$/.test(host.host)) {
    throw new Error(`Invalid host format: ${host.host}`);
  }

  // Validate SSH user if provided
  if (host.sshUser && !/^[a-zA-Z0-9_-]+$/.test(host.sshUser)) {
    throw new Error(`Invalid SSH user: ${host.sshUser}`);
  }

  // Validate key path if provided
  if (host.sshKeyPath && !/^[a-zA-Z0-9._\-/~]+$/.test(host.sshKeyPath)) {
    throw new Error(`Invalid SSH key path: ${host.sshKeyPath}`);
  }
}

/**
 * Host resource stats from SSH
 */
export interface HostResources {
  hostname: string;
  uptime: string;
  loadAverage: [number, number, number];
  cpu: {
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalMB: number;
    usedMB: number;
    freeMB: number;
    usagePercent: number;
  };
  disk: Array<{
    filesystem: string;
    mount: string;
    totalGB: number;
    usedGB: number;
    availGB: number;
    usagePercent: number;
  }>;
}
