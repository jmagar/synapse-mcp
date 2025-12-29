# Dependency Injection Architecture

## Overview

This document describes the dependency injection (DI) architecture implemented in the homelab-mcp-server. The refactoring from global state and function exports to a class-based DI system provides improved testability, maintainability, and explicit dependency management.

## What is Dependency Injection?

Dependency Injection is a design pattern where components receive their dependencies from external sources rather than creating them internally. Instead of:

```typescript
// BEFORE: Hard-coded dependency creation
class ComposeService {
  private ssh = new SSHService(); // Tightly coupled
}
```

We now have:

```typescript
// AFTER: Dependency injection
class ComposeService {
  constructor(private sshService: ISSHService) {} // Injected dependency
}
```

## Why We Refactored to DI

### Problems with Global State

The original architecture used global singleton instances and function exports:

```typescript
// OLD: Global state (removed)
let globalSSHPool: SSHConnectionPool | null = null;
let globalDockerClient: Docker | null = null;

export function getSSHPool() {
  if (!globalSSHPool) globalSSHPool = new SSHConnectionPool();
  return globalSSHPool;
}
```

**Issues:**
- Tight coupling between modules
- Difficult to test (can't mock globals easily)
- Hidden dependencies (functions implicitly use globals)
- Initialization order problems
- No explicit lifecycle management
- State shared across all callers

### Benefits of DI Architecture

1. **Testability**: Easy to inject mock services in tests
2. **Flexibility**: Swap implementations without changing consumer code
3. **Explicit Dependencies**: Constructor parameters show what a class needs
4. **Lifecycle Control**: Container manages creation and cleanup
5. **No Global State**: Each instance has its own dependency graph
6. **Type Safety**: Interfaces enforce contracts between layers

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      ServiceContainer                        │
│  (Central dependency management and lazy initialization)    │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│DockerService │   │SSHConnection │   │  SSHService  │
│              │   │   PoolImpl   │   │              │
│ (no deps)    │   │  (no deps)   │   │  (needs pool)│
└──────────────┘   └──────────────┘   └──────────────┘
                            │                   │
                            └───────────────────┘
                                        │
                                        ▼
                            ┌──────────────────┐
                            │ ComposeService   │
                            │                  │
                            │ (needs SSH svc)  │
                            └──────────────────┘
                                        │
                                        ▼
                            ┌──────────────────┐
                            │   Tool Layer     │
                            │                  │
                            │  (uses services  │
                            │  via container)  │
                            └──────────────────┘
```

## Service Descriptions

### ServiceContainer

**Location:** `src/services/container.ts`

**Purpose:** Central registry for all service instances with lazy initialization and lifecycle management.

**Key Features:**
- Lazy initialization (services created on first access)
- Singleton pattern per container instance
- Automatic dependency wiring
- Cleanup coordination during shutdown
- Getter/setter methods for testing overrides

**Dependency Chain:**
```
SSHConnectionPool (no dependencies)
    ↓
SSHService (requires SSHConnectionPool)
    ↓
ComposeService (requires SSHService)

DockerService (independent, no dependencies)
```

### IDockerService / DockerService

**Location:** `src/services/interfaces.ts`, `src/services/docker.ts`

**Purpose:** Docker API client management and container operations.

**Responsibilities:**
- Create and cache Docker clients (dockerode) per host
- Container lifecycle operations (start, stop, restart, pause, unpause)
- Container inspection and log retrieval
- Image operations (list, pull, build, remove, prune)
- Docker daemon info and disk usage queries
- Multi-host parallel operations

**No Dependencies** - Works independently, only requires host configuration.

### ISSHConnectionPool / SSHConnectionPoolImpl

**Location:** `src/services/interfaces.ts`, `src/services/ssh-pool.ts`

**Purpose:** Reusable SSH connection pooling for better performance.

**Responsibilities:**
- Establish and maintain SSH connections
- Pool management (acquire, release, cleanup)
- Connection health monitoring
- Idle timeout management
- Statistics tracking

**No Dependencies** - Base layer of the dependency chain.

### ISSHService / SSHService

**Location:** `src/services/interfaces.ts`, `src/services/ssh-service.ts`

**Purpose:** Secure SSH command execution on remote hosts.

**Dependencies:**
- `ISSHConnectionPool` (injected via constructor)

**Responsibilities:**
- Execute commands via SSH using connection pool
- Parse and return stdout/stderr
- Handle timeouts and error conditions
- Gather host resource metrics (CPU, memory, disk)

### IComposeService / ComposeService

**Location:** `src/services/interfaces.ts`, `src/services/compose.ts`

**Purpose:** Docker Compose project management.

**Dependencies:**
- `ISSHService` (injected via constructor)

**Responsibilities:**
- Execute docker compose commands via SSH
- Project lifecycle (up, down, restart, recreate)
- Service status queries and log retrieval
- Image operations (build, pull)
- Input validation and security sanitization

## Code Examples

### 1. Creating a Container

```typescript
import { createDefaultContainer } from "./services/container.js";

// Create container (services not yet initialized)
const container = createDefaultContainer();

// Services are lazy-initialized on first access
const dockerService = container.getDockerService();
const sshService = container.getSSHService();
const composeService = container.getComposeService();
```

### 2. Using Services in Tools

```typescript
import type { ServiceContainer } from "./services/container.js";

export function registerTools(server: McpServer, container: ServiceContainer): void {
  server.addTool({
    name: "list_containers",
    description: "List Docker containers across hosts",
    inputSchema: { /* schema */ },
    async handler(input) {
      const dockerService = container.getDockerService();
      const containers = await dockerService.listContainers(hosts, options);
      return { content: [{ type: "text", text: formatContainers(containers) }] };
    }
  });

  server.addTool({
    name: "compose_up",
    description: "Start a Docker Compose project",
    inputSchema: { /* schema */ },
    async handler(input) {
      const composeService = container.getComposeService();
      const result = await composeService.composeUp(host, project, detach);
      return { content: [{ type: "text", text: result }] };
    }
  });
}
```

### 3. Testing with Mocked Services

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("ComposeService", () => {
  let mockSSH: ISSHService;
  let composeService: ComposeService;

  beforeEach(() => {
    // Create a mock SSH service
    mockSSH = {
      executeSSHCommand: vi.fn().mockResolvedValue("success"),
      getHostResources: vi.fn().mockResolvedValue({
        hostname: "test-host",
        uptime: "1 day",
        loadAverage: [0.5, 0.6, 0.7],
        cpu: { cores: 4, usagePercent: 25.0 },
        memory: { totalMB: 16384, usedMB: 8192, freeMB: 8192, usagePercent: 50.0 },
        disk: []
      })
    };

    // Inject mock into service
    composeService = new ComposeService(mockSSH);
  });

  it("executes compose up command", async () => {
    const host: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "http"
    };

    await composeService.composeUp(host, "myproject", true);

    // Verify mock was called with correct command
    expect(mockSSH.executeSSHCommand).toHaveBeenCalledWith(
      host,
      "docker compose -p myproject up -d",
      [],
      { timeoutMs: 30000 }
    );
  });
});
```

### 4. Testing with Container Overrides

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ServiceContainer } from "./container.js";
import type { IDockerService } from "./interfaces.js";

