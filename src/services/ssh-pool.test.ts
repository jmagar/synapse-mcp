import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SSHPoolConfig } from "./ssh-pool.js";
import { generatePoolKey, SSHConnectionPoolImpl } from "./ssh-pool.js";
import { logError } from "../utils/errors.js";

vi.mock("../utils/errors.js", () => ({
  logError: vi.fn(),
  HostOperationError: class HostOperationError extends Error {
    constructor(
      message: string,
      public hostName: string,
      public operation: string,
      public cause?: unknown
    ) {
      super(message);
      this.name = "HostOperationError";
    }
  }
}));

// Mock node-ssh module
vi.mock("node-ssh", () => {
  class MockNodeSSH {
    async connect(): Promise<void> {
      return Promise.resolve();
    }
    async dispose(): Promise<void> {
      return Promise.resolve();
    }
    async execCommand(): Promise<{ code: number; stdout: string; stderr: string }> {
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    }
    isConnected(): boolean {
      return true;
    }
  }
  return {
    NodeSSH: MockNodeSSH
  };
});

describe("SSHPoolConfig type", () => {
  it("should accept valid pool configuration", () => {
    const config: SSHPoolConfig = {
      maxConnections: 5,
      idleTimeoutMs: 60000,
      connectionTimeoutMs: 5000,
      enableHealthChecks: true,
      healthCheckIntervalMs: 30000
    };
    expect(config).toBeDefined();
  });
});

describe("generatePoolKey", () => {
  it("should generate key with default SSH port", () => {
    const host = {
      name: "server1",
      host: "192.168.1.100",
      protocol: "ssh" as const
    };
    expect(generatePoolKey(host)).toBe("server1:22");
  });

  it("should generate key with custom port", () => {
    const host = {
      name: "server2",
      host: "192.168.1.200",
      protocol: "ssh" as const,
      port: 2222
    };
    expect(generatePoolKey(host)).toBe("server2:2222");
  });

  it("should use host name for consistent keying", () => {
    const host1 = {
      name: "myserver",
      host: "192.168.1.100",
      protocol: "ssh" as const
    };
    const host2 = {
      name: "myserver",
      host: "192.168.1.101", // Different IP, same name
      protocol: "ssh" as const
    };
    expect(generatePoolKey(host1)).toBe(generatePoolKey(host2));
  });
});

describe("SSHConnectionPoolImpl", () => {
  it("should initialize with default configuration", () => {
    const pool = new SSHConnectionPoolImpl();
    const stats = pool.getStats();

    expect(stats.activeConnections).toBe(0);
    expect(stats.idleConnections).toBe(0);
    expect(stats.totalConnections).toBe(0);
    expect(stats.poolHits).toBe(0);
    expect(stats.poolMisses).toBe(0);
  });

  it("should initialize with custom configuration", () => {
    const config: SSHPoolConfig = {
      maxConnections: 10,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 3000,
      enableHealthChecks: false,
      healthCheckIntervalMs: 15000
    };
    const pool = new SSHConnectionPoolImpl(config);
    expect(pool).toBeDefined();
  });
});

