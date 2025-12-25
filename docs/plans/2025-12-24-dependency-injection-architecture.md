# Dependency Injection Architecture Implementation Plan

**Created:** 11:35:18 PM | 12/24/2025 (EST)

> **Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce dependency injection architecture to eliminate global singletons, improve testability, and enable service composition.

**Architecture:** Constructor injection pattern with factory functions. Create service interfaces, implement default factories, refactor services to accept dependencies via constructors, update tool handlers to use injected services. No heavy DI containers (YAGNI).

**Tech Stack:** TypeScript 5.7+, Vitest, existing service layer (Docker, SSH, Compose)

---

## Table of Contents

1. [Phase 1: Service Interfaces](#phase-1-service-interfaces)
2. [Phase 2: Docker Service DI](#phase-2-docker-service-di)
3. [Phase 3: SSH Pool DI](#phase-3-ssh-pool-di)
4. [Phase 4: Compose Service DI](#phase-4-compose-service-di)
5. [Phase 5: Service Container](#phase-5-service-container)
6. [Phase 6: Tool Handler Refactoring](#phase-6-tool-handler-refactoring)
7. [Phase 7: Integration & Cleanup](#phase-7-integration--cleanup)

---

## Current Architecture Issues

### Problem 1: Global Singletons
```typescript
// src/services/docker.ts:26
export const dockerClients = new Map<string, Docker>();

// src/services/ssh-pool-exec.ts:7
let globalPool: SSHConnectionPool | null = null;
```

**Impact:** Cannot test services in isolation, shared state across tests, no way to inject mocks.

### Problem 2: Hardcoded Dependencies
```typescript
// src/tools/unified.ts:1-32
import { listContainers, containerAction, ... } from "../services/docker.js";
import { getHostResources } from "../services/ssh.js";
import { listComposeProjects, ... } from "../services/compose.js";
```

**Impact:** Tool handlers tightly coupled to service implementations, cannot swap services for testing.

### Problem 3: Direct Instantiation
```typescript
// src/services/docker.ts:149-171
export function getDockerClient(config: HostConfig): Docker {
  // ... directly instantiates new Docker()
  docker = new Docker({ socketPath });
}
```

**Impact:** Cannot inject test doubles, forces integration tests for everything.

---

## Phase 1: Service Interfaces

**Goal:** Define TypeScript interfaces for all services to establish contracts.

### Task 1: Create Service Interface File

**Files:**
- Create: `src/services/interfaces.ts`

**Step 1: Write interface tests first**

Create: `src/services/interfaces.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type {
  IDockerService,
  ISSHService,
  IComposeService,
  ISSHConnectionPool
} from "./interfaces.js";

describe("Service Interfaces", () => {
  it("should define IDockerService interface", () => {
    const mockService: IDockerService = {
      getDockerClient: () => ({}) as any,
      listContainers: async () => [],
      containerAction: async () => {},
      getContainerLogs: async () => [],
      getContainerStats: async () => ({}) as any,
      findContainerHost: async () => null,
      getHostStatus: async () => [],
      listImages: async () => [],
      inspectContainer: async () => ({}) as any,
      getDockerInfo: async () => ({}) as any,
      getDockerDiskUsage: async () => ({}) as any,
      pruneDocker: async () => [],
      pullImage: async () => ({ status: "ok" }),
      recreateContainer: async () => ({ status: "ok", containerId: "id" }),
      removeImage: async () => ({ status: "ok" }),
      buildImage: async () => ({ status: "ok" })
    };

    expect(mockService).toBeDefined();
  });

  it("should define ISSHService interface", () => {
    const mockService: ISSHService = {
      executeCommand: async () => "",
      getHostResources: async () => ({}) as any
    };

    expect(mockService).toBeDefined();
  });

  it("should define IComposeService interface", () => {
    const mockService: IComposeService = {
      composeExec: async () => "",
      listComposeProjects: async () => [],
      getComposeStatus: async () => ({}) as any,
      composeUp: async () => "",
      composeDown: async () => "",
      composeRestart: async () => "",
      composeLogs: async () => "",
      composeBuild: async () => "",
      composePull: async () => "",
      composeRecreate: async () => ""
    };

    expect(mockService).toBeDefined();
  });

  it("should define ISSHConnectionPool interface", () => {
    const mockPool: ISSHConnectionPool = {
      getConnection: async () => ({}) as any,
      releaseConnection: async () => {},
      closeConnection: async () => {},
      closeAll: async () => {},
      getStats: () => ({}) as any
    };

    expect(mockPool).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/interfaces.test.ts`

Expected: FAIL with "Cannot find module './interfaces.js'"

**Step 3: Create service interfaces**

Create: `src/services/interfaces.ts`

```typescript
import type { HostConfig, ContainerInfo, ContainerStats, HostStatus, LogEntry, ImageInfo, ComposeProject } from "../types.js";
import type Docker from "dockerode";
import type { NodeSSH } from "node-ssh";
import type { HostResources } from "./ssh.js";
import type { DockerSystemInfo, DockerDiskUsage, PruneResult, ListImagesOptions } from "./docker.js";
import type { ComposeService } from "./compose.js";
import type { PoolStats } from "./ssh-pool.js";

/**
 * Docker service interface
 * Handles all Docker API operations across multiple hosts
 */
export interface IDockerService {
  getDockerClient(config: HostConfig): Docker;

  listContainers(
    hosts: HostConfig[],
    options?: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    }
  ): Promise<ContainerInfo[]>;

  containerAction(
    containerId: string,
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    host: HostConfig
  ): Promise<void>;

  getContainerLogs(
    containerId: string,
    host: HostConfig,
    options?: {
      lines?: number;
      since?: string;
      until?: string;
      stream?: "all" | "stdout" | "stderr";
    }
  ): Promise<LogEntry[]>;

  getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats>;

  findContainerHost(
    containerId: string,
    hosts: HostConfig[]
  ): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null>;

  getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]>;

  listImages(hosts: HostConfig[], options?: ListImagesOptions): Promise<ImageInfo[]>;

  inspectContainer(containerId: string, host: HostConfig): Promise<Docker.ContainerInspectInfo>;

  getDockerInfo(host: HostConfig): Promise<DockerSystemInfo>;

  getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage>;

  pruneDocker(
    host: HostConfig,
    target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
  ): Promise<PruneResult[]>;

  pullImage(imageName: string, host: HostConfig): Promise<{ status: string }>;

  recreateContainer(
    containerId: string,
    host: HostConfig,
    options?: { pull?: boolean }
  ): Promise<{ status: string; containerId: string }>;

  removeImage(
    imageId: string,
    host: HostConfig,
    options?: { force?: boolean }
  ): Promise<{ status: string }>;

  buildImage(
    host: HostConfig,
    options: {
      context: string;
      tag: string;
      dockerfile?: string;
      noCache?: boolean;
    }
  ): Promise<{ status: string }>;
}

/**
 * SSH service interface
 * Handles SSH command execution and resource monitoring
 */
export interface ISSHService {
  executeCommand(
    host: HostConfig,
    command: string,
    args?: string[],
    options?: { timeoutMs?: number }
  ): Promise<string>;

  getHostResources(host: HostConfig): Promise<HostResources>;
}

/**
 * Compose service interface
 * Handles Docker Compose operations
 */
export interface IComposeService {
  composeExec(
    host: HostConfig,
    project: string,
    action: string,
    extraArgs?: string[]
  ): Promise<string>;

  listComposeProjects(host: HostConfig): Promise<ComposeProject[]>;

  getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject>;

  composeUp(host: HostConfig, project: string, detach?: boolean): Promise<string>;

  composeDown(host: HostConfig, project: string, removeVolumes?: boolean): Promise<string>;

  composeRestart(host: HostConfig, project: string): Promise<string>;

  composeLogs(
    host: HostConfig,
    project: string,
    options?: {
      tail?: number;
      follow?: boolean;
      timestamps?: boolean;
      since?: string;
      until?: string;
      services?: string[];
    }
  ): Promise<string>;

  composeBuild(
    host: HostConfig,
    project: string,
    options?: { service?: string; noCache?: boolean; pull?: boolean }
  ): Promise<string>;

  composePull(
    host: HostConfig,
    project: string,
    options?: { service?: string; ignorePullFailures?: boolean; quiet?: boolean }
  ): Promise<string>;

  composeRecreate(
    host: HostConfig,
    project: string,
    options?: { service?: string; forceRecreate?: boolean; noDeps?: boolean }
  ): Promise<string>;
}

/**
 * SSH Connection Pool interface
 * Manages SSH connection pooling and lifecycle
 */
export interface ISSHConnectionPool {
  getConnection(host: HostConfig): Promise<NodeSSH>;
  releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void>;
  closeConnection(host: HostConfig): Promise<void>;
  closeAll(): Promise<void>;
  getStats(): PoolStats;
}

/**
 * Service factory interface
 * Creates service instances with dependencies injected
 */
export interface IServiceFactory {
  createDockerService(): IDockerService;
  createSSHService(pool: ISSHConnectionPool): ISSHService;
  createComposeService(sshService: ISSHService): IComposeService;
  createSSHConnectionPool(config?: Partial<{ maxConnections: number }>): ISSHConnectionPool;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/interfaces.test.ts`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/services/interfaces.ts src/services/interfaces.test.ts
git commit -m "feat(di): add service interfaces for dependency injection

- Define IDockerService interface (18 methods)
- Define ISSHService interface (2 methods)
- Define IComposeService interface (9 methods)
- Define ISSHConnectionPool interface (5 methods)
- Define IServiceFactory interface for creating services
- Add comprehensive interface tests"
```

---

## Phase 2: Docker Service DI

**Goal:** Refactor Docker service to support dependency injection while maintaining backward compatibility.

### Task 2: Create Docker Service Class

**Files:**
- Modify: `src/services/docker.ts:1-1060`
- Create: `src/services/docker-service.test.ts`

**Step 1: Write test for DockerService class**

Create: `src/services/docker-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DockerService } from "./docker.js";
import type { HostConfig } from "../types.js";
import type Docker from "dockerode";

describe("DockerService", () => {
  let service: DockerService;
  let mockDockerFactory: (config: HostConfig) => Docker;

  beforeEach(() => {
    // Create a mock factory that returns mock Docker instances
    mockDockerFactory = vi.fn((config: HostConfig) => {
      return {
        listContainers: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue(true),
        info: vi.fn().mockResolvedValue({}),
        version: vi.fn().mockResolvedValue({})
      } as unknown as Docker;
    });

    service = new DockerService(mockDockerFactory);
  });

  it("should create DockerService instance", () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(DockerService);
  });

  it("should use injected factory to create Docker clients", () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const client = service.getDockerClient(hostConfig);

    expect(mockDockerFactory).toHaveBeenCalledWith(hostConfig);
    expect(client).toBeDefined();
  });

  it("should cache Docker clients by host", () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const client1 = service.getDockerClient(hostConfig);
    const client2 = service.getDockerClient(hostConfig);

    expect(mockDockerFactory).toHaveBeenCalledTimes(1);
    expect(client1).toBe(client2);
  });

  it("should support listContainers operation", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "localhost",
      protocol: "http",
      dockerSocketPath: "/var/run/docker.sock"
    };

    const containers = await service.listContainers([hostConfig]);

    expect(containers).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/docker-service.test.ts`

Expected: FAIL with "DockerService is not a constructor" or "cannot find export"

**Step 3: Implement DockerService class wrapper**

Modify: `src/services/docker.ts`

Add at the end of the file (before exports):

```typescript
/**
 * Docker service class with dependency injection support
 *
 * Wraps all Docker operations to support constructor injection.
 * Backward compatible - existing functions still work via singleton.
 */
export class DockerService implements IDockerService {
  private clientCache: Map<string, Docker>;
  private dockerFactory: (config: HostConfig) => Docker;

  /**
   * Create a new DockerService instance
   *
   * @param dockerFactory - Optional factory function to create Docker clients
   *                        Defaults to createDefaultDockerClient for backward compatibility
   */
  constructor(dockerFactory?: (config: HostConfig) => Docker) {
    this.clientCache = new Map();
    this.dockerFactory = dockerFactory || createDefaultDockerClient;
  }

  /**
   * Get or create Docker client for a host
   * Uses injected factory for client creation
   */
  getDockerClient(config: HostConfig): Docker {
    const cacheKey = `${config.name}-${config.host}`;

    const cached = this.clientCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const docker = this.dockerFactory(config);
    this.clientCache.set(cacheKey, docker);
    return docker;
  }

  /**
   * Clear all cached Docker clients
   */
  clearClients(): void {
    this.clientCache.clear();
  }

  // Delegate all operations to existing functions, using our client cache
  async listContainers(
    hosts: HostConfig[],
    options: {
      state?: "all" | "running" | "stopped" | "paused";
      nameFilter?: string;
      imageFilter?: string;
      labelFilter?: string;
    } = {}
  ): Promise<ContainerInfo[]> {
    // Use internal cache instead of global
    const originalClients = dockerClients;
    (global as any).dockerClients = this.clientCache;

    try {
      return await listContainers(hosts, options);
    } finally {
      (global as any).dockerClients = originalClients;
    }
  }

  async containerAction(
    containerId: string,
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    host: HostConfig
  ): Promise<void> {
    return containerAction(containerId, action, host);
  }

  async getContainerLogs(
    containerId: string,
    host: HostConfig,
    options: {
      lines?: number;
      since?: string;
      until?: string;
      stream?: "all" | "stdout" | "stderr";
    } = {}
  ): Promise<LogEntry[]> {
    return getContainerLogs(containerId, host, options);
  }

  async getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats> {
    return getContainerStats(containerId, host);
  }

  async findContainerHost(
    containerId: string,
    hosts: HostConfig[]
  ): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null> {
    return findContainerHost(containerId, hosts);
  }

  async getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]> {
    return getHostStatus(hosts);
  }

  async listImages(hosts: HostConfig[], options: ListImagesOptions = {}): Promise<ImageInfo[]> {
    return listImages(hosts, options);
  }

  async inspectContainer(containerId: string, host: HostConfig): Promise<Docker.ContainerInspectInfo> {
    return inspectContainer(containerId, host);
  }

  async getDockerInfo(host: HostConfig): Promise<DockerSystemInfo> {
    return getDockerInfo(host);
  }

  async getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage> {
    return getDockerDiskUsage(host);
  }

  async pruneDocker(
    host: HostConfig,
    target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
  ): Promise<PruneResult[]> {
    return pruneDocker(host, target);
  }

  async pullImage(imageName: string, host: HostConfig): Promise<{ status: string }> {
    return pullImage(imageName, host);
  }

  async recreateContainer(
    containerId: string,
    host: HostConfig,
    options: { pull?: boolean } = {}
  ): Promise<{ status: string; containerId: string }> {
    return recreateContainer(containerId, host, options);
  }

  async removeImage(
    imageId: string,
    host: HostConfig,
    options: { force?: boolean } = {}
  ): Promise<{ status: string }> {
    return removeImage(imageId, host, options);
  }

  async buildImage(
    host: HostConfig,
    options: {
      context: string;
      tag: string;
      dockerfile?: string;
      noCache?: boolean;
    }
  ): Promise<{ status: string }> {
    return buildImage(host, options);
  }
}

/**
 * Create default Docker client (backward compatibility)
 * Extracted from getDockerClient for reuse in class constructor
 */
function createDefaultDockerClient(config: HostConfig): Docker {
  const socketPath = config.dockerSocketPath || (isSocketPath(config.host) ? config.host : null);

  if (socketPath) {
    return new Docker({ socketPath });
  } else if (config.protocol === "http" || config.protocol === "https") {
    return new Docker({
      host: config.host,
      port: config.port || 2375,
      protocol: config.protocol,
      timeout: API_TIMEOUT
    });
  } else {
    throw new Error(`Unsupported protocol: ${config.protocol}`);
  }
}
```

Add import at top:

```typescript
import type { IDockerService } from "./interfaces.js";
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/docker-service.test.ts`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/services/docker.ts src/services/docker-service.test.ts
git commit -m "feat(di): add DockerService class with constructor injection

- Create DockerService class implementing IDockerService
- Support factory injection for Docker client creation
- Maintain backward compatibility with existing functions
- Add comprehensive unit tests
- Extract createDefaultDockerClient for reuse"
```

---

## Phase 3: SSH Pool DI

**Goal:** Refactor SSH pool to support dependency injection.

### Task 3: Make SSH Pool Injectable

**Files:**
- Modify: `src/services/ssh-pool-exec.ts:1-132`
- Create: `src/services/ssh-service.test.ts`

**Step 1: Write test for SSHService class**

Create: `src/services/ssh-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SSHService } from "./ssh.js";
import type { ISSHConnectionPool } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("SSHService", () => {
  let service: SSHService;
  let mockPool: ISSHConnectionPool;

  beforeEach(() => {
    mockPool = {
      getConnection: vi.fn().mockResolvedValue({
        execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "test output", stderr: "" })
      }),
      releaseConnection: vi.fn().mockResolvedValue(undefined),
      closeConnection: vi.fn().mockResolvedValue(undefined),
      closeAll: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({
        poolHits: 0,
        poolMisses: 0,
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        healthChecksPassed: 0,
        healthCheckFailures: 0
      })
    };

    service = new SSHService(mockPool);
  });

  it("should create SSHService instance", () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(SSHService);
  });

  it("should execute SSH commands using injected pool", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh",
      sshUser: "admin"
    };

    const result = await service.executeCommand(hostConfig, "echo test");

    expect(result).toBe("test output");
    expect(mockPool.getConnection).toHaveBeenCalledWith(hostConfig);
    expect(mockPool.releaseConnection).toHaveBeenCalled();
  });

  it("should handle command timeout", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh"
    };

    vi.mocked(mockPool.getConnection).mockResolvedValue({
      execCommand: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ code: 0, stdout: "", stderr: "" }), 1000))
      )
    } as any);

    await expect(
      service.executeCommand(hostConfig, "sleep 10", [], { timeoutMs: 100 })
    ).rejects.toThrow("timeout");
  });

  it("should release connection even on error", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh"
    };

    vi.mocked(mockPool.getConnection).mockResolvedValue({
      execCommand: vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "error" })
    } as any);

    await expect(
      service.executeCommand(hostConfig, "failing command")
    ).rejects.toThrow("SSH command failed");

    expect(mockPool.releaseConnection).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/ssh-service.test.ts`

Expected: FAIL with "SSHService is not exported"

**Step 3: Create SSHService class**

Modify: `src/services/ssh.ts`

Add at the end:

```typescript
import type { ISSHService, ISSHConnectionPool } from "./interfaces.js";

/**
 * SSH service class with dependency injection support
 */
export class SSHService implements ISSHService {
  private pool: ISSHConnectionPool;

  constructor(pool: ISSHConnectionPool) {
    this.pool = pool;
  }

  async executeCommand(
    host: HostConfig,
    command: string,
    args: string[] = [],
    options: { timeoutMs?: number } = {}
  ): Promise<string> {
    const timeoutMs = options.timeoutMs || 30000;
    const connection = await this.pool.getConnection(host);

    try {
      const fullCommand = args.length > 0 ? `${command} ${args.join(" ")}` : command;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`SSH command timeout after ${timeoutMs}ms: ${command}`));
        }, timeoutMs);
      });

      const execPromise = connection.execCommand(fullCommand);
      const result = await Promise.race([execPromise, timeoutPromise]);

      if (result.code !== 0) {
        throw new Error(
          `SSH command failed (exit ${result.code}): ${command}\n` +
          `stderr: ${result.stderr}\n` +
          `stdout: ${result.stdout}`
        );
      }

      return result.stdout.trim();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`SSH command failed: ${command} - ${String(error)}`);
    } finally {
      await this.pool.releaseConnection(host, connection);
    }
  }

  async getHostResources(host: HostConfig): Promise<HostResources> {
    // Reuse existing implementation
    return getHostResources(host);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/ssh-service.test.ts`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/services/ssh.ts src/services/ssh-service.test.ts
git commit -m "feat(di): add SSHService class with pool injection

- Create SSHService class implementing ISSHService
- Inject SSH connection pool via constructor
- Add comprehensive unit tests
- Handle timeouts and errors properly
- Ensure connection release in finally block"
```

---

## Phase 4: Compose Service DI

**Goal:** Refactor Compose service to accept SSHService dependency.

### Task 4: Create Compose Service Class

**Files:**
- Modify: `src/services/compose.ts:1-410`
- Create: `src/services/compose-service.test.ts`

**Step 1: Write test for ComposeService class**

Create: `src/services/compose-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("ComposeService", () => {
  let service: ComposeService;
  let mockSSHService: ISSHService;

  beforeEach(() => {
    mockSSHService = {
      executeCommand: vi.fn().mockResolvedValue(""),
      getHostResources: vi.fn().mockResolvedValue({})
    };

    service = new ComposeService(mockSSHService);
  });

  it("should create ComposeService instance", () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ComposeService);
  });

  it("should execute compose commands via injected SSH service", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh"
    };

    vi.mocked(mockSSHService.executeCommand).mockResolvedValue("compose output");

    const result = await service.composeExec(hostConfig, "myproject", "ps", []);

    expect(result).toBe("compose output");
    expect(mockSSHService.executeCommand).toHaveBeenCalledWith(
      hostConfig,
      "docker compose -p myproject ps",
      [],
      { timeoutMs: 30000 }
    );
  });

  it("should list compose projects", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh"
    };

    const mockProjectsJson = JSON.stringify([
      { Name: "project1", Status: "running(2)", ConfigFiles: "/path/docker-compose.yml" }
    ]);

    vi.mocked(mockSSHService.executeCommand).mockResolvedValue(mockProjectsJson);

    const projects = await service.listComposeProjects(hostConfig);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("project1");
    expect(projects[0].status).toBe("running");
  });

  it("should validate project names", async () => {
    const hostConfig: HostConfig = {
      name: "test-host",
      host: "192.168.1.100",
      protocol: "ssh"
    };

    await expect(
      service.composeExec(hostConfig, "bad;project", "up", [])
    ).rejects.toThrow("Invalid project name");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose-service.test.ts`

Expected: FAIL with "ComposeService is not exported"

**Step 3: Create ComposeService class**

Modify: `src/services/compose.ts`

Add at the end:

```typescript
import type { IComposeService, ISSHService } from "./interfaces.js";

/**
 * Compose service class with dependency injection support
 */
export class ComposeService implements IComposeService {
  private sshService: ISSHService;

  constructor(sshService: ISSHService) {
    this.sshService = sshService;
  }

  async composeExec(
    host: HostConfig,
    project: string,
    action: string,
    extraArgs: string[] = []
  ): Promise<string> {
    validateHostForSsh(host);
    validateProjectName(project);
    validateComposeArgs(extraArgs);

    const command = buildComposeCommand(project, action, extraArgs);

    try {
      return await this.sshService.executeCommand(host, command, [], { timeoutMs: 30000 });
    } catch (error) {
      throw new Error(
        `Compose command failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async listComposeProjects(host: HostConfig): Promise<ComposeProject[]> {
    validateHostForSsh(host);

    const command = buildComposeCommand(null, "ls", ["--format", "json"]);

    try {
      const stdout = await this.sshService.executeCommand(host, command, [], { timeoutMs: 15000 });

      if (!stdout.trim()) {
        return [];
      }

      const projects = JSON.parse(stdout) as Array<{
        Name: string;
        Status: string;
        ConfigFiles: string;
      }>;

      return projects.map((p) => ({
        name: p.Name,
        status: parseComposeStatus(p.Status),
        configFiles: p.ConfigFiles.split(",").map((f) => f.trim()),
        services: []
      }));
    } catch (error) {
      throw new Error(
        `Failed to list compose projects: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject> {
    validateHostForSsh(host);
    validateProjectName(project);

    const command = buildComposeCommand(project, "ps", ["--format", "json"]);

    try {
      const stdout = await this.sshService.executeCommand(host, command, [], { timeoutMs: 15000 });
      const services: ComposeService[] = [];

      if (stdout.trim()) {
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const svc = JSON.parse(line) as {
              Name: string;
              State: string;
              Health?: string;
              ExitCode?: number;
              Publishers?: Array<{
                PublishedPort: number;
                TargetPort: number;
                Protocol: string;
              }>;
            };
            services.push({
              name: svc.Name,
              status: svc.State,
              health: svc.Health,
              exitCode: svc.ExitCode,
              publishers: svc.Publishers?.map((p) => ({
                publishedPort: p.PublishedPort,
                targetPort: p.TargetPort,
                protocol: p.Protocol
              }))
            });
          } catch {
            // Skip malformed lines
          }
        }
      }

      let status: ComposeProject["status"] = "unknown";
      if (services.length === 0) {
        status = "stopped";
      } else {
        const running = services.filter((s) => s.status === "running").length;
        if (running === services.length) {
          status = "running";
        } else if (running > 0) {
          status = "partial";
        } else {
          status = "stopped";
        }
      }

      return {
        name: project,
        status,
        configFiles: [],
        services
      };
    } catch (error) {
      throw new Error(
        `Failed to get compose status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async composeUp(host: HostConfig, project: string, detach = true): Promise<string> {
    const args = detach ? ["-d"] : [];
    return this.composeExec(host, project, "up", args);
  }

  async composeDown(
    host: HostConfig,
    project: string,
    removeVolumes = false
  ): Promise<string> {
    const args = removeVolumes ? ["-v"] : [];
    return this.composeExec(host, project, "down", args);
  }

  async composeRestart(host: HostConfig, project: string): Promise<string> {
    return this.composeExec(host, project, "restart", []);
  }

  async composeLogs(
    host: HostConfig,
    project: string,
    options: {
      tail?: number;
      follow?: boolean;
      timestamps?: boolean;
      since?: string;
      until?: string;
      services?: string[];
    } = {}
  ): Promise<string> {
    const args: string[] = ["--no-color"];

    if (options.tail !== undefined) {
      args.push("--tail", String(options.tail));
    }

    if (options.follow) {
      args.push("-f");
    }

    if (options.timestamps) {
      args.push("-t");
    }

    if (options.since) {
      args.push("--since", options.since);
    }

    if (options.until) {
      args.push("--until", options.until);
    }

    if (options.services && options.services.length > 0) {
      for (const service of options.services) {
        if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
          throw new Error(`Invalid service name: ${service}`);
        }
      }
      args.push(...options.services);
    }

    return this.composeExec(host, project, "logs", args);
  }

  async composeBuild(
    host: HostConfig,
    project: string,
    options: { service?: string; noCache?: boolean; pull?: boolean } = {}
  ): Promise<string> {
    const args: string[] = [];

    if (options.noCache) {
      args.push("--no-cache");
    }

    if (options.pull) {
      args.push("--pull");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "build", args);
  }

  async composePull(
    host: HostConfig,
    project: string,
    options: { service?: string; ignorePullFailures?: boolean; quiet?: boolean } = {}
  ): Promise<string> {
    const args: string[] = [];

    if (options.ignorePullFailures) {
      args.push("--ignore-pull-failures");
    }

    if (options.quiet) {
      args.push("--quiet");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "pull", args);
  }

  async composeRecreate(
    host: HostConfig,
    project: string,
    options: { service?: string; forceRecreate?: boolean; noDeps?: boolean } = {}
  ): Promise<string> {
    const args: string[] = ["-d"];

    if (options.forceRecreate !== false) {
      args.push("--force-recreate");
    }

    if (options.noDeps) {
      args.push("--no-deps");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "up", args);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/compose-service.test.ts`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/services/compose.ts src/services/compose-service.test.ts
git commit -m "feat(di): add ComposeService class with SSH service injection

- Create ComposeService class implementing IComposeService
- Inject SSH service via constructor
- Add comprehensive unit tests
- Validate all inputs (project names, service names, args)
- Reuse existing helper functions (validateProjectName, etc.)"
```

---

## Phase 5: Service Container

**Goal:** Create lightweight service container for managing dependencies.

### Task 5: Create Service Container

**Files:**
- Create: `src/services/container.ts`
- Create: `src/services/container.test.ts`

**Step 1: Write test for service container**

Create: `src/services/container.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ServiceContainer, createDefaultContainer } from "./container.js";
import type { IDockerService, ISSHService, IComposeService } from "./interfaces.js";

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  it("should create service container instance", () => {
    expect(container).toBeDefined();
    expect(container).toBeInstanceOf(ServiceContainer);
  });

  it("should provide Docker service", () => {
    const dockerService = container.getDockerService();

    expect(dockerService).toBeDefined();
    expect(dockerService.getDockerClient).toBeDefined();
    expect(dockerService.listContainers).toBeDefined();
  });

  it("should cache Docker service instance", () => {
    const service1 = container.getDockerService();
    const service2 = container.getDockerService();

    expect(service1).toBe(service2);
  });

  it("should provide SSH service", () => {
    const sshService = container.getSSHService();

    expect(sshService).toBeDefined();
    expect(sshService.executeCommand).toBeDefined();
  });

  it("should cache SSH service instance", () => {
    const service1 = container.getSSHService();
    const service2 = container.getSSHService();

    expect(service1).toBe(service2);
  });

  it("should provide Compose service", () => {
    const composeService = container.getComposeService();

    expect(composeService).toBeDefined();
    expect(composeService.composeExec).toBeDefined();
    expect(composeService.listComposeProjects).toBeDefined();
  });

  it("should cache Compose service instance", () => {
    const service1 = container.getComposeService();
    const service2 = container.getComposeService();

    expect(service1).toBe(service2);
  });

  it("should allow custom Docker service", () => {
    const customDockerService: IDockerService = {
      getDockerClient: () => ({}) as any,
      listContainers: async () => [],
      containerAction: async () => {},
      getContainerLogs: async () => [],
      getContainerStats: async () => ({}) as any,
      findContainerHost: async () => null,
      getHostStatus: async () => [],
      listImages: async () => [],
      inspectContainer: async () => ({}) as any,
      getDockerInfo: async () => ({}) as any,
      getDockerDiskUsage: async () => ({}) as any,
      pruneDocker: async () => [],
      pullImage: async () => ({ status: "ok" }),
      recreateContainer: async () => ({ status: "ok", containerId: "id" }),
      removeImage: async () => ({ status: "ok" }),
      buildImage: async () => ({ status: "ok" })
    };

    container.setDockerService(customDockerService);

    const service = container.getDockerService();
    expect(service).toBe(customDockerService);
  });

  it("should allow custom SSH service", () => {
    const customSSHService: ISSHService = {
      executeCommand: async () => "",
      getHostResources: async () => ({}) as any
    };

    container.setSSHService(customSSHService);

    const service = container.getSSHService();
    expect(service).toBe(customSSHService);
  });

  it("should allow custom Compose service", () => {
    const customComposeService: IComposeService = {
      composeExec: async () => "",
      listComposeProjects: async () => [],
      getComposeStatus: async () => ({}) as any,
      composeUp: async () => "",
      composeDown: async () => "",
      composeRestart: async () => "",
      composeLogs: async () => "",
      composeBuild: async () => "",
      composePull: async () => "",
      composeRecreate: async () => ""
    };

    container.setComposeService(customComposeService);

    const service = container.getComposeService();
    expect(service).toBe(customComposeService);
  });
});

describe("createDefaultContainer", () => {
  it("should create container with default services", () => {
    const container = createDefaultContainer();

    expect(container).toBeDefined();
    expect(container.getDockerService()).toBeDefined();
    expect(container.getSSHService()).toBeDefined();
    expect(container.getComposeService()).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/container.test.ts`

Expected: FAIL with "Cannot find module './container.js'"

**Step 3: Implement service container**

Create: `src/services/container.ts`

```typescript
import type { IDockerService, ISSHService, IComposeService, ISSHConnectionPool } from "./interfaces.js";
import { DockerService } from "./docker.js";
import { SSHService } from "./ssh.js";
import { ComposeService } from "./compose.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";

/**
 * Service container for dependency injection
 *
 * Lightweight container that manages service lifecycle and dependencies.
 * Supports lazy initialization and service replacement for testing.
 */
export class ServiceContainer {
  private dockerService?: IDockerService;
  private sshService?: ISSHService;
  private composeService?: IComposeService;
  private sshConnectionPool?: ISSHConnectionPool;

  /**
   * Get Docker service instance (creates on first access)
   */
  getDockerService(): IDockerService {
    if (!this.dockerService) {
      this.dockerService = new DockerService();
    }
    return this.dockerService;
  }

  /**
   * Set custom Docker service (for testing)
   */
  setDockerService(service: IDockerService): void {
    this.dockerService = service;
  }

  /**
   * Get SSH connection pool (creates on first access)
   */
  getSSHConnectionPool(): ISSHConnectionPool {
    if (!this.sshConnectionPool) {
      this.sshConnectionPool = new SSHConnectionPoolImpl();
    }
    return this.sshConnectionPool;
  }

  /**
   * Set custom SSH connection pool (for testing)
   */
  setSSHConnectionPool(pool: ISSHConnectionPool): void {
    this.sshConnectionPool = pool;
  }

  /**
   * Get SSH service instance (creates on first access)
   */
  getSSHService(): ISSHService {
    if (!this.sshService) {
      const pool = this.getSSHConnectionPool();
      this.sshService = new SSHService(pool);
    }
    return this.sshService;
  }

  /**
   * Set custom SSH service (for testing)
   */
  setSSHService(service: ISSHService): void {
    this.sshService = service;
  }

  /**
   * Get Compose service instance (creates on first access)
   */
  getComposeService(): IComposeService {
    if (!this.composeService) {
      const sshService = this.getSSHService();
      this.composeService = new ComposeService(sshService);
    }
    return this.composeService;
  }

  /**
   * Set custom Compose service (for testing)
   */
  setComposeService(service: IComposeService): void {
    this.composeService = service;
  }

  /**
   * Cleanup all services (close connections, clear caches)
   */
  async cleanup(): Promise<void> {
    if (this.sshConnectionPool) {
      await this.sshConnectionPool.closeAll();
    }

    if (this.dockerService && "clearClients" in this.dockerService) {
      (this.dockerService as DockerService).clearClients();
    }
  }
}

/**
 * Create a service container with default implementations
 */
export function createDefaultContainer(): ServiceContainer {
  return new ServiceContainer();
}

/**
 * Global default container instance
 * Used for backward compatibility with existing code
 */
let defaultContainer: ServiceContainer | null = null;

/**
 * Get or create the global default container
 */
export function getDefaultContainer(): ServiceContainer {
  if (!defaultContainer) {
    defaultContainer = createDefaultContainer();
  }
  return defaultContainer;
}

/**
 * Reset the global default container (for testing)
 */
export function resetDefaultContainer(): void {
  defaultContainer = null;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/container.test.ts`

Expected: PASS (all 10 tests)

**Step 5: Commit**

```bash
git add src/services/container.ts src/services/container.test.ts
git commit -m "feat(di): add lightweight service container

- Create ServiceContainer class for managing dependencies
- Support lazy initialization of services
- Allow service replacement for testing
- Provide global default container
- Add comprehensive unit tests
- Include cleanup method for graceful shutdown"
```

---

## Phase 6: Tool Handler Refactoring

**Goal:** Refactor unified tool to use service container instead of direct imports.

### Task 6: Refactor Unified Tool

**Files:**
- Modify: `src/tools/unified.ts:1-1200`
- Modify: `src/tools/index.ts:1-10`

**Step 1: Write test for container-based tool handler**

Modify: `src/tools/unified.test.ts`

Add at the beginning (after imports):

```typescript
import { ServiceContainer } from "../services/container.js";
import type { IDockerService, ISSHService, IComposeService } from "../services/interfaces.js";

describe("Unified Tool with Dependency Injection", () => {
  it("should use injected services instead of direct imports", () => {
    const container = new ServiceContainer();

    // Mock services
    const mockDockerService: IDockerService = {
      listContainers: vi.fn().mockResolvedValue([]),
      // ... other methods
    } as any;

    const mockSSHService: ISSHService = {
      executeCommand: vi.fn().mockResolvedValue(""),
      // ... other methods
    } as any;

    const mockComposeService: IComposeService = {
      listComposeProjects: vi.fn().mockResolvedValue([]),
      // ... other methods
    } as any;

    container.setDockerService(mockDockerService);
    container.setSSHService(mockSSHService);
    container.setComposeService(mockComposeService);

    expect(container.getDockerService()).toBe(mockDockerService);
    expect(container.getSSHService()).toBe(mockSSHService);
    expect(container.getComposeService()).toBe(mockComposeService);
  });
});
```

**Step 2: Run test to verify it passes (structure test)**

Run: `pnpm test src/tools/unified.test.ts -t "should use injected services"`

Expected: PASS

**Step 3: Refactor unified.ts to accept container**

Modify: `src/tools/unified.ts`

Change the tool registration function signature:

```typescript
import { ServiceContainer, getDefaultContainer } from "../services/container.js";

/**
 * Register unified homelab tool with MCP server
 *
 * @param server - MCP server instance
 * @param container - Service container (defaults to global container)
 */
export function registerUnifiedTool(
  server: McpServer,
  container?: ServiceContainer
): void {
  const services = container || getDefaultContainer();

  server.tool(
    "homelab",
    zodToJsonSchema(UnifiedHomelabSchema) as ToolSchema,
    async (params: unknown) => {
      const validated = UnifiedHomelabSchema.parse(params);

      // Get services from container
      const dockerService = services.getDockerService();
      const sshService = services.getSSHService();
      const composeService = services.getComposeService();

      // ... rest of handler logic using injected services
      // Replace all direct function calls with service methods:
      // listContainers(...) -> dockerService.listContainers(...)
      // executeSSHCommand(...) -> sshService.executeCommand(...)
      // composeExec(...) -> composeService.composeExec(...)
    }
  );
}
```

**Step 4: Update all service calls in unified.ts**

Replace direct imports and calls (this is a large refactor):

```typescript
// BEFORE
import { listContainers, containerAction, ... } from "../services/docker.js";
const containers = await listContainers(hosts, options);

// AFTER (no imports, use injected service)
const containers = await dockerService.listContainers(hosts, options);
```

Pattern to follow for each action:
- `listContainers` -> `dockerService.listContainers`
- `containerAction` -> `dockerService.containerAction`
- `getContainerLogs` -> `dockerService.getContainerLogs`
- `getContainerStats` -> `dockerService.getContainerStats`
- `findContainerHost` -> `dockerService.findContainerHost`
- `getHostStatus` -> `dockerService.getHostStatus`
- `listImages` -> `dockerService.listImages`
- `inspectContainer` -> `dockerService.inspectContainer`
- `getDockerInfo` -> `dockerService.getDockerInfo`
- `getDockerDiskUsage` -> `dockerService.getDockerDiskUsage`
- `pruneDocker` -> `dockerService.pruneDocker`
- `pullImage` -> `dockerService.pullImage`
- `recreateContainer` -> `dockerService.recreateContainer`
- `removeImage` -> `dockerService.removeImage`
- `buildImage` -> `dockerService.buildImage`
- `getHostResources` -> `sshService.getHostResources`
- `composeExec` -> `composeService.composeExec`
- `listComposeProjects` -> `composeService.listComposeProjects`
- `getComposeStatus` -> `composeService.getComposeStatus`
- `composeUp` -> `composeService.composeUp`
- `composeDown` -> `composeService.composeDown`
- `composeRestart` -> `composeService.composeRestart`
- `composeLogs` -> `composeService.composeLogs`
- `composeBuild` -> `composeService.composeBuild`
- `composePull` -> `composeService.composePull`
- `composeRecreate` -> `composeService.composeRecreate`

**Step 5: Update tool registration in index.ts**

Modify: `src/tools/index.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";
import { ServiceContainer } from "../services/container.js";

/**
 * Register all homelab tools with the MCP server
 *
 * @param server - MCP server instance
 * @param container - Optional service container for dependency injection
 */
export function registerTools(server: McpServer, container?: ServiceContainer): void {
  registerUnifiedTool(server, container);
}
```

**Step 6: Run all tests**

Run: `pnpm test`

Expected: All tests pass (419+ tests)

**Step 7: Commit**

```bash
git add src/tools/unified.ts src/tools/index.ts src/tools/unified.test.ts
git commit -m "refactor(di): migrate unified tool to use service container

- Accept ServiceContainer parameter in registerUnifiedTool
- Replace all direct service imports with injected services
- Update registerTools to accept optional container
- Maintain backward compatibility with default container
- All 419+ tests passing"
```

---

## Phase 7: Integration & Cleanup

**Goal:** Update entry point, add documentation, verify all tests pass.

### Task 7: Update Entry Point

**Files:**
- Modify: `src/index.ts:1-178`
- Create: `docs/architecture/dependency-injection.md`

**Step 1: Update server initialization**

Modify: `src/index.ts`

```typescript
import { ServiceContainer, createDefaultContainer } from "./services/container.js";

// Add at module level
let serviceContainer: ServiceContainer | null = null;

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  // Create service container
  serviceContainer = createDefaultContainer();

  // Register all homelab tools with dependency injection
  registerTools(server, serviceContainer);

  return server;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.error(`\nReceived ${signal}, shutting down gracefully...`);

  // Cleanup services
  if (serviceContainer) {
    await serviceContainer.cleanup();
  }

  // Legacy cleanup (will be removed after migration)
  clearDockerClients();

  console.error("Cleanup complete");
  process.exit(0);
}

// Update signal handlers to be async
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

**Step 2: Run build and verify**

Run: `pnpm run build`

Expected: No TypeScript errors

**Step 3: Run full test suite**

Run: `pnpm test`

Expected: All tests pass (419+ tests)

**Step 4: Create architecture documentation**

Create: `docs/architecture/dependency-injection.md`

```markdown
# Dependency Injection Architecture

## Overview

The homelab-mcp-server uses a lightweight dependency injection (DI) pattern to manage service dependencies and improve testability.

## Pattern

**Constructor Injection with Service Container**

- Services define interfaces (`IDockerService`, `ISSHService`, `IComposeService`)
- Concrete implementations accept dependencies via constructor
- `ServiceContainer` manages service lifecycle and provides instances
- Tool handlers receive services via container injection
- No heavy DI frameworks (YAGNI principle)

## Architecture

```
ServiceContainer
├── DockerService (implements IDockerService)
│   └── creates Docker clients
├── SSHConnectionPool (implements ISSHConnectionPool)
│   └── manages SSH connections
├── SSHService (implements ISSHService)
│   └── depends on: SSHConnectionPool
└── ComposeService (implements IComposeService)
    └── depends on: SSHService
```

## Benefits

1. **Testability**: Mock services easily without global state
2. **Flexibility**: Swap implementations (e.g., local vs remote Docker)
3. **Clarity**: Explicit dependency graph
4. **Type Safety**: TypeScript interfaces enforce contracts
5. **No Lock-in**: No heavy framework dependencies

## Usage

### Production Code

```typescript
import { createDefaultContainer } from "./services/container.js";

const container = createDefaultContainer();
const dockerService = container.getDockerService();

const containers = await dockerService.listContainers(hosts);
```

### Testing

```typescript
import { ServiceContainer } from "./services/container.js";
import type { IDockerService } from "./services/interfaces.js";

const container = new ServiceContainer();

const mockDockerService: IDockerService = {
  listContainers: vi.fn().mockResolvedValue([]),
  // ... other methods
};

container.setDockerService(mockDockerService);

// Test code using container.getDockerService()
```

### Tool Registration

```typescript
import { registerTools } from "./tools/index.js";
import { createDefaultContainer } from "./services/container.js";

const server = new McpServer({ name: "homelab", version: "1.0.0" });
const container = createDefaultContainer();

registerTools(server, container);
```

## Service Interfaces

### IDockerService

Docker API operations across multiple hosts.

**Methods:**
- `getDockerClient(config)` - Get/create Docker client
- `listContainers(hosts, options)` - List containers
- `containerAction(id, action, host)` - Start/stop/restart/pause/unpause
- `getContainerLogs(id, host, options)` - Fetch logs
- `getContainerStats(id, host)` - Get resource usage
- ... (see `src/services/interfaces.ts` for full list)

### ISSHService

SSH command execution and resource monitoring.

**Methods:**
- `executeCommand(host, command, args, options)` - Execute SSH command
- `getHostResources(host)` - Get CPU/memory/disk stats

### IComposeService

Docker Compose operations.

**Methods:**
- `composeExec(host, project, action, args)` - Execute compose command
- `listComposeProjects(host)` - List all projects
- `getComposeStatus(host, project)` - Get project status
- `composeUp/Down/Restart/Logs/Build/Pull/Recreate` - Compose operations

### ISSHConnectionPool

SSH connection pooling and lifecycle management.

**Methods:**
- `getConnection(host)` - Acquire connection from pool
- `releaseConnection(host, connection)` - Return connection to pool
- `closeConnection(host)` - Close specific host connections
- `closeAll()` - Close all connections
- `getStats()` - Get pool statistics

## Migration Path

### Phase 1: Interfaces (✓ Complete)
- Define service interfaces
- Add comprehensive tests

### Phase 2-4: Service Classes (✓ Complete)
- Create `DockerService`, `SSHService`, `ComposeService` classes
- Implement interfaces with constructor injection
- Maintain backward compatibility

### Phase 5: Container (✓ Complete)
- Create `ServiceContainer` for managing lifecycle
- Lazy initialization of services
- Support custom service injection for testing

### Phase 6: Tool Refactoring (✓ Complete)
- Update `unified.ts` to accept container
- Replace direct imports with injected services
- All tests passing

### Phase 7: Cleanup (Current)
- Update entry point to use container
- Add documentation
- Remove deprecated code

## Best Practices

### 1. Always Define Interfaces

```typescript
// Good
export interface IMyService {
  doSomething(arg: string): Promise<Result>;
}

export class MyService implements IMyService {
  async doSomething(arg: string): Promise<Result> {
    // ...
  }
}

// Bad (no interface)
export class MyService {
  async doSomething(arg: string): Promise<Result> {
    // ...
  }
}
```

### 2. Constructor Injection

```typescript
// Good
export class ComposeService implements IComposeService {
  constructor(private sshService: ISSHService) {}
}

// Bad (global dependency)
import { executeSSHCommand } from "./ssh.js";

export class ComposeService {
  async exec() {
    await executeSSHCommand(...); // Hard to test
  }
}
```

### 3. Use Container in Tests

```typescript
// Good
const container = new ServiceContainer();
container.setDockerService(mockDockerService);

const service = container.getComposeService();
// ComposeService receives mocked dependencies

// Bad
vi.mock("./docker.js"); // Global mocking, fragile
```

### 4. Lazy Initialization

```typescript
// Good (container pattern)
getDockerService(): IDockerService {
  if (!this.dockerService) {
    this.dockerService = new DockerService();
  }
  return this.dockerService;
}

// Bad (eager initialization)
constructor() {
  this.dockerService = new DockerService(); // Created even if never used
}
```

## Future Enhancements

- [ ] Add service lifecycle hooks (onInit, onDestroy)
- [ ] Implement service health checks
- [ ] Add metrics collection for service calls
- [ ] Consider scoped containers for request isolation
- [ ] Add configuration injection (environment-based)
```

**Step 5: Commit**

```bash
git add src/index.ts docs/architecture/dependency-injection.md
git commit -m "feat(di): integrate service container in entry point

- Initialize ServiceContainer in createServer
- Pass container to registerTools
- Add async cleanup on shutdown
- Create comprehensive architecture documentation
- All tests passing (419+)"
```

---

## Verification & Validation

### Task 8: Final Verification

**Step 1: Build the project**

Run: `pnpm run build`

Expected: Clean build with no TypeScript errors

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All tests passing (419+ tests)

**Step 3: Run integration tests specifically**

Run: `pnpm test src/tools/unified.integration.test.ts`

Expected: All 85 integration tests passing

**Step 4: Start the server**

Run: `node dist/index.js`

Expected: Server starts successfully, loads hosts, no errors

**Step 5: Test with real operation**

Use MCP client to test a simple operation like listing containers or getting host status.

Expected: Operations work correctly with new DI architecture

**Step 6: Final commit**

```bash
git add .
git commit -m "feat(di): complete dependency injection architecture

SUMMARY:
- Introduce lightweight DI pattern with service container
- Create interfaces for all services (Docker, SSH, Compose)
- Implement service classes with constructor injection
- Refactor tool handlers to use injected services
- Maintain 100% backward compatibility
- All 419+ tests passing

BENEFITS:
- Improved testability (no global state)
- Clear dependency graph
- Service composition enabled
- Type-safe service contracts
- No heavy DI framework dependencies

FILES CHANGED:
- src/services/interfaces.ts (NEW)
- src/services/docker.ts (add DockerService class)
- src/services/ssh.ts (add SSHService class)
- src/services/compose.ts (add ComposeService class)
- src/services/container.ts (NEW)
- src/tools/unified.ts (refactor to use container)
- src/tools/index.ts (accept container parameter)
- src/index.ts (initialize container, async cleanup)
- docs/architecture/dependency-injection.md (NEW)
- tests: +50 new unit tests"
```

---

## Summary

This plan introduces a lightweight dependency injection architecture to the homelab-mcp-server codebase following these principles:

**DRY (Don't Repeat Yourself)**
- Service interfaces defined once
- Container pattern reused across all services
- No duplicate service creation logic

**YAGNI (You Aren't Gonna Need It)**
- No heavy DI frameworks (TSyringe, InversifyJS, etc.)
- Simple constructor injection
- Minimal abstraction overhead

**TDD (Test-Driven Development)**
- Tests written before implementation
- Interfaces validated through tests first
- Incremental verification at each step

**KISS (Keep It Simple, Stupid)**
- TypeScript-native patterns
- Explicit dependencies via constructor
- Straightforward container implementation

**Migration Strategy:**
- Incremental (7 phases)
- Backward compatible throughout
- No breaking changes to API
- Tests pass at every step

**Expected Outcome:**
- 419+ tests still passing
- Improved testability (can inject mocks)
- Clear dependency graph
- No global singleton issues
- Foundation for future service composition

---

## Execution Options

Plan complete and saved to `docs/plans/2025-12-24-dependency-injection-architecture.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
