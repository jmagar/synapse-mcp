# Parallelize Stats Collection Implementation Plan

**Created:** 11:11:31 AM | 12/24/2025 (EST)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize stats collection in unified.ts from O(n²) sequential execution to parallel processing, reducing execution time from ~100s to ~5s.

**Architecture:** Replace nested sequential loops with Promise.allSettled at both host and container levels. Maintain existing limit of 20 containers per host. Handle partial failures gracefully without failing entire operation.

**Tech Stack:** TypeScript, Promise.allSettled, Vitest for benchmarking

---

## Performance Analysis

**Current Implementation (Lines 285-299):**
- Outer loop: 10 hosts × sequential
- Inner loop: 20 containers × sequential (500ms per call)
- Total: 10 × 20 × 500ms = 100 seconds

**Target Implementation:**
- Outer loop: 10 hosts × parallel (Promise.allSettled)
- Inner loop: 20 containers × parallel (Promise.allSettled per host)
- Total: max(500ms per container) ≈ 500ms + overhead ≈ 5 seconds
- Improvement: 20× faster

---

## Implementation Steps

### Step 1: Write benchmark test for current sequential performance

**Test:** `src/tools/unified.integration.test.ts` (new test)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as dockerService from "../services/docker.js";

describe("Container stats collection performance", () => {
  beforeEach(() => {
    // Mock getContainerStats to simulate 500ms delay
    vi.spyOn(dockerService, "getContainerStats").mockImplementation(
      async (id, host) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          containerId: id,
          containerName: `container-${id}`,
          cpuPercent: 10.5,
          memoryUsage: 1024 * 1024 * 100,
          memoryLimit: 1024 * 1024 * 500,
          memoryPercent: 20.0,
          networkRx: 1024,
          networkTx: 2048,
          blockRead: 512,
          blockWrite: 256,
        };
      }
    );

    // Mock listContainers to return 5 containers (reduced for faster testing)
    vi.spyOn(dockerService, "listContainers").mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `container-${i}`,
        name: `test-${i}`,
        image: "test:latest",
        state: "running" as const,
        status: "Up 1 hour",
        created: new Date().toISOString(),
        ports: [],
        labels: {},
        hostName: "test-host",
      }))
    );
  });

  it("should measure sequential stats collection baseline performance", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock
      .calls[0][2];

    const startTime = Date.now();

    const result = await handler({
      action: "container",
      subaction: "stats",
      response_format: "json",
    });

    const duration = Date.now() - startTime;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("stats");

    // 2 hosts × 5 containers × 500ms = 5000ms sequential
    // Allow some overhead
    expect(duration).toBeGreaterThan(4500);
    expect(duration).toBeLessThan(6000);

    console.log(`Sequential baseline: ${duration}ms`);
  });
});
```

**Run:** `pnpm vitest src/tools/unified.integration.test.ts -t "sequential stats" --no-coverage`

**Expected:** PASS with duration ~5000ms (2 hosts × 5 containers × 500ms)

---

### Step 2: Commit benchmark test

```bash
git add src/tools/unified.integration.test.ts
git commit -m "$(cat <<'EOF'
test: add performance benchmark for sequential stats collection

Establishes baseline for stats collection performance before parallelization.
Current: O(n²) sequential - 2 hosts × 5 containers × 500ms = ~5s

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Step 3: Write test for parallel stats collection

**Test:** `src/tools/unified.integration.test.ts` (add new test to existing describe block)

```typescript
it("should collect stats in parallel across hosts and containers", async () => {
  const { registerUnifiedTool } = await import("./unified.js");
  const mockServer = {
    registerTool: vi.fn(),
  } as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

  registerUnifiedTool(mockServer);

  const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock
    .calls[0][2];

  const startTime = Date.now();

  const result = await handler({
    action: "container",
    subaction: "stats",
    response_format: "json",
  });

  const duration = Date.now() - startTime;

  expect(result.isError).toBe(false);

  const output = JSON.parse(result.content[0].text);
  expect(output.stats).toHaveLength(10); // 2 hosts × 5 containers

  // Parallel: max(500ms) + overhead ≈ 600-800ms
  expect(duration).toBeLessThan(1000);

  console.log(`Parallel optimized: ${duration}ms`);
  console.log(`Speedup: ${(5000 / duration).toFixed(1)}x`);
});
```

**Run:** `pnpm vitest src/tools/unified.integration.test.ts -t "parallel across" --no-coverage`

**Expected:** FAIL - "expected 5600 to be less than 1000" (still using sequential implementation)

---

### Step 4: Implement parallel stats collection helper function

**Modify:** `src/tools/unified.ts` (add helper before handler)

