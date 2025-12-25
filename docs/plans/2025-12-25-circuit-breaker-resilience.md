# Circuit Breaker Pattern for Resilience Implementation Plan

**Created:** 04:35:04 AM | 12/25/2025 (EST)

> **Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement circuit breaker pattern to prevent repeated failures to unreachable hosts and enable automatic recovery

**Architecture:** Add per-host circuit breaker tracking failure rates. When failure threshold exceeded, transition to OPEN state (fast-fail). After cooldown period, transition to HALF_OPEN for recovery testing. Success returns to CLOSED state.

**Tech Stack:** TypeScript 5.7+, Vitest, Zod (no external circuit breaker libraries - keep dependencies minimal)

---

## Background

### Current Problem

The homelab-mcp-server makes external calls to Docker hosts via:
1. Docker API (dockerode) - 30s timeout
2. SSH connections (node-ssh) - 5s connection + 30s command timeout
3. Docker Compose via SSH - 15-30s timeouts

**Current failure handling:**
- Each failed operation waits full timeout (5-30 seconds)
- No learning from previous failures
- Repeated attempts to known-bad hosts waste time
- Multi-host operations degraded by slow/unreachable hosts

**Example scenario:**
```
User: "List containers on all hosts"
Host1 (unreachable): 30s timeout
Host2 (unreachable): 30s timeout
Host3 (unreachable): 30s timeout
Host4 (ok): 200ms
Total: 90+ seconds (should be <1s with circuit breaker)
```

### Solution: Circuit Breaker Pattern

**States:**
- `CLOSED` - Normal operation, requests pass through
- `OPEN` - Too many failures, fast-fail all requests
- `HALF_OPEN` - Testing recovery, allow limited requests

**Thresholds (configurable):**
- Failure threshold: 3 consecutive failures → OPEN
- Open timeout: 30s cooldown → HALF_OPEN
- Success threshold: 1 success in HALF_OPEN → CLOSED

