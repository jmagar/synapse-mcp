import { HostConfig } from "../types.js";

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
 * SECURITY: Validates host before shell interpolation to prevent command injection
 */
export function validateHostForSsh(host: HostConfig): void {
  // Reject empty or missing hostname explicitly for clearer error messages
  if (!host.host || host.host.length === 0) {
    throw new Error('Host is required and cannot be empty');
  }

  // Validate hostname/IP - allow alphanumeric, dots, hyphens, colons (IPv6), and brackets
  if (!/^[a-zA-Z0-9.\-:[\]/]+$/.test(host.host)) {
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
