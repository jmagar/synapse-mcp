import { HostConfig } from "../types.js";

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
  connection: any; // NodeSSH instance (typed later)
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
  getConnection(host: HostConfig): Promise<any>;
  releaseConnection(host: HostConfig, connection: any): Promise<void>;
  closeConnection(host: HostConfig): Promise<void>;
  closeAll(): Promise<void>;
  getStats(): PoolStats;
}
