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
    console.log(`Discriminated union worst-case avg: ${avgTime.toFixed(4)}ms`);

    // With discriminated union, even worst case should be fast (O(1))
    expect(avgTime).toBeLessThan(0.5);
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

    console.log(`Discriminated union best-case avg: ${avgTime.toFixed(4)}ms`);

    // With discriminated union, best case should be very fast
    expect(avgTime).toBeLessThan(0.5);
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

    console.log(`Discriminated union average-case avg: ${avgTime.toFixed(4)}ms`);

    // With discriminated union, average case should be fast and consistent
    expect(avgTime).toBeLessThan(0.5);
  });
});
