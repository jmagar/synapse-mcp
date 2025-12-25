import { describe, it, expect } from "vitest";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";

describe("SSHConnectionPoolImpl", () => {
  it("creates a pool instance", () => {
    const pool = new SSHConnectionPoolImpl({ maxConnections: 1 });
    expect(pool).toBeDefined();
  });
});
