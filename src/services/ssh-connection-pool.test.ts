import { describe, it, expect, afterEach } from "vitest";
import type { SSHConnectionPool } from "./ssh-pool.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";

describe("SSHConnectionPoolImpl - DI Readiness", () => {
  let pool: SSHConnectionPool;

  afterEach(async () => {
    if (pool) await pool.closeAll();
  });

  it("implements SSHConnectionPool interface", () => {
    pool = new SSHConnectionPoolImpl({
      maxConnections: 1,
      enableHealthChecks: false
    });

    // Verify interface compliance
    expect(pool.getConnection).toBeDefined();
    expect(pool.releaseConnection).toBeDefined();
    expect(pool.closeConnection).toBeDefined();
    expect(pool.closeAll).toBeDefined();
    expect(pool.getStats).toBeDefined();
  });

  it("can be used polymorphically through interface", () => {
    // Demonstrates DI usage pattern
    const createPool = (): SSHConnectionPool => {
      return new SSHConnectionPoolImpl({ enableHealthChecks: false });
    };

    pool = createPool();
    expect(pool).toBeDefined();
    expect(pool.getStats()).toBeDefined();
  });
});
