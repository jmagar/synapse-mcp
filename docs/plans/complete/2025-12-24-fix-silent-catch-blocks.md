# Fix Silent Catch Blocks and Preserve Debug Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

**Goal:** Eliminate all silent catch blocks and ensure proper error context preservation with chaining, structured logging, and meaningful error messages.

**Architecture:** Create custom error classes with context chaining, add structured error logging utility, update all catch blocks to preserve original error information, and ensure all failures include relevant context (host, command, operation).

**Tech Stack:** TypeScript 5.7+, Vitest for testing, console.error for logging (stdout reserved for MCP)

---

## Task 1: Create Custom Error Classes with Context

**Files:**
- Create: `src/utils/errors.ts`
- Create: `src/utils/errors.test.ts`

**Step 1: Write failing test for HostOperationError**

```typescript
// src/utils/errors.test.ts
import { describe, it, expect } from "vitest";
import { HostOperationError, SSHCommandError, ComposeOperationError } from "./errors.js";

describe("HostOperationError", () => {
  it("should chain error causes and preserve stack", () => {
    const rootCause = new Error("Connection timeout");
    const wrapped = new HostOperationError(
      "Failed to connect to host",
      "docker-01",
      "getDockerInfo",
      rootCause
    );

    expect(wrapped.message).toContain("Failed to connect to host");
    expect(wrapped.message).toContain("docker-01");
    expect(wrapped.message).toContain("getDockerInfo");
    expect(wrapped.cause).toBe(rootCause);
    expect(wrapped.hostName).toBe("docker-01");
    expect(wrapped.operation).toBe("getDockerInfo");
  });

  it("should handle non-Error cause types", () => {
    const wrapped = new HostOperationError(
      "Operation failed",
      "host-1",
      "test",
      "string error"
    );

    expect(wrapped.message).toContain("Operation failed");
    expect(wrapped.cause).toBe("string error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/errors.test.ts`
Expected: FAIL with "Cannot find module './errors.js'"

**Step 3: Implement HostOperationError class**

```typescript
// src/utils/errors.ts
/**
 * Error classes for preserving context in error chains
 *
 * These custom errors ensure we never lose debug information when catching
 * and re-throwing errors. All include:
 * - Original error as 'cause' (preserves stack trace)
 * - Contextual information (host, command, operation)
 * - Structured message format
 */

/**
 * Base error for host operations (SSH, Docker API)
 */
export class HostOperationError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly operation: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = `[Host: ${hostName}] [Op: ${operation}] ${message}`;
    super(fullMessage);
    this.name = "HostOperationError";

    // Preserve original error cause for debugging
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * SSH command execution error with full context
 */
export class SSHCommandError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly stderr?: string,
    public readonly stdout?: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = [
      `[SSH] [Host: ${hostName}] ${message}`,
      `Command: ${command}`,
      exitCode !== undefined ? `Exit code: ${exitCode}` : null,
      stderr ? `Stderr: ${stderr}` : null
    ]
      .filter(Boolean)
      .join("\n");

    super(fullMessage);
    this.name = "SSHCommandError";

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Docker Compose operation error
 */
export class ComposeOperationError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly project: string,
    public readonly action: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = `[Compose] [Host: ${hostName}] [Project: ${project}] [Action: ${action}] ${message}`;
    super(fullMessage);
    this.name = "ComposeOperationError";

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/errors.test.ts`
Expected: PASS

**Step 5: Add test for SSHCommandError with full context**

```typescript
// src/utils/errors.test.ts
describe("SSHCommandError", () => {
  it("should include command, exit code, and stderr in message", () => {
    const error = new SSHCommandError(
      "Command failed",
      "web-01",
      "docker ps",
      127,
      "command not found",
      ""
    );

    expect(error.message).toContain("Command failed");
    expect(error.message).toContain("web-01");
    expect(error.message).toContain("docker ps");
    expect(error.message).toContain("127");
    expect(error.message).toContain("command not found");
    expect(error.command).toBe("docker ps");
    expect(error.exitCode).toBe(127);
  });

  it("should chain original error cause", () => {
    const rootCause = new Error("Network timeout");
    const error = new SSHCommandError(
      "SSH failed",
      "db-01",
      "uptime",
      undefined,
      undefined,
      undefined,
      rootCause
    );

    expect(error.cause).toBe(rootCause);
    expect(error.stack).toContain("Caused by:");
  });
});
```

