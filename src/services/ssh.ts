import { HostConfig } from "../types.js";
import { executeSSHCommand } from "./ssh-pool-exec.js";

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


/**
 * Get host resource usage via SSH using connection pool
 */
export async function getHostResources(host: HostConfig): Promise<HostResources> {
  // Run all commands in one SSH session for efficiency
  const script = `
    hostname
    echo "---"
    uptime -p 2>/dev/null || uptime | sed 's/.*up/up/'
    echo "---"
    cat /proc/loadavg | awk '{print $1,$2,$3}'
    echo "---"
    nproc
    echo "---"
    top -bn1 | grep "Cpu(s)" | awk '{print 100-$8}' 2>/dev/null || echo "0"
    echo "---"
    free -m | awk '/^Mem:/ {print $2,$3,$4}'
    echo "---"
    df -BG --output=source,target,size,used,avail,pcent 2>/dev/null | grep -E '^/dev' || df -h | grep -E '^/dev'
  `
    .trim()
    .replace(/\n/g, "; ");

  const output = await executeSSHCommand(host, script);
  const sections = output.split("---").map((s) => s.trim());

  // Parse hostname
  const hostname = sections[0] || host.name;

  // Parse uptime
  const uptime = sections[1] || "unknown";

  // Parse load average
  const loadParts = (sections[2] || "0 0 0").split(" ").map(Number);
  const loadAverage: [number, number, number] = [
    loadParts[0] || 0,
    loadParts[1] || 0,
    loadParts[2] || 0
  ];

  // Parse CPU
  const cores = parseInt(sections[3] || "1", 10);
  const cpuUsage = parseFloat(sections[4] || "0");

  // Parse memory
  const memParts = (sections[5] || "0 0 0").split(" ").map(Number);
  const totalMB = memParts[0] || 0;
  const usedMB = memParts[1] || 0;
  const freeMB = memParts[2] || 0;
  const memUsagePercent = totalMB > 0 ? (usedMB / totalMB) * 100 : 0;

  // Parse disk
  const diskLines = (sections[6] || "").split("\n").filter((l) => l.trim());
  const disk = diskLines
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        return {
          filesystem: parts[0],
          mount: parts[1],
          totalGB: parseFloat(parts[2].replace("G", "")) || 0,
          usedGB: parseFloat(parts[3].replace("G", "")) || 0,
          availGB: parseFloat(parts[4].replace("G", "")) || 0,
          usagePercent: parseFloat(parts[5].replace("%", "")) || 0
        };
      }
      return null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  return {
    hostname,
    uptime,
    loadAverage,
    cpu: {
      cores,
      usagePercent: Math.round(cpuUsage * 10) / 10
    },
    memory: {
      totalMB,
      usedMB,
      freeMB,
      usagePercent: Math.round(memUsagePercent * 10) / 10
    },
    disk
  };
}
