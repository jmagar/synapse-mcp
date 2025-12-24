import { describe, it, expect } from "vitest";
import { UnifiedHomelabSchema } from "./unified.js";

describe("Schema validation performance benchmarks", () => {
  it("should benchmark worst-case validation (last schema in union)", () => {
    const worstCase = {
      action: "image",
      subaction: "remove",
      host: "test",
      image: "nginx:latest",
      force: false
    };

    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      UnifiedHomelabSchema.safeParse(worstCase);
    }

    const end = performance.now();
    const avgTime = (end - start) / iterations;

    // Store baseline for comparison
    console.log(`Baseline worst-case avg: ${avgTime.toFixed(3)}ms`);

    // Current worst-case should be > 0.01ms (sequential validation)
    expect(avgTime).toBeGreaterThan(0.01);
  });

  it("should benchmark best-case validation (first schema in union)", () => {
    const bestCase = {
      action: "container",
      subaction: "list",
      state: "running"
    };

    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      UnifiedHomelabSchema.safeParse(bestCase);
    }

    const end = performance.now();
    const avgTime = (end - start) / iterations;

    console.log(`Baseline best-case avg: ${avgTime.toFixed(3)}ms`);

    // Best case should be fast even with sequential
    expect(avgTime).toBeLessThan(0.05);
  });

  it("should benchmark average-case validation (middle schema)", () => {
    const avgCase = {
      action: "compose",
      subaction: "status",
      host: "test",
      project: "plex"
    };

    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      UnifiedHomelabSchema.safeParse(avgCase);
    }

    const end = performance.now();
    const avgTime = (end - start) / iterations;

    console.log(`Baseline average-case avg: ${avgTime.toFixed(3)}ms`);

    expect(avgTime).toBeGreaterThan(0);
  });
});
