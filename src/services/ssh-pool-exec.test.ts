import { describe, it, expect } from "vitest";

/**
 * DEPRECATED: ssh-pool-exec is now deprecated
 *
 * Tests have been migrated to:
 * - ssh-service.test.ts - For SSHService class tests
 * - ssh-connection-pool.test.ts - For connection pool tests
 */

describe("ssh-pool-exec (deprecated)", () => {
  it("module is deprecated in favor of ssh-service", () => {
    expect(true).toBe(true);
  });
});