describe("SSHConnectionPoolImpl - connection management", () => {
  let pool: SSHConnectionPoolImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = new SSHConnectionPoolImpl({ enableHealthChecks: false });
  });

  afterEach(async () => {
    await pool.closeAll();
  });

  it("should create new connection on first request", async () => {
    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const connection = await pool.getConnection(host);

    expect(connection).toBeDefined();
    const stats = pool.getStats();
    expect(stats.poolMisses).toBe(1);
    expect(stats.poolHits).toBe(0);
    expect(stats.activeConnections).toBe(1);
    expect(stats.totalConnections).toBe(1);
  });

  it("should reuse existing connection on second request", async () => {
    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const conn1 = await pool.getConnection(host);
    await pool.releaseConnection(host, conn1);

    const conn2 = await pool.getConnection(host);

    expect(conn1).toBe(conn2); // Same connection object
    const stats = pool.getStats();
    expect(stats.poolMisses).toBe(1); // Only one creation
    expect(stats.poolHits).toBe(1);   // One reuse
    expect(stats.activeConnections).toBe(1);
    expect(stats.totalConnections).toBe(1);
  });

  it("should throw error when pool is exhausted", async () => {
    const limitedPool = new SSHConnectionPoolImpl({
      maxConnections: 2,
      enableHealthChecks: false
    });

    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const conn1 = await limitedPool.getConnection(host);
    await limitedPool.getConnection(host); // conn2 - exhaust the pool

    // Third connection should fail
    await expect(limitedPool.getConnection(host)).rejects.toThrow("Connection pool exhausted");

    // Release one and try again
    await limitedPool.releaseConnection(host, conn1);
    const conn3 = await limitedPool.getConnection(host);
    expect(conn3).toBe(conn1); // Should reuse released connection

    await limitedPool.closeAll();
  });

  it("should close all connections for specific host", async () => {
    const host1 = {
      name: "host1",
      host: "192.168.1.1",
      protocol: "ssh" as const
    };

    const host2 = {
      name: "host2",
      host: "192.168.1.2",
      protocol: "ssh" as const
    };

    await pool.getConnection(host1);
    await pool.getConnection(host2);

    let stats = pool.getStats();
    expect(stats.totalConnections).toBe(2);

    await pool.closeConnection(host1);

    stats = pool.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it("should close all connections", async () => {
    const host1 = {
      name: "host1",
      host: "192.168.1.1",
      protocol: "ssh" as const
    };

    const host2 = {
      name: "host2",
      host: "192.168.1.2",
      protocol: "ssh" as const
    };

    await pool.getConnection(host1);
    await pool.getConnection(host2);

    let stats = pool.getStats();
    expect(stats.totalConnections).toBe(2);

    await pool.closeAll();

    stats = pool.getStats();
    expect(stats.totalConnections).toBe(0);
    expect(stats.activeConnections).toBe(0);
    expect(stats.idleConnections).toBe(0);
  });
});

describe("SSHConnectionPoolImpl - health checks", () => {
  it("should perform health checks on idle connections", async () => {
    vi.useFakeTimers();

    const pool = new SSHConnectionPoolImpl({
      enableHealthChecks: true,
      healthCheckIntervalMs: 10000,
      idleTimeoutMs: 300000 // Long timeout to prevent cleanup during test
    });

    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const connection = await pool.getConnection(host);
    await pool.releaseConnection(host, connection);

    // Fast-forward to trigger health check
    await vi.advanceTimersByTimeAsync(10000);

    const stats = pool.getStats();
    expect(stats.healthChecksPassed).toBeGreaterThan(0);

    await pool.closeAll();
    vi.useRealTimers();
  });

  it("should remove failed connections on health check failure", async () => {
    vi.useFakeTimers();

    const pool = new SSHConnectionPoolImpl({
      enableHealthChecks: true,
      healthCheckIntervalMs: 10000
    });

    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const connection = await pool.getConnection(host);

    // Mock the execCommand to fail on health check
    connection.execCommand = vi.fn().mockRejectedValue(new Error("Connection failed"));
    connection.isConnected = vi.fn().mockReturnValue(false);

    await pool.releaseConnection(host, connection);

    const statsBefore = pool.getStats();
    expect(statsBefore.totalConnections).toBe(1);

    // Fast-forward to trigger health check
    await vi.advanceTimersByTimeAsync(10000);

    const statsAfter = pool.getStats();
    expect(statsAfter.healthCheckFailures).toBeGreaterThan(0);
    expect(statsAfter.totalConnections).toBe(0); // Connection removed

    await pool.closeAll();
    vi.useRealTimers();
  });

  it("should log structured error when health check fails", async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    const pool = new SSHConnectionPoolImpl({
      enableHealthChecks: true,
      healthCheckIntervalMs: 10000
    });

    const host = {
      name: "testhost",
      host: "localhost",
      protocol: "ssh" as const
    };

    const connection = await pool.getConnection(host);
    connection.execCommand = vi.fn().mockRejectedValue(new Error("Health check failed"));
    connection.isConnected = vi.fn().mockReturnValue(false);

    await pool.releaseConnection(host, connection);

    await vi.advanceTimersByTimeAsync(10000);

    expect(vi.mocked(logError)).toHaveBeenCalled();

    await pool.closeAll();
    vi.useRealTimers();
  });
});