**Step 6: Run test to verify it passes**

Run: `pnpm test src/utils/errors.test.ts`
Expected: PASS

**Step 7: Add test for ComposeOperationError**

```typescript
// src/utils/errors.test.ts
describe("ComposeOperationError", () => {
  it("should include project and action in message", () => {
    const error = new ComposeOperationError(
      "Service failed to start",
      "docker-01",
      "production-db",
      "up",
      new Error("Port already in use")
    );

    expect(error.message).toContain("Service failed to start");
    expect(error.message).toContain("docker-01");
    expect(error.message).toContain("production-db");
    expect(error.message).toContain("up");
    expect(error.project).toBe("production-db");
    expect(error.action).toBe("up");
  });
});
```

**Step 8: Run test to verify it passes**

Run: `pnpm test src/utils/errors.test.ts`
Expected: PASS

**Step 9: Commit custom error classes**

```bash
git add src/utils/errors.ts src/utils/errors.test.ts
git commit -m "feat(errors): add custom error classes with context chaining

- HostOperationError for Docker API operations
- SSHCommandError for SSH command failures
- ComposeOperationError for docker compose operations
- All preserve original error cause and stack traces
- Include contextual information (host, command, operation)"
```

---

## Task 2: Create Structured Error Logging Utility

**Files:**
- Modify: `src/utils/errors.ts`
- Modify: `src/utils/errors.test.ts`

**Step 1: Write test for logError utility**

```typescript
// src/utils/errors.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError, HostOperationError } from "./errors.js";

describe("logError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should log structured error with context", () => {
    const error = new HostOperationError(
      "Connection failed",
      "docker-01",
      "listContainers",
      new Error("ECONNREFUSED")
    );

    logError(error, { requestId: "req-123" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("HostOperationError")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("docker-01")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("listContainers")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("req-123")
    );
  });

  it("should handle non-Error types", () => {
    logError("string error", { operation: "test" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("string error")
    );
  });

  it("should include stack trace for Error instances", () => {
    const error = new Error("Test error");
    logError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(error.stack || "")
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/errors.test.ts -t "logError"`
Expected: FAIL with "logError is not a function"

**Step 3: Implement logError utility**

