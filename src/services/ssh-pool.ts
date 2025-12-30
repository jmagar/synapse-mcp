import { HostConfig } from "../types.js";
import { NodeSSH } from "node-ssh";
import { HostOperationError, logError } from "../utils/errors.js";
import { readFileSync } from "fs";

/**
 * SSH connection pool configuration
 */
export interface SSHPoolConfig {
  maxConnections: number; // Max connections per host (default: 5)
  idleTimeoutMs: number; // Idle timeout before closing (default: 60000)
  connectionTimeoutMs: number; // Connection timeout (default: 5000)
  enableHealthChecks: boolean; // Enable periodic health checks (default: true)
  healthCheckIntervalMs: number; // Health check interval (default: 30000)
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: SSHPoolConfig = {
  maxConnections: 5,
  idleTimeoutMs: 60000,
  connectionTimeoutMs: 5000,
  enableHealthChecks: true,
  healthCheckIntervalMs: 30000
};

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  poolHits: number; // Successful connection reuse
  poolMisses: number; // New connections created
  activeConnections: number; // Currently active
  idleConnections: number; // Currently idle
  totalConnections: number; // Total in pool
  healthChecksPassed: number; // Successful health checks
  healthCheckFailures: number; // Failed health checks
}

/**
 * Connection metadata
 */
interface ConnectionMetadata {
  connection: NodeSSH;
  host: HostConfig;
  lastUsed: number;
  created: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  isActive: boolean;
}

/**
 * SSH Connection Pool interface
 */
export interface SSHConnectionPool {
  getConnection(host: HostConfig): Promise<NodeSSH>;
  releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void>;
  closeConnection(host: HostConfig): Promise<void>;
  closeAll(): Promise<void>;
  getStats(): PoolStats;
}

/**
 * Generate unique pool key for host
 * Format: ${host.name}:${port}
 */
export function generatePoolKey(host: HostConfig): string {
  const port = host.port || 22;
  return `${host.name}:${port}`;
}

/**
 * SSH Connection Pool Implementation
 */
export class SSHConnectionPoolImpl implements SSHConnectionPool {
  private config: SSHPoolConfig;
  private pool: Map<string, ConnectionMetadata[]>;
  private stats: PoolStats;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: Partial<SSHPoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.pool = new Map();
    this.stats = {
      poolHits: 0,
      poolMisses: 0,
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
      healthChecksPassed: 0,
      healthCheckFailures: 0
    };

    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  getStats(): PoolStats {
    return { ...this.stats };
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      void this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];

    for (const [poolKey, connections] of this.pool.entries()) {
      for (const metadata of connections) {
        // Only check idle connections
        if (!metadata.isActive) {
          healthCheckPromises.push(this.checkConnectionHealth(poolKey, metadata));
        }
      }
    }

