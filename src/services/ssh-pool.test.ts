import { describe, it, expect } from "vitest";
import type { SSHPoolConfig, SSHConnectionPool } from "./ssh-pool.js";

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
