import { SSHConnectionPoolImpl, type SSHConnectionPool, type SSHPoolConfig } from "./ssh-pool.js";
import type { HostConfig } from "../types.js";
import { SSHCommandError } from "../utils/errors.js";

/**
 * Global SSH connection pool singleton
 */
let globalPool: SSHConnectionPool | null = null;

/**
 * Options for SSH command execution
 */
export interface SSHCommandOptions {
  timeoutMs?: number; // Command timeout (default: 30000)
}

/**
 * Get or create the global SSH connection pool
 *
 * @param config - Optional pool configuration (only applied on first call)
 * @returns Global pool instance
 */
export function getGlobalPool(config?: Partial<SSHPoolConfig>): SSHConnectionPool {
  if (!globalPool) {
    // Load configuration from environment if not provided
    const poolConfig: Partial<SSHPoolConfig> = config || {
      maxConnections: parseInt(process.env.SSH_POOL_MAX_CONNECTIONS || "5", 10),
      idleTimeoutMs: parseInt(process.env.SSH_POOL_IDLE_TIMEOUT_MS || "60000", 10),
      connectionTimeoutMs: parseInt(process.env.SSH_POOL_CONNECTION_TIMEOUT_MS || "5000", 10),
      enableHealthChecks: process.env.SSH_POOL_ENABLE_HEALTH_CHECKS !== "false",
      healthCheckIntervalMs: parseInt(process.env.SSH_POOL_HEALTH_CHECK_INTERVAL_MS || "30000", 10)
    };

    globalPool = new SSHConnectionPoolImpl(poolConfig);

    // Register graceful shutdown handlers
    registerShutdownHandlers();
  }

  return globalPool;
}

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
 * @throws Error if command fails or times out
 */
export async function executeSSHCommand(
  host: HostConfig,
  command: string,
  args: string[] = [],
  options: SSHCommandOptions = {}
): Promise<string> {
  const pool = getGlobalPool();
  const timeoutMs = options.timeoutMs || 30000;

  // Get connection from pool
  const connection = await pool.getConnection(host);

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
    await pool.releaseConnection(host, connection);
  }
}

/**
 * Register handlers for graceful shutdown
 * Ensures all SSH connections are closed properly on exit
 */
function registerShutdownHandlers(): void {
  const shutdown = async (): Promise<void> => {
    if (globalPool) {
      console.error("Closing SSH connection pool...");
      await globalPool.closeAll();
      globalPool = null;
    }
  };

  // Handle various termination signals
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });

  process.on("beforeExit", () => {
    void shutdown();
  });
}