    await Promise.allSettled(healthCheckPromises);
  }

  private async checkConnectionHealth(
    poolKey: string,
    metadata: ConnectionMetadata
  ): Promise<void> {
    try {
      // Verify connection using echo command
      const result = await metadata.connection.execCommand("echo ok");

      if (result.code === 0) {
        // Health check passed (exit code 0 indicates success)
        metadata.healthChecksPassed++;
        this.stats.healthChecksPassed++;
      } else {
        // Command failed
        throw new Error("Health check command failed");
      }
    } catch (error) {
      logError(
        new HostOperationError("Health check failed", metadata.host.name, "healthCheck", error),
        {
          metadata: {
            poolKey,
            failureCount: metadata.healthChecksFailed + 1,
            lastUsed: new Date(metadata.lastUsed).toISOString()
          }
        }
      );

      metadata.healthChecksFailed++;
      this.stats.healthCheckFailures++;
      await this.removeConnection(poolKey, metadata);
    }
  }

  async getConnection(host: HostConfig): Promise<NodeSSH> {
    const poolKey = generatePoolKey(host);
    const connections = this.pool.get(poolKey) || [];

    // Try to find idle connection
    const idleConnection = connections.find((c) => !c.isActive);

    if (idleConnection) {
      // Reuse existing connection (pool hit)
      idleConnection.isActive = true;
      idleConnection.lastUsed = Date.now();
      this.stats.poolHits++;
      this.updateConnectionStats();
      return idleConnection.connection;
    }

    // Check if we can create new connection
    if (connections.length >= this.config.maxConnections) {
      throw new Error(
        `Connection pool exhausted for ${poolKey} (max: ${this.config.maxConnections})`
      );
    }

    // Create new connection (pool miss)
    const connection = await this.createConnection(host);

    const metadata: ConnectionMetadata = {
      connection,
      host,
      lastUsed: Date.now(),
      created: Date.now(),
      healthChecksPassed: 0,
      healthChecksFailed: 0,
      isActive: true
    };

    connections.push(metadata);
    this.pool.set(poolKey, connections);

    this.stats.poolMisses++;
    this.updateConnectionStats();

    return connection;
  }

  private async createConnection(host: HostConfig): Promise<NodeSSH> {
    const ssh = new NodeSSH();

    // === Layer 1: Host Config Passed to Connection ===
    console.error("=== Creating SSH Connection ===");
    console.error("Host config:", JSON.stringify(host, null, 2));

    // Read private key content if path is provided
    // Using privateKey (content) instead of privateKeyPath is more reliable
    let privateKey: string | undefined;
    if (host.sshKeyPath) {
      // === Layer 2: File System Checks ===
      console.error("=== File System Checks ===");
      console.error("Key path:", host.sshKeyPath);

      const { existsSync, statSync } = await import("fs");
      const keyExists = existsSync(host.sshKeyPath);
      console.error("Exists:", keyExists);

      if (keyExists) {
        try {
          const stats = statSync(host.sshKeyPath);
          console.error("Is file:", stats.isFile());
          console.error("Permissions:", stats.mode.toString(8));
          console.error("Size:", stats.size, "bytes");
        } catch (statError) {
          console.error("Failed to stat key file:", statError);
        }
      }

      // === Layer 3: Private Key Reading ===
      console.error("=== Private Key Reading ===");
      try {
        privateKey = readFileSync(host.sshKeyPath, "utf-8");
        console.error("Key read successfully");
        console.error("Key length:", privateKey.length, "characters");
        console.error("Key first 50 chars:", privateKey.substring(0, 50));
        console.error("Key last 50 chars:", privateKey.substring(privateKey.length - 50));
        console.error("Has BEGIN marker:", privateKey.includes("BEGIN"));
        console.error("Has END marker:", privateKey.includes("END"));
      } catch (error) {
        console.error("Failed to read private key:");
        console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
        console.error("Error message:", error instanceof Error ? error.message : String(error));
        throw new HostOperationError(
          `Failed to read SSH private key at ${host.sshKeyPath}`,
          host.name,
          "createConnection",
          error
        );
      }
    } else {
      console.error("=== No Private Key Path ===");
      console.error("host.sshKeyPath is undefined or empty");
    }

    const connectionConfig = {
      host: host.host,
      port: host.port || 22,
      username: host.sshUser || process.env.USER || "root",
      privateKey,
      readyTimeout: this.config.connectionTimeoutMs
    };

    // === Layer 4: node-ssh Connection Config ===
    console.error("=== node-ssh Config ===");
    console.error("Connection config:", {
      host: connectionConfig.host,
      port: connectionConfig.port,
      username: connectionConfig.username,
      privateKey: connectionConfig.privateKey ? `${connectionConfig.privateKey.length} chars` : "undefined",
      readyTimeout: connectionConfig.readyTimeout
    });

    // === Layer 5: Actual Connection Attempt ===
    console.error("=== Attempting Connection ===");
    try {
      await ssh.connect(connectionConfig);
      console.error("=== Connection Success ===");
      console.error(`Successfully connected to ${host.name}`);
      return ssh;
    } catch (error) {
      console.error("=== Connection Failed ===");
      console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("Error message:", error instanceof Error ? error.message : String(error));
      console.error("Error stack:", error instanceof Error ? error.stack : "N/A");

      // Try to extract more details from the error object
      if (error && typeof error === "object") {
        console.error("Error details:", JSON.stringify(error, null, 2));
      }

      throw new HostOperationError(
        "SSH connection failed",
        host.name,
        "createConnection",
        error
      );
    }
  }

  private updateConnectionStats(): void {
    let active = 0;
    let idle = 0;
    let total = 0;

    for (const connections of this.pool.values()) {
      for (const conn of connections) {
        total++;
        if (conn.isActive) {
          active++;
        } else {
          idle++;
        }
      }
    }

    this.stats.activeConnections = active;
    this.stats.idleConnections = idle;
    this.stats.totalConnections = total;
  }

  async releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void> {
    const poolKey = generatePoolKey(host);
    const connections = this.pool.get(poolKey);

    if (!connections) {
      return;
    }

    const metadata = connections.find((c) => c.connection === connection);
    if (metadata) {
      metadata.isActive = false;
      metadata.lastUsed = Date.now();
      this.updateConnectionStats();

      // Start idle timeout timer
      this.scheduleIdleCleanup(poolKey, metadata);
    }
  }

  private scheduleIdleCleanup(poolKey: string, metadata: ConnectionMetadata): void {
    setTimeout(async () => {
      const now = Date.now();
      const idleTime = now - metadata.lastUsed;

      // Only close if still idle and exceeded timeout
      if (!metadata.isActive && idleTime >= this.config.idleTimeoutMs) {
        await this.removeConnection(poolKey, metadata);
      }
    }, this.config.idleTimeoutMs);
  }

  private async removeConnection(poolKey: string, metadata: ConnectionMetadata): Promise<void> {
    const connections = this.pool.get(poolKey);
    if (!connections) return;

    const index = connections.indexOf(metadata);
    if (index !== -1) {
      try {
        await metadata.connection.dispose();
      } catch (error) {
        logError(
          new HostOperationError(
            "Failed to dispose SSH connection",
            metadata.host.name,
            "dispose",
            error
          ),
          { metadata: { poolKey } }
        );
      }

      connections.splice(index, 1);

      if (connections.length === 0) {
        this.pool.delete(poolKey);
      }

      this.updateConnectionStats();
    }
  }

  async closeConnection(host: HostConfig): Promise<void> {
    const poolKey = generatePoolKey(host);
    const connections = this.pool.get(poolKey);

    if (!connections) {
      return;
    }

    const closePromises = connections.map(async (metadata) => {
      try {
        await metadata.connection.dispose();
      } catch (error) {
        logError(
          new HostOperationError(
            "Failed to dispose SSH connection during closeConnection",
            metadata.host.name,
            "closeConnection",
            error
          ),
          { metadata: { poolKey } }
        );
      }
    });

    await Promise.allSettled(closePromises);

    this.pool.delete(poolKey);
    this.updateConnectionStats();
  }

  async closeAll(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    const closePromises: Promise<void>[] = [];

    for (const connections of this.pool.values()) {
      for (const metadata of connections) {
        closePromises.push(
          (async (): Promise<void> => {
            try {
              await metadata.connection.dispose();
            } catch (error) {
              logError(
                new HostOperationError(
                  "Failed to dispose SSH connection during closeAll",
                  metadata.host.name,
                  "closeAll",
                  error
                ),
                { operation: "closeAll" }
              );
            }
          })()
        );
      }
    }

    await Promise.allSettled(closePromises);

    this.pool.clear();
    this.updateConnectionStats();
  }
}