describe("Tool Integration", () => {
  let container: ServiceContainer;
  let mockDockerService: IDockerService;

  beforeEach(() => {
    container = new ServiceContainer();

    // Create mock service
    mockDockerService = {
      listContainers: vi.fn().mockResolvedValue([]),
      getDockerClient: vi.fn(),
      containerAction: vi.fn(),
      // ... other methods
    };

    // Override service in container
    container.setDockerService(mockDockerService);
  });

  it("uses injected mock service", async () => {
    const dockerService = container.getDockerService();
    const containers = await dockerService.listContainers([], {});

    expect(mockDockerService.listContainers).toHaveBeenCalled();
    expect(containers).toEqual([]);
  });
});
```

### 5. Cleanup on Shutdown

```typescript
// In src/index.ts

let globalContainer: ServiceContainer | undefined;

async function runStdio(): Promise<void> {
  const server = createServer();

  // Create container
  globalContainer = createDefaultContainer();

  // Register tools with container
  registerTools(server, globalContainer);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  console.error(`Received ${signal}, shutting down gracefully...`);
  if (globalContainer) {
    // Clean up all services:
    // - Close SSH connections
    // - Clear Docker client cache
    await globalContainer.cleanup();
  }
  console.error("Cleanup complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

## Migration Notes

### What Was Removed

The following global state and function exports have been removed:

**From `src/services/ssh.ts`:**
- `globalSSHService` (global singleton)
- `getGlobalSSHService()` (global accessor)
- Deprecated: `getHostResources()` function export (use `SSHService.getHostResources()` instead)

**Pattern Change:**
- OLD: `import { getHostResources } from "./services/ssh.js"`
- NEW: `const sshService = container.getSSHService(); sshService.getHostResources(host)`

### Classes Are Required

All services are now class-based with explicit dependencies:

```typescript
// OLD: Function export
export function composeUp(host, project) {
  const ssh = getGlobalSSH(); // Hidden dependency
  return ssh.exec("docker compose up");
}

// NEW: Class with injected dependency
export class ComposeService {
  constructor(private sshService: ISSHService) {} // Explicit dependency

  async composeUp(host: HostConfig, project: string): Promise<string> {
    return this.sshService.executeSSHCommand(
      host,
      "docker compose up",
      [],
      { timeoutMs: 30000 }
    );
  }
}
```

### How to Use in New Code

**Step 1:** Get service container (usually passed to your module)

```typescript
import type { ServiceContainer } from "./services/container.js";

export function registerMyTools(server: McpServer, container: ServiceContainer) {
  // Services available via container
}
```

**Step 2:** Access services as needed

```typescript
// Get service instances
const dockerService = container.getDockerService();
const sshService = container.getSSHService();
const composeService = container.getComposeService();

// Use service methods
const containers = await dockerService.listContainers(hosts, options);
const resources = await sshService.getHostResources(host);
const status = await composeService.getComposeStatus(host, project);
```

**Step 3:** For tests, inject mocks

```typescript
beforeEach(() => {
  const container = new ServiceContainer();

  // Override with mocks
  container.setDockerService(mockDockerService);
  container.setSSHService(mockSSHService);

  // Use in tests
  myFunction(container);
});
```

## Design Principles

### Interface-Based Design

All services implement interfaces (`IDockerService`, `ISSHService`, etc.). This enables:
- Easy mocking in tests
- Swap implementations without changing consumers
- Clear contracts between layers

### Lazy Initialization

Services are created only when first accessed:

```typescript
getSSHService(): ISSHService {
  if (!this.sshService) {
    // Create service and wire dependencies
    this.sshService = new SSHService(this.getSSHConnectionPool());
  }
  return this.sshService;
}
```

Benefits:
- Fast container creation
- Only create services you actually use
- Automatic dependency resolution

### Single Responsibility

Each service has a focused purpose:
- **DockerService**: Docker API operations only
- **SSHService**: SSH command execution only
- **ComposeService**: Docker Compose operations only
- **ServiceContainer**: Service lifecycle management only

### Explicit Dependencies

Dependencies are constructor parameters, not hidden globals:

```typescript
// Clear from signature what this class needs
constructor(private sshService: ISSHService) {}
```

Advantages:
- Easy to see what a class depends on
- Impossible to forget dependencies
- Self-documenting code

## Advanced Patterns

### Custom Service Implementations

You can provide custom implementations for any service:

```typescript
import { ServiceContainer } from "./services/container.js";
import type { ISSHService } from "./services/interfaces.js";

class CustomSSHService implements ISSHService {
  async executeSSHCommand(host, command, args, options) {
    // Custom implementation
    console.log(`Executing: ${command}`);
    // ...
  }

  async getHostResources(host) {
    // Custom resource gathering
    // ...
  }
}

const container = new ServiceContainer();
container.setSSHService(new CustomSSHService());
```

### Multiple Containers

You can create multiple containers for different contexts:

```typescript
// Development container with mocks
const devContainer = new ServiceContainer();
devContainer.setDockerService(mockDockerService);

// Production container with real services
const prodContainer = createDefaultContainer();

// Use appropriate container for context
const container = process.env.NODE_ENV === "production" ? prodContainer : devContainer;
```

## Summary

The dependency injection architecture provides:

1. **Better Testing**: Mock services easily in tests
2. **Clear Dependencies**: Explicit constructor parameters
3. **Lifecycle Management**: Container handles creation and cleanup
4. **No Globals**: Eliminated global state and hidden dependencies
5. **Type Safety**: Interfaces enforce contracts
6. **Flexibility**: Swap implementations without changing consumers
7. **Maintainability**: Each service has a single, focused responsibility

All new code should:
- Use services via `ServiceContainer`
- Inject dependencies via constructor parameters
- Implement service interfaces for testability
- Avoid creating global state or singletons
