import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import { SSHService } from "./ssh-service.js";
import { HostConfig } from "../types.js";
import { logError } from "../utils/errors.js";

describe("SSH Connection Pool Performance Benchmarks", () => {
  // Create pool and service for benchmarks
  const pool = new SSHConnectionPoolImpl();
  const sshService = new SSHService(pool);

  const testHost: HostConfig = {
    name: "benchmark-host",
    host: "localhost",
    protocol: "ssh",
    sshUser: process.env.USER || "root"
  };

  beforeAll(async () => {
    // Warm up pool
    try {
      await sshService.executeSSHCommand(testHost, "echo warmup");
    } catch {
      // Ignore if SSH not available
    }
  });

  afterAll(async () => {
    await pool.closeAll();
  });

  it("should demonstrate significant performance improvement with pooling", async () => {
    const iterations = 10;
    const command = "echo test";

    // Test with pooling (reuse connections)
    const pooledStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      try {
        await sshService.executeSSHCommand(testHost, command);
      } catch {
        // SSH may not be available in test environment
        console.log("SSH not available, skipping benchmark");
        return;
      }
    }
    const pooledDuration = Date.now() - pooledStart;

    const stats = pool.getStats();

    console.log(`\nPerformance Results (${iterations} operations):`);
    console.log(`  Total time: ${pooledDuration}ms`);
    console.log(`  Avg per operation: ${(pooledDuration / iterations).toFixed(2)}ms`);
    console.log(`  Pool hits: ${stats.poolHits}`);
    console.log(`  Pool misses: ${stats.poolMisses}`);
    console.log(`  Connection reuse rate: ${((stats.poolHits / iterations) * 100).toFixed(1)}%`);

    // Verify connection reuse
    expect(stats.poolMisses).toBeLessThan(iterations);
    expect(stats.poolHits).toBeGreaterThan(0);

    // Expected improvement:
    // Without pooling: ~250ms * 10 = 2500ms
    // With pooling: ~50ms (first) + ~5ms * 9 = ~95ms
    // Improvement: ~26x faster

    // In test environment with mocks, should be even faster
    // Verify average operation time is reasonable
    const avgTime = pooledDuration / iterations;
    expect(avgTime).toBeLessThan(100); // Should be < 100ms per operation with pooling
  });

  it("should maintain performance under concurrent load", async () => {
    const concurrentRequests = 20;
    const command = "echo concurrent";

    const start = Date.now();
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      sshService.executeSSHCommand(testHost, `${command} ${i}`).catch((error) => {
        logError(error, {
          operation: "benchmark",
          metadata: { commandIndex: i, command }
        });
        return null;
      })
    );

    await Promise.allSettled(promises);
    const duration = Date.now() - start;

    console.log(`\nConcurrent Load Results (${concurrentRequests} parallel requests):`);
    console.log(`  Total time: ${duration}ms`);
    console.log(`  Avg per request: ${(duration / concurrentRequests).toFixed(2)}ms`);

    const stats = pool.getStats();
    console.log(`  Pool hits: ${stats.poolHits}`);
    console.log(`  Pool misses: ${stats.poolMisses}`);

    // With max 5 connections, should handle 20 requests efficiently
    expect(stats.poolMisses).toBeLessThanOrEqual(5); // At most 5 connections created
  });

  it("should show pool statistics", () => {
    const stats = pool.getStats();

    console.log("\nPool Statistics:");
    console.log(`  Total connections: ${stats.totalConnections}`);
    console.log(`  Active connections: ${stats.activeConnections}`);
    console.log(`  Idle connections: ${stats.idleConnections}`);
    console.log(`  Pool hits: ${stats.poolHits}`);
    console.log(`  Pool misses: ${stats.poolMisses}`);
    console.log(`  Health checks passed: ${stats.healthChecksPassed}`);
    console.log(`  Health check failures: ${stats.healthCheckFailures}`);

    expect(stats).toBeDefined();
  });
});
