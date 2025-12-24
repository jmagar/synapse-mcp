import { HostConfig } from "../types.js";
import { NodeSSH } from "node-ssh";

/**
 * SSH connection pool configuration
 */
export interface SSHPoolConfig {
  maxConnections: number;        // Max connections per host (default: 5)
  idleTimeoutMs: number;          // Idle timeout before closing (default: 60000)
  connectionTimeoutMs: number;    // Connection timeout (default: 5000)
  enableHealthChecks: boolean;    // Enable periodic health checks (default: true)
  healthCheckIntervalMs: number;  // Health check interval (default: 30000)
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
  poolHits: number;           // Successful connection reuse
  poolMisses: number;         // New connections created
  activeConnections: number;  // Currently active
  idleConnections: number;    // Currently idle
  totalConnections: number;   // Total in pool
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
    // Placeholder for health check implementation
  }

  async getConnection(host: HostConfig): Promise<NodeSSH> {
    const poolKey = generatePoolKey(host);
    const connections = this.pool.get(poolKey) || [];

    // Try to find idle connection
    const idleConnection = connections.find(c => !c.isActive);

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

    await ssh.connect({
      host: host.host,
      port: host.port || 22,
      username: host.sshUser || process.env.USER || "root",
      privateKeyPath: host.sshKeyPath,
      readyTimeout: this.config.connectionTimeoutMs
    });

    return ssh;
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

    const metadata = connections.find(c => c.connection === connection);
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
        // Ignore disposal errors
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

    const closePromises = connections.map(metadata =>
      metadata.connection.dispose().catch(() => {
        // Ignore disposal errors
      })
    );

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

    for (const [poolKey, connections] of this.pool.entries()) {
      for (const metadata of connections) {
        closePromises.push(
          metadata.connection.dispose().catch(() => {
            // Ignore disposal errors
          })
        );
      }
    }

    await Promise.allSettled(closePromises);

    this.pool.clear();
    this.updateConnectionStats();
  }
}