**Location:** After imports, before `registerUnifiedTool` function

```typescript
/**
 * Collect container stats in parallel across hosts and containers
 *
 * @param targetHosts - Hosts to collect stats from
 * @param maxContainersPerHost - Maximum containers to query per host (default: 20)
 * @returns Array of stats with host information
 */
async function collectStatsParallel(
  targetHosts: HostConfig[],
  maxContainersPerHost: number = 20
): Promise<Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }>> {
  // Parallel collection across hosts
  const hostResults = await Promise.allSettled(
    targetHosts.map(async (host) => {
      try {
        // Get running containers for this host
        const containers = await listContainers([host], { state: "running" });

        // Limit to maxContainersPerHost
        const limitedContainers = containers.slice(0, maxContainersPerHost);

        // Parallel collection across containers for this host
        const containerResults = await Promise.allSettled(
          limitedContainers.map(async (container) => {
            const stats = await getContainerStats(container.id, host);
            return { stats, host: host.name };
          })
        );

        // Filter successful container stat collections
        return containerResults
          .filter((result): result is PromiseFulfilledResult<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }> =>
            result.status === "fulfilled"
          )
          .map((result) => result.value);
      } catch (error) {
        console.error(`Failed to collect stats from host ${host.name}:`, error);
        return [];
      }
    })
  );

  // Flatten results from all hosts
  const allStats: Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }> = [];

  for (const result of hostResults) {
    if (result.status === "fulfilled") {
      allStats.push(...result.value);
    } else {
      console.error("Host stats collection failed:", result.reason);
    }
  }

  return allStats;
}
```

---

### Step 5: Run test to verify implementation fails correctly

**Run:** `pnpm vitest src/tools/unified.integration.test.ts -t "parallel across" --no-coverage`

**Expected:** Still FAIL (helper function exists but not used in handler yet)

---

### Step 6: Refactor handler to use parallel stats collection

**Modify:** `src/tools/unified.ts:285-299` (replace sequential loop)

**Old code:**
```typescript
for (const host of targetHosts) {
  try {
    const containers = await listContainers([host], { state: "running" });
    for (const c of containers.slice(0, 20)) {
      try {
        const stats = await getContainerStats(c.id, host);
        allStats.push({ stats, host: host.name });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
}
```

**New code:**
```typescript
const allStats = await collectStatsParallel(targetHosts, 20);
```

**Complete change:**
Replace lines 280-299 with:

```typescript
        // Collect stats in parallel across all hosts and containers
        const allStats = await collectStatsParallel(targetHosts, 20);

        const output = { stats: allStats.map((s) => ({ ...s.stats, host: s.host })) };
        const text =
          params.response_format === ResponseFormat.JSON
            ? JSON.stringify(output, null, 2)
            : formatMultiStatsMarkdown(allStats);

        return successResponse(text, output);
```

---

### Step 7: Run test to verify parallel implementation passes

**Run:** `pnpm vitest src/tools/unified.integration.test.ts -t "parallel across" --no-coverage`

**Expected:** PASS with duration < 1000ms

---

### Step 8: Test partial failure handling

**Test:** Add to `src/tools/unified.integration.test.ts`

```typescript
it("should handle partial failures gracefully", async () => {
  // Mock some stats calls to fail
  vi.spyOn(dockerService, "getContainerStats").mockImplementation(
    async (id, host) => {
      if (id === "container-2") {
        throw new Error("Container not responding");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        containerId: id,
        containerName: `container-${id}`,
        cpuPercent: 10.5,
        memoryUsage: 1024 * 1024 * 100,
        memoryLimit: 1024 * 1024 * 500,
        memoryPercent: 20.0,
        networkRx: 1024,
        networkTx: 2048,
        blockRead: 512,
        blockWrite: 256,
      };
    }
  );

  const { registerUnifiedTool } = await import("./unified.js");
  const mockServer = {
    registerTool: vi.fn(),
  } as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

  registerUnifiedTool(mockServer);

  const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock
    .calls[0][2];

  const result = await handler({
    action: "container",
    subaction: "stats",
    response_format: "json",
  });

  expect(result.isError).toBe(false);

  const output = JSON.parse(result.content[0].text);

  // Should have stats for 8 containers (10 total - 2 that failed)
  expect(output.stats.length).toBeGreaterThan(0);
  expect(output.stats.length).toBeLessThan(10);
});
```

**Run:** `pnpm vitest src/tools/unified.integration.test.ts -t "partial failures" --no-coverage`

**Expected:** PASS (implementation already handles this via Promise.allSettled)

---

### Step 9: Run all tests to verify no regressions