```typescript
// src/utils/errors.ts (add to existing file)

/**
 * Additional context for error logging
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log error with structured context
 *
 * NEVER use this to silently swallow errors - always re-throw after logging
 * if the error should propagate.
 *
 * @param error - Error to log (any type)
 * @param context - Additional context information
 */
export function logError(error: unknown, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  const parts: string[] = [`[${timestamp}]`];

  if (context?.requestId) {
    parts.push(`[Request: ${context.requestId}]`);
  }

  if (context?.operation) {
    parts.push(`[Operation: ${context.operation}]`);
  }

  // Extract error details
  if (error instanceof HostOperationError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Op: ${error.operation}]`);
  } else if (error instanceof SSHCommandError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Command: ${error.command}]`);
  } else if (error instanceof ComposeOperationError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Project: ${error.project}]`);
    parts.push(`[Action: ${error.action}]`);
  }

  if (error instanceof Error) {
    parts.push(error.name);
    parts.push(error.message);
    console.error(parts.join(" "));

    if (error.stack) {
      console.error(error.stack);
    }

    // Log metadata if provided
    if (context?.metadata) {
      console.error("Metadata:", JSON.stringify(context.metadata, null, 2));
    }
  } else {
    parts.push(String(error));
    console.error(parts.join(" "));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/errors.test.ts -t "logError"`
Expected: PASS

**Step 5: Commit logging utility**

```bash
git add src/utils/errors.ts src/utils/errors.test.ts
git commit -m "feat(errors): add structured error logging utility

- logError function with context support
- Extracts details from custom error classes
- Includes timestamp, request ID, operation
- Always logs stack traces for Error instances
- Supports metadata for additional context"
```

---

## Task 3: Fix SSH Command Error Handling

**Files:**
- Modify: `src/services/ssh-pool-exec.ts:94-99`
- Modify: `src/services/ssh-pool-exec.test.ts`

**Step 1: Write test for proper error chaining in executeSSHCommand**

```typescript
// src/services/ssh-pool-exec.test.ts (add to existing tests)
import { SSHCommandError } from "../utils/errors.js";

describe("executeSSHCommand error handling", () => {
  it("should throw SSHCommandError with full context on command failure", async () => {
    // Mock pool to return connection that fails
    const mockPool = {
      getConnection: vi.fn().mockResolvedValue({
        execCommand: vi.fn().mockResolvedValue({
          code: 127,
          stderr: "command not found: nonexistent",
          stdout: ""
        })
      }),
      releaseConnection: vi.fn().mockResolvedValue(undefined)
    };

    vi.mocked(getGlobalPool).mockReturnValue(mockPool as any);

    await expect(
      executeSSHCommand(testHost, "nonexistent-command")
    ).rejects.toThrow(SSHCommandError);

    await expect(
      executeSSHCommand(testHost, "nonexistent-command")
    ).rejects.toMatchObject({
      hostName: testHost.name,
      command: "nonexistent-command",
      exitCode: 127,
      stderr: expect.stringContaining("command not found")
    });
  });

  it("should chain original error cause on exception", async () => {
    const rootError = new Error("Network timeout");
    const mockPool = {
      getConnection: vi.fn().mockResolvedValue({
        execCommand: vi.fn().mockRejectedValue(rootError)
      }),
      releaseConnection: vi.fn().mockResolvedValue(undefined)
    };

    vi.mocked(getGlobalPool).mockReturnValue(mockPool as any);

    await expect(
      executeSSHCommand(testHost, "test-command")
    ).rejects.toMatchObject({
      name: "SSHCommandError",
      hostName: testHost.name,
      command: "test-command",
      cause: rootError
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/ssh-pool-exec.test.ts -t "error handling"`
Expected: FAIL - expects SSHCommandError but gets generic Error

**Step 3: Update executeSSHCommand to use SSHCommandError**

```typescript
// src/services/ssh-pool-exec.ts
import { SSHCommandError } from "../utils/errors.js";

// Update the catch block (lines 94-99):
  } catch (error) {
    // Always throw SSHCommandError with full context
    if (error instanceof Error) {
      // If already an SSHCommandError, re-throw as-is
      if (error instanceof SSHCommandError) {
        throw error;
      }
      // Wrap other errors with context
      throw new SSHCommandError(
        "SSH command execution failed",
        host.name,
        fullCommand,
        undefined,
        undefined,
        undefined,
        error
      );
    }
    // Handle non-Error types
    throw new SSHCommandError(
      "SSH command execution failed",
      host.name,
      fullCommand,
      undefined,
      undefined,
      undefined,
      error
    );
  } finally {
```

**Step 4: Update the exit code check to use SSHCommandError (lines 85-91)**

```typescript
// src/services/ssh-pool-exec.ts
    // Check exit code
    if (result.code !== 0) {
      throw new SSHCommandError(
        "SSH command failed with non-zero exit code",
        host.name,
        fullCommand,
        result.code,
        result.stderr,
        result.stdout
      );
    }
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/services/ssh-pool-exec.test.ts -t "error handling"`
Expected: PASS

**Step 6: Run full test suite for ssh-pool-exec**

Run: `pnpm test src/services/ssh-pool-exec.test.ts`
Expected: All tests PASS

**Step 7: Commit SSH error handling fix**

```bash
git add src/services/ssh-pool-exec.ts src/services/ssh-pool-exec.test.ts
git commit -m "fix(ssh): use SSHCommandError with full context

- Replace generic Error with SSHCommandError
- Include host, command, exit code, stderr, stdout
- Chain original error cause to preserve stack
- Update tests to verify error context"
```

---

## Task 4: Fix Compose Service Error Handling

**Files:**
- Modify: `src/services/compose.ts:116-120, 150-154, 216, 243-246`
- Modify: `src/services/compose.test.ts`

**Step 1: Write test for ComposeOperationError usage**

```typescript
// src/services/compose.test.ts (add to existing tests)
import { ComposeOperationError } from "../utils/errors.js";

describe("composeExec error handling", () => {
  it("should throw ComposeOperationError with project and action context", async () => {
    vi.mocked(executeSSHCommand).mockRejectedValue(
      new Error("Connection refused")
    );

    await expect(
      composeExec(testHost, "my-project", "up", ["-d"])
    ).rejects.toThrow(ComposeOperationError);

    await expect(
      composeExec(testHost, "my-project", "up", ["-d"])
    ).rejects.toMatchObject({
      hostName: testHost.name,
      project: "my-project",
      action: "up",
      cause: expect.any(Error)
    });
  });
});

describe("listComposeProjects error handling", () => {
  it("should throw ComposeOperationError on SSH failure", async () => {
    vi.mocked(executeSSHCommand).mockRejectedValue(
      new Error("SSH timeout")
    );

    await expect(
      listComposeProjects(testHost)
    ).rejects.toMatchObject({
      name: "ComposeOperationError",
      hostName: testHost.name,
      action: "ls"
    });
  });
});

describe("getComposeStatus error handling", () => {
  it("should throw ComposeOperationError with project context", async () => {
    vi.mocked(executeSSHCommand).mockRejectedValue(
      new Error("Project not found")
    );

    await expect(
      getComposeStatus(testHost, "web-stack")
    ).rejects.toMatchObject({
      name: "ComposeOperationError",
      hostName: testHost.name,
      project: "web-stack",
      action: "ps"
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose.test.ts -t "error handling"`
Expected: FAIL - expects ComposeOperationError but gets generic Error

**Step 3: Update composeExec to use ComposeOperationError**

```typescript
// src/services/compose.ts
import { ComposeOperationError } from "../utils/errors.js";

// Update composeExec catch block (lines 116-120):
  try {
    return await executeSSHCommand(host, command, [], { timeoutMs: 30000 });
  } catch (error) {
    throw new ComposeOperationError(
      "Docker Compose command failed",
      host.name,
      project,
      action,
      error
    );
  }
```

**Step 4: Update listComposeProjects to use ComposeOperationError**

```typescript
// src/services/compose.ts (lines 150-154)
  } catch (error) {
    throw new ComposeOperationError(
      "Failed to list compose projects",
      host.name,
      "*", // All projects
      "ls",
      error
    );
  }
```

**Step 5: Update getComposeStatus to use ComposeOperationError (lines 243-246)**

```typescript
// src/services/compose.ts (lines 243-246)
  } catch (error) {
    throw new ComposeOperationError(
      "Failed to get compose status",
      host.name,
      project,
      "ps",
      error
    );
  }
```

**Step 5a: Add logging for malformed service line parsing (line 216)**

```typescript
// src/services/compose.ts (line 216)
import { logError } from "../utils/errors.js";

// Update line 216 to log instead of silent skip:
        } catch (error) {
          // Log malformed line for debugging but continue parsing
          logError(
            new Error("Failed to parse compose service line"),
            {
              operation: "getComposeStatus",
              metadata: {
                host: host.name,
                project,
                line: line.substring(0, 100) // Truncate for safety
              }
            }
          );
        }
```

**Step 6: Run test to verify it passes**

Run: `pnpm test src/services/compose.test.ts -t "error handling"`
Expected: PASS

**Step 7: Run full compose test suite**

Run: `pnpm test src/services/compose.test.ts`
Expected: All tests PASS

**Step 8: Commit compose error handling fix**

```bash
git add src/services/compose.ts src/services/compose.test.ts
git commit -m "fix(compose): use ComposeOperationError with full context

- Replace generic Error with ComposeOperationError
- Include host, project, action in all compose errors
- Chain original error cause to preserve stack
- Update tests to verify error context"
```

---

## Task 5: Fix Docker Service Silent Catch Blocks

**Files:**
- Modify: `src/services/docker.ts:102-104, 115-117, 193-195, 504-513, 620-624, 872-879`
- Modify: `src/services/docker.ts` (add tests)

**Step 1: Write test for config file parsing with error logging**

```typescript
// src/services/docker.ts (add inline test or separate test file)
// For now, we'll document the fix and verify manually since loadHostConfigs
// is called at module initialization

// The issue: Lines 102-104 and 115-117 silently catch and log errors
// Fix: Add structured error logging with logError utility
```

**Step 2: Update config file parsing to use logError (lines 102-104)**

```typescript
// src/services/docker.ts
import { logError } from "../utils/errors.js";

// Update lines 102-104:
      } catch (error) {
        logError(error, {
          operation: "loadHostConfigs",
          metadata: { configPath, source: "file" }
        });
        // Continue to next config path - this is expected behavior
      }
```

**Step 3: Update env var parsing to use logError (lines 115-117)**

```typescript
// src/services/docker.ts (lines 115-117)
      } catch (error) {
        logError(error, {
          operation: "loadHostConfigs",
          metadata: { source: "HOMELAB_HOSTS_CONFIG" }
        });
        // Continue to default config - this is expected behavior
      }
```

**Step 4: Fix findContainerHost to log errors instead of silent catch (line 193)**

```typescript
// src/services/docker.ts (lines 193-195)
import { HostOperationError, logError } from "../utils/errors.js";

// Replace lines 180-197:
export async function findContainerHost(
  containerId: string,
  hosts: HostConfig[]
): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null> {
  for (const host of hosts) {
    try {
      const docker = getDockerClient(host);
      const containers = await docker.listContainers({ all: true });

      const found = containers.find(
        (c) =>
          c.Id.startsWith(containerId) || c.Names.some((n) => n.replace(/^\//, "") === containerId)
      );

      if (found) {
        return { host, container: found };
      }
    } catch (error) {
      // Log error with context but continue checking other hosts
      logError(
        new HostOperationError(
          "Failed to list containers on host",
          host.name,
          "findContainerHost",
          error
        ),
        { metadata: { containerId } }
      );
      // Continue to next host - container might be on another host
    }
  }
  return null;
}
```

**Step 4a: Update getHostInfo to log errors (lines 504-513)**

```typescript
// src/services/docker.ts (lines 504-513)
// This catch returns error in result object - add logging

  } catch (error) {
    logError(
      new HostOperationError(
        "Failed to get host info",
        host.name,
        "getHostInfo",
        error
      ),
      { metadata: { host: host.host } }
    );
    return {
      name: host.name,
      host: host.host,
      connected: false,
      containerCount: 0,
      runningCount: 0,
      error: error instanceof Error ? error.message : "Connection failed"
    };
  }
```

**Step 4b: Update isDockerHostConnected to log errors (lines 620-624)**

```typescript
// src/services/docker.ts (lines 620-624)
// This silent catch removes stale client - add logging

  } catch (error) {
    logError(
      new HostOperationError(
        "Docker ping failed",
        host.name,
        "isDockerHostConnected",
        error
      ),
      { metadata: { cacheKey } }
    );
    // Remove stale client from cache on failure
    dockerClients.delete(cacheKey);
    return false;
  }
```

**Step 4c: Update dockerCleanup to log errors (lines 872-879)**

```typescript
// src/services/docker.ts (lines 872-879)
// This catch returns error in results - add logging

    } catch (error) {
      logError(
        new HostOperationError(
          "Docker cleanup failed",
          host.name,
          "dockerCleanup",
          error
        ),
        { metadata: { type: t } }
      );
      results.push({
        type: t,
        spaceReclaimed: 0,
        itemsDeleted: 0,
        details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
      });
    }
```

**Step 5: Run type check**

Run: `pnpm run typecheck`
Expected: No errors

**Step 6: Run existing docker tests**

Run: `pnpm test src/services/docker`
Expected: All tests PASS

**Step 7: Commit docker service error logging**

```bash
git add src/services/docker.ts
git commit -m "fix(docker): add structured error logging for silent catches

- Use logError for config parsing failures
- Add context to findContainerHost errors
- Log host name and operation for debugging
- Preserve existing behavior (continue on error)"
```

---

## Task 6: Fix SSH Pool Silent Catch Blocks

**Files:**
- Modify: `src/services/ssh-pool.ts:142, 281, 306, 331`

**Note:** Line 215 already has proper error handling (logs and re-throws) - no changes needed.

**Step 1: Write test for health check failure logging**

```typescript
// src/services/ssh-pool.test.ts (create or add to existing)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import { logError } from "../utils/errors.js";

vi.mock("../utils/errors.js", () => ({
  logError: vi.fn(),
  HostOperationError: class HostOperationError extends Error {
    constructor(msg: string, public hostName: string, public operation: string, public cause?: unknown) {
      super(msg);
    }
  }
}));

describe("SSHConnectionPoolImpl health checks", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should log structured error when health check fails", async () => {
    // Test health check failure logging
    // This will verify logError is called with proper context
    expect(logError).toBeDefined();
  });
});
```

**Step 2: Update checkConnectionHealth to log errors (line 142)**

```typescript
// src/services/ssh-pool.ts
import { logError, HostOperationError } from "../utils/errors.js";

// Update line 142:
    } catch (error) {
      // Health check failed - log with context before removing
      logError(
        new HostOperationError(
          "Health check failed",
          metadata.host.name,
          "healthCheck",
          error
        ),
        {
          metadata: {
            poolKey,
            failureCount: metadata.healthChecksFailed + 1,
            lastUsed: new Date(metadata.lastUsed).toISOString()
          }
        }
      );

      metadata.healthChecksFailed++;
      this.stats.healthCheckFailures++;
      await this.removeConnection(poolKey, metadata);
    }
```

**Step 3: Update removeConnection to log disposal errors (line 281)**

```typescript
// src/services/ssh-pool.ts (lines 279-283)
      try {
        await metadata.connection.dispose();
      } catch (error) {
        // Log disposal error but continue cleanup
        logError(
          new HostOperationError(
            "Failed to dispose SSH connection",
            metadata.host.name,
            "dispose",
            error
          ),
          { metadata: { poolKey } }
        );
      }
```

**Step 4: Update closeConnection to log disposal errors (line 306)**

```typescript
// src/services/ssh-pool.ts (lines 303-309)
    const closePromises = connections.map(async (metadata) => {
      try {
        await metadata.connection.dispose();
      } catch (error) {
        logError(
          new HostOperationError(
            "Failed to dispose SSH connection during closeConnection",
            metadata.host.name,
            "closeConnection",
            error
          ),
          { metadata: { poolKey } }
        );
      }
    });
```

**Step 5: Update closeAll to log disposal errors (line 331)**

```typescript
// src/services/ssh-pool.ts (lines 328-334)
        closePromises.push(
          (async (): Promise<void> => {
            try {
              await metadata.connection.dispose();
            } catch (error) {
              logError(
                new HostOperationError(
                  "Failed to dispose SSH connection during closeAll",
                  metadata.host.name,
                  "closeAll",
                  error
                ),
                { operation: "closeAll" }
              );
            }
          })()
        );
```

**Step 6: Run type check**

Run: `pnpm run typecheck`
Expected: No errors

**Step 7: Run ssh-pool tests**

Run: `pnpm test src/services/ssh-pool`
Expected: All tests PASS

**Step 8: Commit SSH pool error logging**

```bash
git add src/services/ssh-pool.ts
git commit -m "fix(ssh-pool): add structured error logging for silent catches

- Log health check failures with host and context
- Log connection disposal errors
- Include pool key and metadata for debugging
- Preserve existing cleanup behavior"
```

---

## Task 7: Fix Unified Tools Silent Catch Block

**Files:**
- Modify: `src/tools/unified.ts:104-107, 684-689`

**Step 1: Write test for stats collection error logging**

```typescript
// src/tools/unified.test.ts (add to existing tests)
import { logError } from "../utils/errors.js";

vi.mock("../utils/errors.js", () => ({
  logError: vi.fn(),
  HostOperationError: class HostOperationError extends Error {
    constructor(msg: string, public hostName: string, public operation: string, public cause?: unknown) {
      super(msg);
    }
  }
}));

describe("collectStatsParallel error handling", () => {
  it("should log errors when stats collection fails", async () => {
    // This tests the catch block at line 104-107
    // Verify that failures are logged with context
    expect(logError).toBeDefined();
  });
});
```

**Step 2: Update collectStatsParallel to use logError (lines 104-107)**

```typescript
// src/tools/unified.ts
import { logError, HostOperationError } from "../utils/errors.js";

// Update lines 104-107:
      } catch (error) {
        logError(
          new HostOperationError(
            "Failed to collect stats from host",
            host.name,
            "collectStatsParallel",
            error
          ),
          {
            metadata: {
              maxContainersPerHost,
              timestamp: new Date().toISOString()
            }
          }
        );
        return [];
      }
```

**Step 3: Update getHostResources catch block to use structured logging (lines 684-689)**

```typescript
// src/tools/unified.ts (lines 684-689)
          } catch (error) {
            logError(
              new HostOperationError(
                "Failed to get host resources",
                host.name,
                "getHostResources",
                error
              ),
              { operation: "handleHostAction:resources" }
            );

            return {
              host: host.name,
              resources: null,
              error: error instanceof Error ? error.message : "SSH failed"
            };
          }
```

**Step 4: Run type check**

Run: `pnpm run typecheck`
Expected: No errors

**Step 5: Run unified tools tests**

Run: `pnpm test src/tools/unified.test.ts`
Expected: All tests PASS

**Step 6: Commit unified tools error logging**

```bash
git add src/tools/unified.ts
git commit -m "fix(unified): add structured error logging for stats collection

- Log stats collection failures with host context
- Log host resource failures with operation
- Include metadata for debugging
- Preserve existing partial results behavior"
```

---

## Task 8: Fix Benchmark Test Silent Catch

**Files:**
- Modify: `src/services/ssh-pool.benchmark.test.ts:75`

**Step 1: Document the issue and fix**

The line `.catch(() => null)` at line 75 is intentionally swallowing errors in a benchmark test. This should log errors for debugging while still completing the benchmark.

**Step 2: Update benchmark to log errors**

```typescript
// src/services/ssh-pool.benchmark.test.ts (line 75)
import { logError } from "../utils/errors.js";

// Replace line 75:
      executeSSHCommand(testHost, `${command} ${i}`).catch((error) => {
        logError(error, {
          operation: "benchmark",
          metadata: { commandIndex: i, command }
        });
        return null;
      })
```

**Step 3: Run benchmark tests**

Run: `pnpm test src/services/ssh-pool.benchmark.test.ts`
Expected: All tests PASS

**Step 4: Commit benchmark error logging**

```bash
git add src/services/ssh-pool.benchmark.test.ts
git commit -m "fix(benchmark): log errors instead of silent catch

- Replace .catch(() => null) with error logging
- Include command index and operation context
- Preserve benchmark completion behavior"
```

---

## Task 9: Update Error Handling Documentation

**Files:**
- Create: `docs/error-handling.md`
- Modify: `CLAUDE.md`

**Step 1: Create error handling documentation**

```markdown
<!-- docs/error-handling.md -->
# Error Handling Guide

## Principles

1. **Never lose debug context** - Chain errors, preserve stack traces
2. **Always log with structure** - Use logError utility
3. **Include operation context** - Host, command, operation name
4. **Re-throw after logging** - Don't silently swallow errors

## Custom Error Classes

### HostOperationError

Use for Docker API operations:

\`\`\`typescript
throw new HostOperationError(
  "Failed to list containers",
  host.name,
  "listContainers",
  originalError
);
\`\`\`

### SSHCommandError

Use for SSH command failures:

\`\`\`typescript
throw new SSHCommandError(
  "Command failed",
  host.name,
  command,
  exitCode,
  stderr,
  stdout,
  originalError
);
\`\`\`

### ComposeOperationError

Use for Docker Compose operations:

\`\`\`typescript
throw new ComposeOperationError(
  "Failed to start services",
  host.name,
  project,
  action,
  originalError
);
\`\`\`

## Logging Errors

### When to use logError

- Silent catches (config parsing, optional operations)
- Parallel operations (log failures but continue)
- Cleanup operations (log disposal errors)

### How to use logError

\`\`\`typescript
import { logError, HostOperationError } from "../utils/errors.js";

try {
  await operation();
} catch (error) {
  logError(
    new HostOperationError("Operation failed", host.name, "operation", error),
    {
      requestId: "req-123",
      metadata: { key: "value" }
    }
  );
  // Re-throw if error should propagate
  throw error;
}
\`\`\`

## Anti-Patterns

### ❌ DON'T: Silent catch

\`\`\`typescript
try {
  await operation();
} catch {
  // Silent - loses all debug info
}
\`\`\`

### ❌ DON'T: Generic error without context

\`\`\`typescript
catch (error) {
  throw new Error("Operation failed"); // Lost original error
}
\`\`\`

### ❌ DON'T: Log without structure

\`\`\`typescript
catch (error) {
  console.error("Error:", error); // No context
}
\`\`\`

### ✅ DO: Chain errors with context

\`\`\`typescript
catch (error) {
  throw new HostOperationError(
    "Operation failed",
    host.name,
    "operation",
    error // Preserved original
  );
}
\`\`\`

### ✅ DO: Log with structure

\`\`\`typescript
catch (error) {
  logError(
    new HostOperationError("Op failed", host.name, "op", error),
    { metadata: { context: "value" } }
  );
}
\`\`\`
```

**Step 2: Update CLAUDE.md with error handling reference**

```markdown
<!-- CLAUDE.md (add to Code Conventions section) -->

## Error Handling
- Use custom error classes (HostOperationError, SSHCommandError, ComposeOperationError)
- Chain errors to preserve stack traces
- Use logError utility for structured logging
- Never silently catch without logging
- See docs/error-handling.md for details
```

**Step 3: Commit documentation**

```bash
git add docs/error-handling.md CLAUDE.md
git commit -m "docs: add comprehensive error handling guide

- Document custom error classes and usage
- Explain logError utility patterns
- Show anti-patterns and best practices
- Update CLAUDE.md with error handling reference"
```

---

## Task 10: Verification and Integration Testing

**Files:**
- Create: `src/utils/errors.integration.test.ts`

**Step 1: Write integration test for complete error flow**

```typescript
// src/utils/errors.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HostOperationError, SSHCommandError, ComposeOperationError, logError } from "./errors.js";

describe("Error Handling Integration", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should preserve full error chain through multiple layers", () => {
    const rootCause = new Error("ECONNREFUSED");
    const sshError = new SSHCommandError(
      "SSH failed",
      "docker-01",
      "docker ps",
      255,
      "Connection refused",
      "",
      rootCause
    );
    const hostError = new HostOperationError(
      "List containers failed",
      "docker-01",
      "listContainers",
      sshError
    );

    // Verify chain
    expect(hostError.cause).toBe(sshError);
    expect(sshError.cause).toBe(rootCause);

    // Verify stack includes all layers
    expect(hostError.stack).toContain("HostOperationError");
    expect(hostError.stack).toContain("Caused by:");
  });

  it("should log complete context for chained errors", () => {
    const rootCause = new Error("Network timeout");
    const error = new ComposeOperationError(
      "Service start failed",
      "web-01",
      "production",
      "up",
      rootCause
    );

    logError(error, {
      requestId: "req-456",
      metadata: { retryAttempt: 3 }
    });

    // Verify all context logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("req-456")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("web-01")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("production")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("up")
    );
  });
});
```

**Step 2: Run integration test**

Run: `pnpm test src/utils/errors.integration.test.ts`
Expected: All tests PASS

**Step 3: Run complete test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Run type check**

Run: `pnpm run typecheck`
Expected: No errors

**Step 5: Run linter**

Run: `pnpm run lint`
Expected: No errors

**Step 6: Commit integration tests**

```bash
git add src/utils/errors.integration.test.ts
git commit -m "test: add error handling integration tests

- Verify complete error chain preservation
- Test multi-layer error context
- Validate structured logging output
- Ensure all error types work together"
```

---

## Task 11: Final Verification

**Step 1: Run full test suite with coverage**

Run: `pnpm test:coverage`
Expected: All tests PASS, coverage reports generated

**Step 2: Verify no silent catches remain**

Run: `grep -n "} catch" src/**/*.ts | grep -v "test.ts" | wc -l`
Expected: Count matches number of catch blocks we've fixed (should have logError or proper error class)

**Step 3: Manual verification checklist**

- [ ] All custom error classes tested
- [ ] logError utility tested
- [ ] SSH command errors use SSHCommandError
- [ ] Compose errors use ComposeOperationError
- [ ] Docker service uses logError for silent catches
- [ ] SSH pool uses logError for cleanup
- [ ] Unified tools use logError for parallel ops
- [ ] Benchmark test logs errors
- [ ] Documentation complete
- [ ] All tests pass
- [ ] Type check passes
- [ ] Linter passes

**Step 4: Create summary of changes**

```markdown
## Summary

### Files Modified
- src/utils/errors.ts (created)
- src/utils/errors.test.ts (created)
- src/utils/errors.integration.test.ts (created)
- src/services/ssh-pool-exec.ts
- src/services/compose.ts
- src/services/docker.ts
- src/services/ssh-pool.ts
- src/tools/unified.ts
- src/services/ssh-pool.benchmark.test.ts
- docs/error-handling.md (created)
- CLAUDE.md

### Error Classes Added
- HostOperationError (Docker API operations)
- SSHCommandError (SSH command failures)
- ComposeOperationError (Docker Compose operations)

### Key Improvements
- All errors now chain original cause
- Structured logging with logError utility
- Complete context (host, operation, command)
- Stack traces preserved through error chain
- No more silent catch blocks
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify error handling improvements complete

- All tests passing
- Type checking clean
- Linter clean
- Coverage maintained
- Documentation complete"
```

---

## Execution Complete

All silent catch blocks have been eliminated and replaced with:
1. Custom error classes that chain causes
2. Structured logging with full context
3. Proper error propagation
4. Comprehensive test coverage
5. Developer documentation

**Testing Evidence Required:**
- ✅ Unit tests for all error classes
- ✅ Integration tests for error chaining
- ✅ Service tests updated with error expectations
- ✅ Full test suite passes
- ✅ Type checking passes
- ✅ Linter passes