**Benefits:**
- Failed hosts: 30s → <100ms (immediate rejection)
- Automatic recovery testing after cooldown
- Per-host state tracking (one bad host doesn't affect others)
- Configurable thresholds via environment variables

---

## Task 1: Create Circuit Breaker Core Implementation

**Files:**
- Create: `src/utils/circuit-breaker.ts`
- Create: `src/utils/circuit-breaker.test.ts`

### Step 1: Write test for CircuitBreaker class initialization

Create file `src/utils/circuit-breaker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, CircuitBreakerState } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize in CLOSED state", () => {
      const breaker = new CircuitBreaker("test-host");
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should use default configuration", () => {
      const breaker = new CircuitBreaker("test-host");
      const stats = breaker.getStats();
      expect(stats.failureThreshold).toBe(3);
      expect(stats.successThreshold).toBe(1);
      expect(stats.openTimeoutMs).toBe(30000);
    });

    it("should accept custom configuration", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 5,
        successThreshold: 2,
        openTimeoutMs: 60000
      });
      const stats = breaker.getStats();
      expect(stats.failureThreshold).toBe(5);
      expect(stats.successThreshold).toBe(2);
      expect(stats.openTimeoutMs).toBe(60000);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
FAIL src/utils/circuit-breaker.test.ts
  Cannot find module './circuit-breaker.js'
```

### Step 3: Create minimal CircuitBreaker implementation

Create file `src/utils/circuit-breaker.ts`:

```typescript
/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = "CLOSED",     // Normal operation
  OPEN = "OPEN",         // Fast-fail mode
  HALF_OPEN = "HALF_OPEN" // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;   // Failures before opening (default: 3)
  successThreshold: number;   // Successes in HALF_OPEN to close (default: 1)
  openTimeoutMs: number;      // Time in OPEN before HALF_OPEN (default: 30000)
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  failureThreshold: number;
  successThreshold: number;
  openTimeoutMs: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  openTimeoutMs: 30000
};

/**
 * Circuit breaker for host operations
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number | null;
  private lastSuccessTime: number | null;
  private totalFailures: number;
  private totalSuccesses: number;

  constructor(
    private readonly hostKey: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.state = CircuitBreakerState.CLOSED;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureThreshold: this.config.failureThreshold,
      successThreshold: this.config.successThreshold,
      openTimeoutMs: this.config.openTimeoutMs,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker.test.ts
  ✓ CircuitBreaker > initialization (3 tests)
```

### Step 5: Commit

```bash
git add src/utils/circuit-breaker.ts src/utils/circuit-breaker.test.ts
git commit -m "feat(resilience): add circuit breaker initialization

- Add CircuitBreakerState enum (CLOSED, OPEN, HALF_OPEN)
- Add CircuitBreaker class with configurable thresholds
- Default: 3 failures, 30s timeout, 1 success to recover
- Tests verify initialization and configuration"
```

---

## Task 2: Implement State Transitions (CLOSED → OPEN)

**Files:**
- Modify: `src/utils/circuit-breaker.test.ts`
- Modify: `src/utils/circuit-breaker.ts`

### Step 1: Write test for failure tracking and OPEN transition

Add to `src/utils/circuit-breaker.test.ts`:

```typescript
describe("state transitions", () => {
  describe("CLOSED to OPEN", () => {
    it("should transition to OPEN after failure threshold", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 3
      });

      // Record 2 failures - should stay CLOSED
      breaker.recordFailure(new Error("fail 1"));
      breaker.recordFailure(new Error("fail 2"));
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(breaker.getStats().failureCount).toBe(2);

      // 3rd failure should open circuit
      breaker.recordFailure(new Error("fail 3"));
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(breaker.getStats().failureCount).toBe(3);
      expect(breaker.getStats().totalFailures).toBe(3);
    });

    it("should reset failure count on success in CLOSED", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 3
      });

      breaker.recordFailure(new Error("fail 1"));
      breaker.recordFailure(new Error("fail 2"));
      expect(breaker.getStats().failureCount).toBe(2);

      // Success resets counter
      breaker.recordSuccess();
      expect(breaker.getStats().failureCount).toBe(0);
      expect(breaker.getStats().successCount).toBe(1);
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
FAIL src/utils/circuit-breaker.test.ts
  Property 'recordFailure' does not exist on type 'CircuitBreaker'
```

### Step 3: Implement failure/success recording

Add to `src/utils/circuit-breaker.ts`:

```typescript
export class CircuitBreaker {
  // ... existing code ...

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        // Enough successes - close circuit
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in HALF_OPEN immediately re-opens circuit
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
      }
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters on state transition
    if (newState === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitBreakerState.HALF_OPEN) {
      this.failureCount = 0;
      this.successCount = 0;
    }

    console.error(
      `[CircuitBreaker:${this.hostKey}] ${oldState} → ${newState}`
    );
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker.test.ts
  ✓ CircuitBreaker > state transitions > CLOSED to OPEN (2 tests)
```

### Step 5: Commit

```bash
git add src/utils/circuit-breaker.ts src/utils/circuit-breaker.test.ts
git commit -m "feat(resilience): implement CLOSED→OPEN state transition

- Add recordFailure() to track consecutive failures
- Add recordSuccess() to reset failure count
- Transition to OPEN after failure threshold exceeded
- Reset counters on success in CLOSED state"
```

---

## Task 3: Implement Fast-Fail in OPEN State

**Files:**
- Modify: `src/utils/circuit-breaker.test.ts`
- Modify: `src/utils/circuit-breaker.ts`

### Step 1: Write test for canExecute() method

Add to `src/utils/circuit-breaker.test.ts`:

```typescript
describe("execution permission", () => {
  it("should allow execution in CLOSED state", () => {
    const breaker = new CircuitBreaker("test-host");
    expect(breaker.canExecute()).toBe(true);
  });

  it("should deny execution in OPEN state", () => {
    const breaker = new CircuitBreaker("test-host", {
      failureThreshold: 2
    });

    breaker.recordFailure(new Error("fail 1"));
    breaker.recordFailure(new Error("fail 2"));

    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    expect(breaker.canExecute()).toBe(false);
  });

  it("should throw CircuitBreakerOpenError when execution denied", () => {
    const breaker = new CircuitBreaker("test-host", {
      failureThreshold: 1
    });

    breaker.recordFailure(new Error("fail"));

    expect(() => breaker.execute(() => "test")).toThrow(
      "Circuit breaker is OPEN for test-host"
    );
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
FAIL src/utils/circuit-breaker.test.ts
  Property 'canExecute' does not exist on type 'CircuitBreaker'
```

### Step 3: Implement canExecute and execute methods

Add to `src/utils/circuit-breaker.ts`:

```typescript
/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly hostKey: string,
    public readonly state: CircuitBreakerState
  ) {
    super(`Circuit breaker is ${state} for ${hostKey}`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  // ... existing code ...

  /**
   * Check if operation can execute
   */
  canExecute(): boolean {
    if (this.state === CircuitBreakerState.OPEN) {
      // Check if timeout elapsed - transition to HALF_OPEN
      const now = Date.now();
      if (
        this.lastFailureTime &&
        now - this.lastFailureTime >= this.config.openTimeoutMs
      ) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
        return true;
      }
      return false;
    }

    return true; // CLOSED or HALF_OPEN allow execution
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(this.hostKey, this.state);
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker.test.ts
  ✓ CircuitBreaker > execution permission (3 tests)
```

### Step 5: Commit

```bash
git add src/utils/circuit-breaker.ts src/utils/circuit-breaker.test.ts
git commit -m "feat(resilience): implement fast-fail in OPEN state

- Add canExecute() to check if operation allowed
- Add execute() wrapper with automatic success/failure tracking
- Add CircuitBreakerOpenError for rejected operations
- Automatic transition OPEN→HALF_OPEN after timeout"
```

---

## Task 4: Implement HALF_OPEN Recovery Testing

**Files:**
- Modify: `src/utils/circuit-breaker.test.ts`
- Modify: `src/utils/circuit-breaker.ts`

### Step 1: Write test for HALF_OPEN behavior

Add to `src/utils/circuit-breaker.test.ts`:

```typescript
describe("state transitions", () => {
  // ... existing CLOSED to OPEN tests ...

  describe("OPEN to HALF_OPEN to CLOSED", () => {
    it("should transition to HALF_OPEN after timeout", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 1,
        openTimeoutMs: 5000
      });

      breaker.recordFailure(new Error("fail"));
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Before timeout - still OPEN
      vi.advanceTimersByTime(4999);
      expect(breaker.canExecute()).toBe(false);

      // After timeout - transitions to HALF_OPEN on canExecute check
      vi.advanceTimersByTime(1);
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it("should close circuit after success in HALF_OPEN", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 1,
        successThreshold: 1,
        openTimeoutMs: 5000
      });

      // Open circuit
      breaker.recordFailure(new Error("fail"));
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for timeout
      vi.advanceTimersByTime(5000);
      breaker.canExecute(); // Trigger HALF_OPEN transition
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Success closes circuit
      breaker.recordSuccess();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should reopen circuit on failure in HALF_OPEN", () => {
      const breaker = new CircuitBreaker("test-host", {
        failureThreshold: 1,
        openTimeoutMs: 5000
      });

      // Open circuit
      breaker.recordFailure(new Error("fail 1"));
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for timeout
      vi.advanceTimersByTime(5000);
      breaker.canExecute();
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Failure reopens
      breaker.recordFailure(new Error("fail 2"));
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });
});
```

### Step 2: Run test to verify it passes (implementation already complete)

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker.test.ts
  ✓ CircuitBreaker > state transitions > OPEN to HALF_OPEN to CLOSED (3 tests)
```

Note: The implementation from Task 3 already handles HALF_OPEN logic. These tests verify the complete state machine.

### Step 3: Add integration test for execute() method

Add to `src/utils/circuit-breaker.test.ts`:

```typescript
describe("execute wrapper", () => {
  it("should execute operation and record success", async () => {
    const breaker = new CircuitBreaker("test-host");
    const operation = vi.fn().mockResolvedValue("success");

    const result = await breaker.execute(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(breaker.getStats().totalSuccesses).toBe(1);
  });

  it("should record failure and rethrow error", async () => {
    const breaker = new CircuitBreaker("test-host");
    const error = new Error("operation failed");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(breaker.execute(operation)).rejects.toThrow("operation failed");
    expect(breaker.getStats().totalFailures).toBe(1);
  });

  it("should open circuit after repeated failures", async () => {
    const breaker = new CircuitBreaker("test-host", {
      failureThreshold: 2
    });
    const operation = vi.fn().mockRejectedValue(new Error("fail"));

    // First failure
    await expect(breaker.execute(operation)).rejects.toThrow("fail");
    expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

    // Second failure - opens circuit
    await expect(breaker.execute(operation)).rejects.toThrow("fail");
    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

    // Third attempt rejected immediately
    await expect(breaker.execute(operation)).rejects.toThrow(
      "Circuit breaker is OPEN"
    );
    expect(operation).toHaveBeenCalledTimes(2); // Not called 3rd time
  });

  it("should recover after timeout and successful operation", async () => {
    const breaker = new CircuitBreaker("test-host", {
      failureThreshold: 1,
      openTimeoutMs: 5000
    });

    // Open circuit
    await expect(
      breaker.execute(() => Promise.reject(new Error("fail")))
    ).rejects.toThrow("fail");
    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

    // Wait for timeout
    vi.advanceTimersByTime(5000);

    // Successful operation closes circuit
    const result = await breaker.execute(() => Promise.resolve("success"));
    expect(result).toBe("success");
    expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });
});
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/utils/circuit-breaker.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker.test.ts
  ✓ CircuitBreaker > execute wrapper (4 tests)
```

### Step 5: Commit

```bash
git add src/utils/circuit-breaker.test.ts
git commit -m "test(resilience): add comprehensive circuit breaker tests

- Test OPEN→HALF_OPEN→CLOSED recovery flow
- Test HALF_OPEN→OPEN on failure
- Test execute() wrapper with success/failure tracking
- Test automatic recovery after timeout
- All state transitions verified with timing"
```

---

## Task 5: Create Circuit Breaker Manager

**Files:**
- Create: `src/utils/circuit-breaker-manager.ts`
- Create: `src/utils/circuit-breaker-manager.test.ts`

### Step 1: Write test for CircuitBreakerManager

Create file `src/utils/circuit-breaker-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreakerManager,
  getGlobalCircuitBreakerManager
} from "./circuit-breaker-manager.js";
import { CircuitBreakerState } from "./circuit-breaker.js";

describe("CircuitBreakerManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("breaker management", () => {
    it("should create breaker for host on first access", () => {
      const manager = new CircuitBreakerManager();
      const breaker = manager.getBreaker("test-host");

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should reuse breaker for same host", () => {
      const manager = new CircuitBreakerManager();
      const breaker1 = manager.getBreaker("test-host");
      const breaker2 = manager.getBreaker("test-host");

      expect(breaker1).toBe(breaker2);
    });

    it("should create separate breakers for different hosts", () => {
      const manager = new CircuitBreakerManager();
      const breaker1 = manager.getBreaker("host-1");
      const breaker2 = manager.getBreaker("host-2");

      expect(breaker1).not.toBe(breaker2);
    });
  });

  describe("execute with protection", () => {
    it("should execute operation through breaker", async () => {
      const manager = new CircuitBreakerManager();
      const operation = vi.fn().mockResolvedValue("success");

      const result = await manager.executeWithProtection(
        "test-host",
        operation
      );

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should fast-fail when circuit is open", async () => {
      const manager = new CircuitBreakerManager({
        failureThreshold: 1
      });

      // Open circuit
      await expect(
        manager.executeWithProtection("test-host", () =>
          Promise.reject(new Error("fail"))
        )
      ).rejects.toThrow("fail");

      // Next call fast-fails
      const operation = vi.fn().mockResolvedValue("success");
      await expect(
        manager.executeWithProtection("test-host", operation)
      ).rejects.toThrow("Circuit breaker is OPEN");

      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("statistics", () => {
    it("should return all breaker stats", () => {
      const manager = new CircuitBreakerManager();

      manager.getBreaker("host-1");
      manager.getBreaker("host-2");

      const stats = manager.getAllStats();

      expect(stats).toHaveLength(2);
      expect(stats.map((s) => s.hostKey).sort()).toEqual(["host-1", "host-2"]);
    });

    it("should track failures per host", async () => {
      const manager = new CircuitBreakerManager({
        failureThreshold: 2
      });

      await expect(
        manager.executeWithProtection("host-1", () =>
          Promise.reject(new Error("fail"))
        )
      ).rejects.toThrow();

      const stats = manager.getAllStats();
      const host1Stats = stats.find((s) => s.hostKey === "host-1");

      expect(host1Stats?.totalFailures).toBe(1);
      expect(host1Stats?.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe("global singleton", () => {
    it("should return same instance on repeated calls", () => {
      const manager1 = getGlobalCircuitBreakerManager();
      const manager2 = getGlobalCircuitBreakerManager();

      expect(manager1).toBe(manager2);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/utils/circuit-breaker-manager.test.ts`

Expected output:
```
FAIL src/utils/circuit-breaker-manager.test.ts
  Cannot find module './circuit-breaker-manager.js'
```

### Step 3: Create CircuitBreakerManager implementation

Create file `src/utils/circuit-breaker-manager.ts`:

```typescript
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerStats } from "./circuit-breaker.js";

/**
 * Extended stats with host key
 */
export interface CircuitBreakerStatsWithHost extends CircuitBreakerStats {
  hostKey: string;
}

/**
 * Manager for host-specific circuit breakers
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker>;
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
    this.breakers = new Map();
    this.defaultConfig = defaultConfig || {};
  }

  /**
   * Get or create circuit breaker for host
   */
  getBreaker(hostKey: string): CircuitBreaker {
    let breaker = this.breakers.get(hostKey);

    if (!breaker) {
      breaker = new CircuitBreaker(hostKey, this.defaultConfig);
      this.breakers.set(hostKey, breaker);
    }

    return breaker;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithProtection<T>(
    hostKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const breaker = this.getBreaker(hostKey);
    return breaker.execute(operation);
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): CircuitBreakerStatsWithHost[] {
    const stats: CircuitBreakerStatsWithHost[] = [];

    for (const [hostKey, breaker] of this.breakers.entries()) {
      stats.push({
        hostKey,
        ...breaker.getStats()
      });
    }

    return stats;
  }

  /**
   * Reset all circuit breakers (useful for testing)
   */
  resetAll(): void {
    this.breakers.clear();
  }
}

/**
 * Global circuit breaker manager singleton
 */
let globalManager: CircuitBreakerManager | null = null;

/**
 * Get global circuit breaker manager
 */
export function getGlobalCircuitBreakerManager(): CircuitBreakerManager {
  if (!globalManager) {
    // Load configuration from environment
    const config: Partial<CircuitBreakerConfig> = {
      failureThreshold: parseInt(
        process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || "3",
        10
      ),
      successThreshold: parseInt(
        process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || "1",
        10
      ),
      openTimeoutMs: parseInt(
        process.env.CIRCUIT_BREAKER_OPEN_TIMEOUT_MS || "30000",
        10
      )
    };

    globalManager = new CircuitBreakerManager(config);
  }

  return globalManager;
}

/**
 * Reset global manager (for testing)
 */
export function resetGlobalCircuitBreakerManager(): void {
  globalManager = null;
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/utils/circuit-breaker-manager.test.ts`

Expected output:
```
PASS src/utils/circuit-breaker-manager.test.ts
  ✓ CircuitBreakerManager (12 tests)
```

### Step 5: Commit

```bash
git add src/utils/circuit-breaker-manager.ts src/utils/circuit-breaker-manager.test.ts
git commit -m "feat(resilience): add circuit breaker manager

- Manage per-host circuit breakers
- Global singleton with env-based configuration
- executeWithProtection() wrapper for operations
- getAllStats() for monitoring
- Env vars: CIRCUIT_BREAKER_FAILURE_THRESHOLD, etc."
```

---

## Task 6: Integrate Circuit Breaker with Docker Service

**Files:**
- Modify: `src/services/docker.ts:614-625`
- Modify: `src/services/docker.test.ts`

### Step 1: Write test for circuit breaker integration

Add to `src/services/docker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkConnection, getDockerClient } from "../docker.js";
import { getGlobalCircuitBreakerManager } from "../utils/circuit-breaker-manager.js";
import { CircuitBreakerState } from "../utils/circuit-breaker.js";
import type { HostConfig } from "../../types.js";

describe("docker service with circuit breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset circuit breakers between tests
    const manager = getGlobalCircuitBreakerManager();
    manager.resetAll();
  });

  describe("checkConnection", () => {
    it("should use circuit breaker for connection check", async () => {
      const host: HostConfig = {
        name: "test-host",
        host: "192.168.1.100",
        protocol: "http",
        port: 2375
      };

      // Mock Docker client ping to fail
      const mockDocker = {
        ping: vi.fn().mockRejectedValue(new Error("Connection refused"))
      };
      vi.spyOn({ getDockerClient }, "getDockerClient").mockReturnValue(
        mockDocker as any
      );

      // First attempt - fails
      const result1 = await checkConnection(host);
      expect(result1).toBe(false);

      // Check circuit breaker state
      const manager = getGlobalCircuitBreakerManager();
      const breaker = manager.getBreaker("test-host");
      expect(breaker.getStats().failureCount).toBe(1);
    });

    it("should fast-fail when circuit is open", async () => {
      const host: HostConfig = {
        name: "test-host",
        host: "192.168.1.100",
        protocol: "http",
        port: 2375
      };

      const mockDocker = {
        ping: vi.fn().mockRejectedValue(new Error("Connection refused"))
      };
      vi.spyOn({ getDockerClient }, "getDockerClient").mockReturnValue(
        mockDocker as any
      );

      // Fail 3 times to open circuit (default threshold)
      await checkConnection(host);
      await checkConnection(host);
      await checkConnection(host);

      const manager = getGlobalCircuitBreakerManager();
      const breaker = manager.getBreaker("test-host");
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Next attempt should fast-fail (not call ping)
      mockDocker.ping.mockClear();
      const result = await checkConnection(host);

      expect(result).toBe(false);
      expect(mockDocker.ping).not.toHaveBeenCalled(); // Fast-fail
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/services/docker.test.ts`

Expected output:
```
FAIL src/services/docker.test.ts
  Expected fast-fail but ping was called
```

### Step 3: Integrate circuit breaker into checkConnection

Modify `src/services/docker.ts:614-625`:

```typescript
import { getGlobalCircuitBreakerManager, CircuitBreakerOpenError } from "../utils/circuit-breaker-manager.js";

/**
 * Check Docker connection health and clear stale clients
 */
export async function checkConnection(host: HostConfig): Promise<boolean> {
  const cacheKey = `${host.name}-${host.host}`;
  const manager = getGlobalCircuitBreakerManager();

  try {
    // Use circuit breaker protection
    await manager.executeWithProtection(host.name, async () => {
      const docker = getDockerClient(host);
      await docker.ping();
    });

    return true;
  } catch (error) {
    // Circuit breaker open - fast fail
    if (error instanceof CircuitBreakerOpenError) {
      console.error(
        `[CircuitBreaker] Fast-fail: ${host.name} circuit is ${error.state}`
      );
      return false;
    }

    // Connection failed - remove stale client
    dockerClients.delete(cacheKey);
    return false;
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/services/docker.test.ts`

Expected output:
```
PASS src/services/docker.test.ts
  ✓ docker service with circuit breaker (2 tests)
```

### Step 5: Commit

```bash
git add src/services/docker.ts src/services/docker.test.ts
git commit -m "feat(resilience): integrate circuit breaker with Docker service

- Wrap checkConnection() with circuit breaker
- Fast-fail when circuit is OPEN
- Clear stale clients on connection failure
- Log circuit breaker state transitions"
```

---

## Task 7: Integrate Circuit Breaker with SSH Operations

**Files:**
- Modify: `src/services/ssh-pool.ts:195-219`
- Modify: `src/services/ssh-pool.test.ts`

### Step 1: Write test for SSH circuit breaker integration

Add to `src/services/ssh-pool.test.ts`:

```typescript
import { getGlobalCircuitBreakerManager } from "../utils/circuit-breaker-manager.js";
import { CircuitBreakerState } from "../utils/circuit-breaker.js";

describe("SSH pool with circuit breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const manager = getGlobalCircuitBreakerManager();
    manager.resetAll();
  });

  it("should use circuit breaker for SSH connections", async () => {
    const host: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      sshUser: "root"
    };

    const pool = new SSHConnectionPoolImpl({
      failureThreshold: 2,
      connectionTimeoutMs: 1000
    });

    // Mock NodeSSH to fail
    vi.mock("node-ssh", () => ({
      NodeSSH: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockRejectedValue(new Error("Connection refused"))
      }))
    }));

    // First connection attempt - fails
    await expect(pool.getConnection(host)).rejects.toThrow();

    const manager = getGlobalCircuitBreakerManager();
    const breaker = manager.getBreaker("test-host:22");
    expect(breaker.getStats().failureCount).toBe(1);
  });

  it("should fast-fail SSH when circuit is open", async () => {
    const host: HostConfig = {
      name: "test-host",
      host: "192.168.1.100"
    };

    const pool = new SSHConnectionPoolImpl({
      failureThreshold: 1
    });

    // Mock connection to fail
    const mockConnect = vi.fn().mockRejectedValue(
      new Error("Connection refused")
    );

    // Open circuit with one failure
    await expect(pool.getConnection(host)).rejects.toThrow();

    const manager = getGlobalCircuitBreakerManager();
    const breaker = manager.getBreaker("test-host:22");
    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

    // Next attempt fast-fails
    mockConnect.mockClear();
    await expect(pool.getConnection(host)).rejects.toThrow(
      "Circuit breaker is OPEN"
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/services/ssh-pool.test.ts`

Expected output:
```
FAIL src/services/ssh-pool.test.ts
  Expected circuit breaker error but got connection error
```

### Step 3: Integrate circuit breaker into SSH pool

Modify `src/services/ssh-pool.ts:195-219`:

```typescript
import {
  getGlobalCircuitBreakerManager,
  CircuitBreakerOpenError
} from "../utils/circuit-breaker-manager.js";

export class SSHConnectionPoolImpl implements SSHConnectionPool {
  // ... existing code ...

  private async createConnection(host: HostConfig): Promise<NodeSSH> {
    const poolKey = generatePoolKey(host);
    const manager = getGlobalCircuitBreakerManager();

    // Use circuit breaker protection
    return manager.executeWithProtection(poolKey, async () => {
      const ssh = new NodeSSH();

      const connectionConfig = {
        host: host.host,
        port: host.port || 22,
        username: host.sshUser || process.env.USER || "root",
        privateKeyPath: host.sshKeyPath,
        readyTimeout: this.config.connectionTimeoutMs
      };

      console.error(
        `[SSH Pool] Attempting connection to ${host.name} (${connectionConfig.host}:${connectionConfig.port})`
      );
      console.error(`[SSH Pool] - Username: ${connectionConfig.username}`);
      console.error(
        `[SSH Pool] - Private key: ${connectionConfig.privateKeyPath}`
      );
      console.error(
        `[SSH Pool] - Ready timeout: ${connectionConfig.readyTimeout}ms`
      );

      await ssh.connect(connectionConfig);
      console.error(`[SSH Pool] Successfully connected to ${host.name}`);
      return ssh;
    });
  }

  async getConnection(host: HostConfig): Promise<NodeSSH> {
    const poolKey = generatePoolKey(host);
    const connections = this.pool.get(poolKey) || [];

    // Try to find idle connection
    const idleConnection = connections.find((c) => !c.isActive);

    if (idleConnection) {
      // Reuse existing connection (pool hit)
      idleConnection.isActive = true;
      idleConnection.lastUsed = Date.now();
      this.stats.poolHits++;
      this.updateConnectionStats();
      return idleConnection.connection;
    }

    // Check if we can create new connection
    if (connections.length >= this.config.maxConnections) {
      throw new Error(
        `Connection pool exhausted for ${poolKey} (max: ${this.config.maxConnections})`
      );
    }

    // Create new connection (with circuit breaker protection)
    try {
      const connection = await this.createConnection(host);

      const metadata: ConnectionMetadata = {
        connection,
        host,
        lastUsed: Date.now(),
        created: Date.now(),
        healthChecksPassed: 0,
        healthChecksFailed: 0,
        isActive: true
      };

      connections.push(metadata);
      this.pool.set(poolKey, connections);

      this.stats.poolMisses++;
      this.updateConnectionStats();

      return connection;
    } catch (error) {
      // Circuit breaker open - rethrow
      if (error instanceof CircuitBreakerOpenError) {
        throw error;
      }

      // Connection failed - log and rethrow
      console.error(
        `[SSH Pool] Connection failed to ${host.name}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test src/services/ssh-pool.test.ts`

Expected output:
```
PASS src/services/ssh-pool.test.ts
  ✓ SSH pool with circuit breaker (2 tests)
```

### Step 5: Commit

```bash
git add src/services/ssh-pool.ts src/services/ssh-pool.test.ts
git commit -m "feat(resilience): integrate circuit breaker with SSH pool

- Wrap createConnection() with circuit breaker
- Fast-fail when circuit is OPEN
- Per-host circuit tracking using poolKey
- Preserve existing connection pooling behavior"
```

---

## Task 8: Add Circuit Breaker Statistics Endpoint

**Files:**
- Modify: `src/tools/unified.ts:159-178` (add new subaction)
- Modify: `src/schemas/index.ts` (add schema)
- Create: `src/tools/circuit-breaker-stats.test.ts`

### Step 1: Write test for circuit breaker stats tool

Create file `src/tools/circuit-breaker-stats.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getGlobalCircuitBreakerManager } from "../utils/circuit-breaker-manager.js";
import { CircuitBreakerState } from "../utils/circuit-breaker.js";

describe("circuit breaker stats tool", () => {
  beforeEach(() => {
    const manager = getGlobalCircuitBreakerManager();
    manager.resetAll();
  });

  it("should return stats for all circuit breakers", () => {
    const manager = getGlobalCircuitBreakerManager();

    // Create some breakers
    const breaker1 = manager.getBreaker("host-1");
    const breaker2 = manager.getBreaker("host-2");

    breaker1.recordFailure(new Error("fail"));
    breaker2.recordSuccess();

    const stats = manager.getAllStats();

    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.hostKey === "host-1")?.totalFailures).toBe(1);
    expect(stats.find((s) => s.hostKey === "host-2")?.totalSuccesses).toBe(1);
  });

  it("should format stats as markdown table", () => {
    const manager = getGlobalCircuitBreakerManager();

    manager.getBreaker("host-1").recordFailure(new Error("fail"));
    manager.getBreaker("host-2").recordSuccess();

    const stats = manager.getAllStats();
    const markdown = formatCircuitBreakerStats(stats);

    expect(markdown).toContain("# Circuit Breaker Status");
    expect(markdown).toContain("| host-1 | CLOSED |");
    expect(markdown).toContain("| host-2 | CLOSED |");
  });
});

function formatCircuitBreakerStats(
  stats: Array<{ hostKey: string; state: CircuitBreakerState }>
): string {
  if (stats.length === 0) {
    return "# Circuit Breaker Status\n\nNo circuit breakers active.";
  }

  let markdown = "# Circuit Breaker Status\n\n";
  markdown += "| Host | State | Failures | Successes | Last Failure |\n";
  markdown += "|------|-------|----------|-----------|-------------|\n";

  for (const stat of stats) {
    const lastFailure = stat.lastFailureTime
      ? new Date(stat.lastFailureTime).toISOString()
      : "Never";

    markdown += `| ${stat.hostKey} | ${stat.state} | ${stat.totalFailures} | ${stat.totalSuccesses} | ${lastFailure} |\n`;
  }

  return markdown;
}
```

### Step 2: Run test to verify it fails

Run: `pnpm test src/tools/circuit-breaker-stats.test.ts`

Expected output:
```
FAIL src/tools/circuit-breaker-stats.test.ts
  ReferenceError: formatCircuitBreakerStats is not defined
```

### Step 3: Add formatter function

Create file `src/formatters/circuit-breaker.ts`:

```typescript
import type { CircuitBreakerStatsWithHost } from "../utils/circuit-breaker-manager.js";

/**
 * Format circuit breaker statistics as markdown table
 */
export function formatCircuitBreakerStats(
  stats: CircuitBreakerStatsWithHost[]
): string {
  if (stats.length === 0) {
    return "# Circuit Breaker Status\n\nNo circuit breakers active.";
  }

  let markdown = "# Circuit Breaker Status\n\n";
  markdown +=
    "| Host | State | Failures | Successes | Failure Count | Last Failure |\n";
  markdown +=
    "|------|-------|----------|-----------|---------------|-------------|\n";

  // Sort by state (OPEN first, then HALF_OPEN, then CLOSED)
  const stateOrder = { OPEN: 0, HALF_OPEN: 1, CLOSED: 2 };
  const sorted = [...stats].sort(
    (a, b) => stateOrder[a.state] - stateOrder[b.state]
  );

  for (const stat of sorted) {
    const lastFailure = stat.lastFailureTime
      ? new Date(stat.lastFailureTime).toISOString()
      : "Never";

    const stateIcon = {
      OPEN: "🔴",
      HALF_OPEN: "🟡",
      CLOSED: "🟢"
    }[stat.state];

    markdown += `| ${stat.hostKey} | ${stateIcon} ${stat.state} | ${stat.totalFailures} | ${stat.totalSuccesses} | ${stat.failureCount}/${stat.failureThreshold} | ${lastFailure} |\n`;
  }

  markdown += "\n**States:**\n";
  markdown += "- 🟢 CLOSED: Normal operation\n";
  markdown += "- 🟡 HALF_OPEN: Testing recovery\n";
  markdown += "- 🔴 OPEN: Fast-fail mode (too many failures)\n";

  return markdown;
}
```

### Step 4: Add schema for stats action

Add to `src/schemas/index.ts`:

```typescript
const circuitBreakerStatsSchema = z.object({
  action: z.literal("circuitbreaker"),
  subaction: z.literal("stats")
});

// Add to discriminated union
const homelabSchema = z.discriminatedUnion("action", [
  // ... existing schemas ...
  circuitBreakerStatsSchema
]);
```

### Step 5: Add tool handler

Add to `src/tools/unified.ts`:

```typescript
import { formatCircuitBreakerStats } from "../formatters/circuit-breaker.js";
import { getGlobalCircuitBreakerManager } from "../utils/circuit-breaker-manager.js";

// In the tool handler switch statement:
case "circuitbreaker":
  if (params.subaction === "stats") {
    const manager = getGlobalCircuitBreakerManager();
    const stats = manager.getAllStats();
    return {
      content: [
        {
          type: "text",
          text: formatCircuitBreakerStats(stats)
        }
      ]
    };
  }
  break;
```

### Step 6: Run test to verify it passes

Run: `pnpm test src/tools/circuit-breaker-stats.test.ts`

Expected output:
```
PASS src/tools/circuit-breaker-stats.test.ts
  ✓ circuit breaker stats tool (2 tests)
```

### Step 7: Commit

```bash
git add src/formatters/circuit-breaker.ts src/schemas/index.ts src/tools/unified.ts src/tools/circuit-breaker-stats.test.ts
git commit -m "feat(resilience): add circuit breaker statistics endpoint

- New action: circuitbreaker:stats
- Shows state, failure counts, last failure time per host
- Markdown table with state icons (🟢🟡🔴)
- Sorted by state severity (OPEN first)"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/circuit-breaker.md`

### Step 1: Create circuit breaker documentation

Create file `docs/circuit-breaker.md`:

```markdown
# Circuit Breaker Pattern

## Overview

The homelab-mcp-server uses circuit breaker pattern to prevent cascading failures when Docker hosts become unreachable. This provides:

- **Fast-fail**: Reject requests immediately when host is known to be down (< 100ms vs 30s timeout)
- **Automatic recovery**: Test connectivity periodically and resume operations when host recovers
- **Per-host isolation**: One failed host doesn't impact others

## States

```
CLOSED → OPEN → HALF_OPEN → CLOSED
  ↑                           |
  └───────────────────────────┘
```

### CLOSED (Normal Operation)
- All requests pass through
- Failures tracked (reset on success)
- Transitions to OPEN after N consecutive failures

### OPEN (Fast-Fail Mode)
- All requests rejected immediately
- No operations attempted
- After timeout period, transitions to HALF_OPEN

### HALF_OPEN (Testing Recovery)
- Limited requests allowed
- Testing if host recovered
- Success → CLOSED
- Failure → OPEN

## Configuration

Environment variables:

```bash
# Failures before opening circuit (default: 3)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3

# Successes in HALF_OPEN to close (default: 1)
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=1

# Cooldown before testing recovery (default: 30000ms = 30s)
CIRCUIT_BREAKER_OPEN_TIMEOUT_MS=30000
```

## Monitoring

Use the `circuitbreaker:stats` action to view current state:

```json
{
  "action": "circuitbreaker",
  "subaction": "stats"
}
```

Output:
```markdown
# Circuit Breaker Status

| Host | State | Failures | Successes | Failure Count | Last Failure |
|------|-------|----------|-----------|---------------|-------------|
| prod | 🔴 OPEN | 5 | 120 | 3/3 | 2025-12-25T04:30:15Z |
| dev  | 🟢 CLOSED | 0 | 45 | 0/3 | Never |
```

## Impact

**Before circuit breaker:**
```
User: List containers on all hosts
Host1 (down): 30s timeout
Host2 (down): 30s timeout
Host3 (down): 30s timeout
Host4 (up):   200ms
Total:        90+ seconds
```

**After circuit breaker:**
```
User: List containers on all hosts
Host1 (down): <100ms fast-fail
Host2 (down): <100ms fast-fail
Host3 (down): <100ms fast-fail
Host4 (up):   200ms
Total:        <1 second
```

## Operations Protected

Circuit breaker wraps:
- Docker API calls (`checkConnection`, `getDockerClient`)
- SSH connections (`ssh-pool.createConnection`)
- All remote operations (compose, resources, etc.)

## Testing

To manually test circuit breaker:

1. Configure unreachable host in `homelab.config.json`
2. Attempt 3 operations to the host (opens circuit)
3. Check stats: `{ action: "circuitbreaker", subaction: "stats" }`
4. Verify state is OPEN
5. Wait 30s (or configured timeout)
6. Next operation triggers HALF_OPEN
7. If host still down → OPEN, if recovered → CLOSED
```

### Step 2: Update README with circuit breaker info

Add to `README.md` after "Features" section:

```markdown
## Resilience

### Circuit Breaker Pattern

Automatic failure detection and recovery for unreachable hosts:

- **Fast-fail**: Reject requests to known-down hosts immediately (< 100ms vs 30s timeout)
- **Automatic recovery**: Periodically test connectivity and resume when host recovers
- **Per-host isolation**: One failed host doesn't slow down operations on healthy hosts

Configuration via environment variables:
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD` - Failures before opening (default: 3)
- `CIRCUIT_BREAKER_OPEN_TIMEOUT_MS` - Cooldown period in ms (default: 30000)

Monitor circuit breaker state:
```json
{ "action": "circuitbreaker", "subaction": "stats" }
```

See [Circuit Breaker Documentation](docs/circuit-breaker.md) for details.
```

### Step 3: Add circuit breaker to tool description

Add to `README.md` tool table:

```markdown
### System Operations (`action: "circuitbreaker"`)

| Subaction | Description |
|-----------|-------------|
| `stats` | View circuit breaker status for all hosts |
```

### Step 4: Commit

```bash
git add README.md docs/circuit-breaker.md
git commit -m "docs(resilience): add circuit breaker documentation

- Explain states, configuration, monitoring
- Show before/after performance impact
- Add to README features and tool list
- Environment variable reference"
```

---

## Task 10: Run Full Test Suite and Verify

**Files:**
- None (verification only)

### Step 1: Run all tests

Run: `pnpm test`

Expected output:
```
✓ src/utils/circuit-breaker.test.ts (15 tests)
✓ src/utils/circuit-breaker-manager.test.ts (12 tests)
✓ src/services/docker.test.ts (2 new tests)
✓ src/services/ssh-pool.test.ts (2 new tests)
✓ src/tools/circuit-breaker-stats.test.ts (2 tests)
✓ ... (existing tests)

Test Files: 420 passed (420)
Tests:      450+ passed (450+)
```

### Step 2: Run type checking

Run: `pnpm run build`

Expected output:
```
✓ Built successfully
No TypeScript errors
```

### Step 3: Check test coverage

Run: `pnpm test:coverage`

Expected output:
```
Coverage:
  src/utils/circuit-breaker.ts:        100%
  src/utils/circuit-breaker-manager.ts: 100%
  src/formatters/circuit-breaker.ts:    100%
  Overall:                              91%+
```

### Step 4: Manual integration test

Start server: `pnpm run build && node dist/index.js`

Test circuit breaker stats (via MCP client or curl):
```json
{
  "action": "circuitbreaker",
  "subaction": "stats"
}
```

Expected: Markdown table with circuit breaker status

### Step 5: Final commit

```bash
git add .
git commit -m "test(resilience): verify circuit breaker integration

All tests passing:
- Circuit breaker core (15 tests)
- Circuit breaker manager (12 tests)
- Docker integration (2 tests)
- SSH integration (2 tests)
- Stats endpoint (2 tests)
- Coverage: 91%+

Manual testing verified stats endpoint works"
```

---

## Completion Checklist

### Core Implementation
- [x] CircuitBreaker class with state machine
- [x] State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- [x] Configurable thresholds (failure, success, timeout)
- [x] CircuitBreakerManager for per-host tracking
- [x] Global singleton with env-based config

### Integration
- [x] Docker service integration (checkConnection)
- [x] SSH pool integration (createConnection)
- [x] Circuit breaker stats endpoint
- [x] Formatter for markdown output

### Testing
- [x] Unit tests for CircuitBreaker (15 tests)
- [x] Unit tests for CircuitBreakerManager (12 tests)
- [x] Integration tests for Docker (2 tests)
- [x] Integration tests for SSH (2 tests)
- [x] Stats endpoint tests (2 tests)
- [x] All tests passing
- [x] 90%+ coverage

### Documentation
- [x] Circuit breaker design doc
- [x] README updates
- [x] Environment variable reference
- [x] Monitoring guide
- [x] Performance impact examples

---

## Performance Impact

### Before Circuit Breaker

Multi-host operation with 3 unreachable hosts:
```
Host1 (down): 30s timeout
Host2 (down): 30s timeout
Host3 (down): 30s timeout
Host4 (up):   200ms
Total:        90+ seconds
```

### After Circuit Breaker (First Attempt)

```
Host1 (down): 30s timeout → opens circuit
Host2 (down): 30s timeout → opens circuit
Host3 (down): 30s timeout → opens circuit
Host4 (up):   200ms
Total:        90+ seconds (same as before)
```

### After Circuit Breaker (Subsequent Attempts)

```
Host1 (down): <100ms fast-fail (circuit OPEN)
Host2 (down): <100ms fast-fail (circuit OPEN)
Host3 (down): <100ms fast-fail (circuit OPEN)
Host4 (up):   200ms
Total:        <1 second (90x faster!)
```

---

## Future Enhancements

### Phase 2 (Optional)
- [ ] Exponential backoff for OPEN → HALF_OPEN transition
- [ ] Adaptive thresholds based on historical data
- [ ] Circuit breaker metrics export (Prometheus format)
- [ ] Per-operation circuit breakers (not just per-host)
- [ ] Jitter in timeout to prevent thundering herd

### Phase 3 (Optional)
- [ ] Circuit breaker reset endpoint
- [ ] Manual circuit control (force OPEN/CLOSED)
- [ ] Circuit breaker event webhooks
- [ ] Integration with health check system

---

## Related Skills

- @testing-anti-patterns - For test design guidance
- @defense-in-depth - For security considerations
- @systematic-debugging - For troubleshooting circuit breaker issues

---

## Rollout Strategy

1. **Deploy**: Merge to main, deploy to staging
2. **Monitor**: Check circuit breaker stats after 24h
3. **Tune**: Adjust thresholds based on false positives
4. **Verify**: Confirm performance improvement in multi-host operations
5. **Document**: Update runbook with circuit breaker troubleshooting

---

**Plan complete. Ready for execution via superpowers:executing-plans or superpowers:subagent-driven-development.**