**Run:** `pnpm vitest src/tools/unified.integration.test.ts --no-coverage`

**Expected:** All tests PASS

---

### Step 10: Run type checker

**Run:** `pnpm tsc --noEmit`

**Expected:** No type errors

---

### Step 11: Run linter

**Run:** `pnpm run lint`

**Expected:** No linting errors

---

### Step 12: Commit parallel implementation

```bash
git add src/tools/unified.ts src/tools/unified.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: parallelize container stats collection for 20x speedup

Replace O(n²) sequential loops with Promise.allSettled for parallel execution:
- Outer loop: hosts processed in parallel
- Inner loop: containers per host processed in parallel
- Maintains 20 container limit per host
- Graceful handling of partial failures

Performance improvement:
- Before: 10 hosts × 20 containers × 500ms = 100s sequential
- After: max(500ms) + overhead ≈ 5s parallel
- Speedup: ~20x faster

Tests verify:
- Parallel execution reduces duration by >5x
- Partial failures don't break entire operation
- All stats collected successfully in happy path

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Step 13: Write documentation comment for performance characteristics

**Modify:** `src/tools/unified.ts` - Update JSDoc comment on `collectStatsParallel`

```typescript
/**
 * Collect container stats in parallel across hosts and containers
 *
 * Performance characteristics:
 * - Hosts: Parallel execution via Promise.allSettled
 * - Containers per host: Parallel execution via Promise.allSettled
 * - Complexity: O(max(container_latency)) instead of O(hosts × containers)
 * - Speedup: ~20x for 10 hosts × 20 containers (100s → 5s)
 *
 * Error handling:
 * - Host failures: Logged to console.error, operation continues
 * - Container failures: Skipped silently, partial results returned
 * - Network timeouts: Handled by dockerode timeout config
 *
 * @param targetHosts - Hosts to collect stats from
 * @param maxContainersPerHost - Maximum containers to query per host (default: 20)
 * @returns Array of stats with host information (partial results on failures)
 */
```

---

### Step 14: Run full test suite

**Run:** `pnpm test`

**Expected:** All tests PASS

---

### Step 15: Commit documentation

```bash
git add src/tools/unified.ts
git commit -m "$(cat <<'EOF'
docs: document performance characteristics of parallel stats collection

Add comprehensive JSDoc explaining:
- Parallel execution strategy
- Performance improvements (O(n²) → O(max(latency)))
- Error handling behavior
- Expected speedup metrics

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After implementation, verify:

- [ ] Sequential baseline test passes (~5s for 2 hosts × 5 containers)
- [ ] Parallel implementation test passes (<1s for same workload)
- [ ] Partial failure test passes (some containers fail, operation continues)
- [ ] Type checking passes (`pnpm tsc --noEmit`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] Full test suite passes (`pnpm test`)
- [ ] Performance improvement ≥5× documented
- [ ] Error handling preserves existing behavior (silent failures)

---

## Performance Metrics

**Expected results:**

| Scenario | Sequential | Parallel | Speedup |
|----------|-----------|----------|---------|
| 2 hosts × 5 containers | ~5s | ~600ms | 8.3× |
| 10 hosts × 20 containers | ~100s | ~5s | 20× |
| 1 host × 20 containers | ~10s | ~500ms | 20× |

**Limiting factors:**
- Network latency to Docker API
- Docker daemon response time
- System resources (CPU/memory for parallel requests)

---

## Risk Mitigation

**Potential issues:**

1. **Docker daemon overload**: Too many parallel requests
   - Mitigation: Limit to 20 containers per host (existing limit)
   - Each host processes in parallel, but capped per-host

2. **Memory usage spike**: Many concurrent promises
   - Mitigation: Stats objects are small (~200 bytes each)
   - Max: 10 hosts × 20 containers × 200 bytes = 40KB total

3. **Timeout handling**: Some hosts very slow
   - Mitigation: Promise.allSettled doesn't fail on timeout
   - Slow hosts return empty results, fast hosts proceed

4. **Type safety**: Complex nested types
   - Mitigation: Explicit type annotations on Promise.allSettled
   - TypeScript validates all return types

---

## Alternatives Considered

1. **Worker threads**: Too complex for this use case
2. **Streaming results**: Would require API changes
3. **Batching**: Promise.allSettled already handles this optimally
4. **Rate limiting**: Not needed due to per-host container cap

---

## Success Criteria

- ✅ Performance improvement ≥5× measured in tests
- ✅ No change to external API (same inputs/outputs)
- ✅ Graceful handling of partial failures
- ✅ Type safety maintained (strict TypeScript)
- ✅ All existing tests pass
- ✅ Code coverage maintained or improved
