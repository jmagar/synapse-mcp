import type { HostConfig } from "../types.js";
import type { ISSHConnectionPool, ISSHService } from "./interfaces.js";
import type { HostResources } from "./ssh.js";
import { SSHCommandError } from "../utils/errors.js";

/**
 * Options for SSH command execution
 */
export interface SSHCommandOptions {
  timeoutMs?: number; // Command timeout (default: 30000)
}

/**
 * SSH service implementation using connection pool for command execution.
 * Provides secure command execution and resource monitoring via SSH connections.
 */
export class SSHService implements ISSHService {
  constructor(private readonly pool: ISSHConnectionPool) {}

  /**
   * Execute SSH command using connection pool
   *
   * Automatically acquires connection from pool, executes command, and releases.
   * Connections are reused across calls for better performance.
   *
   * @param host - Host configuration
   * @param command - Command to execute
   * @param args - Command arguments (optional)
   * @param options - Execution options (timeout, etc.)
   * @returns Command stdout (trimmed)
   * @throws SSHCommandError if command fails or times out
   */
  async executeSSHCommand(
    host: HostConfig,
    command: string,
    args: string[] = [],
    options: SSHCommandOptions = {}
  ): Promise<string> {
    const timeoutMs = options.timeoutMs || 30000;

    // Get connection from pool
    const connection = await this.pool.getConnection(host);

    // Build full command
    const fullCommand = args.length > 0 ? `${command} ${args.join(" ")}` : command;

    try {
      // Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`SSH command timeout after ${timeoutMs}ms: ${command}`));
        }, timeoutMs);
      });

      const execPromise = connection.execCommand(fullCommand);

      const result = await Promise.race([execPromise, timeoutPromise]);

      // Check exit code
      if (result.code !== 0) {
        throw new SSHCommandError(
          "SSH command failed with non-zero exit code",
          host.name,
          fullCommand,
          result.code ?? undefined,
          result.stderr,
          result.stdout
        );
      }

      return result.stdout.trim();
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof SSHCommandError) {
          throw error;
        }
        const baseMessage = error.message || "SSH command execution failed";
        throw new SSHCommandError(
          baseMessage,
          host.name,
          fullCommand,
          undefined,
          undefined,
          undefined,
          error
        );
      }
      throw new SSHCommandError(
        "SSH command execution failed",
        host.name,
        fullCommand,
        undefined,
        undefined,
        undefined,
        error
      );
    } finally {
      // Always release connection back to pool
      await this.pool.releaseConnection(host, connection);
    }
  }

  /**
   * Get host resource usage via SSH using connection pool
   *
   * @param host - Host configuration to query
   * @returns Resource information including CPU, memory, disk, and uptime
   */
  async getHostResources(host: HostConfig): Promise<HostResources> {
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

    const output = await this.executeSSHCommand(host, script);
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
}
