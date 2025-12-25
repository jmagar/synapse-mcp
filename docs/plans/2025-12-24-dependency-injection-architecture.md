# Dependency Injection Architecture Implementation Plan (No Backward Compatibility)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Created:** 14:00:00 | 12/27/2025 (EST)

**Goal:** Replace global singletons with constructor-injected services and a lightweight container, with no legacy/backward-compat APIs.

**Architecture:** Pure class-based services (`DockerService`, `SSHConnectionPool`, `SSHService`, `ComposeService`) wired by a `ServiceContainer`. Tool handlers depend on interfaces and are passed a container instance. Configuration loading is separated from Docker service concerns.

**Tech Stack:** TypeScript 5.7+, Vitest, existing service layer (Docker/SSH/Compose)

---

## Table of Contents

1. [Phase 0: Recon & Design Lock](#phase-0-recon--design-lock)
2. [Phase 1: Service Interfaces](#phase-1-service-interfaces)
3. [Phase 2: Docker Service Class (No Globals)](#phase-2-docker-service-class-no-globals)
4. [Phase 3: SSH Pool + SSH Service (No Globals)](#phase-3-ssh-pool--ssh-service-no-globals)
5. [Phase 4: Compose Service Class (No Globals)](#phase-4-compose-service-class-no-globals)
6. [Phase 5: Service Container](#phase-5-service-container)
7. [Phase 6: Tool Handler Refactor](#phase-6-tool-handler-refactor)
8. [Phase 7: Entry Point & Shutdown](#phase-7-entry-point--shutdown)
9. [Phase 8: Documentation](#phase-8-documentation)
10. [Phase 9: Final Verification](#phase-9-final-verification)

---

## Constraints

- **No backward compatibility**: Remove or replace global singletons and exported function APIs.
- **TDD required**: Write failing tests first for each new class/function.
- **No heavy DI container**: Only lightweight `ServiceContainer`.
- **No global caches**: Docker client cache and SSH pool must be instance-owned.

---

## Phase 0: Recon & Design Lock

**Goal:** Confirm file locations and APIs to be changed before coding.

### Task 0: Verify current touchpoints

**Files:**
- Read: `src/services/docker.ts`
- Read: `src/services/ssh.ts`
- Read: `src/services/ssh-pool.ts`
- Read: `src/services/ssh-pool-exec.ts`
- Read: `src/services/compose.ts`
- Read: `src/tools/unified.ts`
- Read: `src/tools/index.ts`
- Read: `src/index.ts`

**Step 1: List all direct imports of service functions**

Run: `rg -n "services/(docker|ssh|compose|ssh-pool|ssh-pool-exec)" src`

Expected: Output list of direct imports that will be replaced with DI.

**Step 2: Record existing globals to remove**

Run: `rg -n "dockerClients|globalPool|getGlobalPool|clearDockerClients" src/services`

Expected: Output references to global caches/singletons.

**Step 3: Commit (doc-only)**

No commit for recon.

---

## Phase 1: Service Interfaces

**Goal:** Define service contracts for DI usage.

### Task 1: Add interfaces + tests

**Files:**
- Create: `src/services/interfaces.ts`
- Create: `src/services/interfaces.test.ts`

**Step 1: Write failing interface tests**

Create: `src/services/interfaces.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type {
  IDockerService,
  ISSHService,
  IComposeService,
  ISSHConnectionPool,
  IServiceFactory
} from "./interfaces.js";

describe("Service Interfaces", () => {
  it("should define IDockerService interface", () => {
    const mockService: IDockerService = {
      getDockerClient: () => ({}) as never,
      listContainers: async () => [],
      containerAction: async () => {},
      getContainerLogs: async () => [],
      getContainerStats: async () => ({}) as never,
      findContainerHost: async () => null,
      getHostStatus: async () => [],
      listImages: async () => [],
      inspectContainer: async () => ({}) as never,
      getDockerInfo: async () => ({}) as never,
      getDockerDiskUsage: async () => ({}) as never,
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
      getHostResources: async () => ({}) as never
    };

    expect(mockService).toBeDefined();
  });

  it("should define IComposeService interface", () => {
    const mockService: IComposeService = {
      composeExec: async () => "",
      listComposeProjects: async () => [],
      getComposeStatus: async () => ({}) as never,
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
      getConnection: async () => ({}) as never,
      releaseConnection: async () => {},
      closeConnection: async () => {},
      closeAll: async () => {},
      getStats: () => ({}) as never
    };

    expect(mockPool).toBeDefined();
  });

  it("should define IServiceFactory interface", () => {
    const mockFactory: IServiceFactory = {
      createDockerService: () => ({}) as never,
      createSSHConnectionPool: () => ({}) as never,
      createSSHService: () => ({}) as never,
      createComposeService: () => ({}) as never
    };

    expect(mockFactory).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/interfaces.test.ts`

Expected: FAIL with "Cannot find module './interfaces.js'"

**Step 3: Create interfaces**

Create: `src/services/interfaces.ts`

```typescript
import type { HostConfig, ContainerInfo, ContainerStats, HostStatus, LogEntry, ImageInfo, ComposeProject } from "../types.js";
import type Docker from "dockerode";
import type { NodeSSH } from "node-ssh";
import type { HostResources } from "./ssh.js";
import type { DockerSystemInfo, DockerDiskUsage, PruneResult, ListImagesOptions } from "./docker.js";
import type { PoolStats } from "./ssh-pool.js";

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
  containerAction(containerId: string, action: "start" | "stop" | "restart" | "pause" | "unpause", host: HostConfig): Promise<void>;
  getContainerLogs(
    containerId: string,
    host: HostConfig,
    options?: { lines?: number; since?: string; until?: string; stream?: "all" | "stdout" | "stderr" }
  ): Promise<LogEntry[]>;
  getContainerStats(containerId: string, host: HostConfig): Promise<ContainerStats>;
  findContainerHost(containerId: string, hosts: HostConfig[]): Promise<{ host: HostConfig; container: Docker.ContainerInfo } | null>;
  getHostStatus(hosts: HostConfig[]): Promise<HostStatus[]>;
  listImages(hosts: HostConfig[], options?: ListImagesOptions): Promise<ImageInfo[]>;
  inspectContainer(containerId: string, host: HostConfig): Promise<Docker.ContainerInspectInfo>;
  getDockerInfo(host: HostConfig): Promise<DockerSystemInfo>;
  getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage>;
  pruneDocker(host: HostConfig, target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"): Promise<PruneResult[]>;
  pullImage(imageName: string, host: HostConfig): Promise<{ status: string }>;
  recreateContainer(containerId: string, host: HostConfig, options?: { pull?: boolean }): Promise<{ status: string; containerId: string }>;
  removeImage(imageId: string, host: HostConfig, options?: { force?: boolean }): Promise<{ status: string }>;
  buildImage(
    host: HostConfig,
    options: { context: string; tag: string; dockerfile?: string; noCache?: boolean }
  ): Promise<{ status: string }>;
}

export interface ISSHService {
  executeCommand(host: HostConfig, command: string, args?: string[], options?: { timeoutMs?: number }): Promise<string>;
  getHostResources(host: HostConfig): Promise<HostResources>;
}

export interface IComposeService {
  composeExec(host: HostConfig, project: string, action: string, extraArgs?: string[]): Promise<string>;
  listComposeProjects(host: HostConfig): Promise<ComposeProject[]>;
  getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject>;
  composeUp(host: HostConfig, project: string, detach?: boolean): Promise<string>;
  composeDown(host: HostConfig, project: string, removeVolumes?: boolean): Promise<string>;
  composeRestart(host: HostConfig, project: string): Promise<string>;
  composeLogs(
    host: HostConfig,
    project: string,
    options?: { tail?: number; follow?: boolean; timestamps?: boolean; since?: string; until?: string; services?: string[] }
  ): Promise<string>;
  composeBuild(host: HostConfig, project: string, options?: { service?: string; noCache?: boolean; pull?: boolean }): Promise<string>;
  composePull(host: HostConfig, project: string, options?: { service?: string; ignorePullFailures?: boolean; quiet?: boolean }): Promise<string>;
  composeRecreate(host: HostConfig, project: string, options?: { service?: string; forceRecreate?: boolean; noDeps?: boolean }): Promise<string>;
}

export interface ISSHConnectionPool {
  getConnection(host: HostConfig): Promise<NodeSSH>;
  releaseConnection(host: HostConfig, connection: NodeSSH): Promise<void>;
  closeConnection(host: HostConfig): Promise<void>;
  closeAll(): Promise<void>;
  getStats(): PoolStats;
}

export interface IServiceFactory {
  createDockerService(): IDockerService;
  createSSHConnectionPool(config?: Partial<{ maxConnections: number }>): ISSHConnectionPool;
  createSSHService(pool: ISSHConnectionPool): ISSHService;
  createComposeService(sshService: ISSHService): IComposeService;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/interfaces.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/interfaces.ts src/services/interfaces.test.ts
git commit -m "feat(di): add service interfaces"
```

---

## Phase 2: Docker Service Class (No Globals)

**Goal:** Convert docker module to an instance-based service and remove module-level cache.

### Task 2: DockerService tests

**Files:**
- Create: `src/services/docker-service.test.ts`

**Step 1: Write failing tests for DockerService**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DockerService } from "./docker.js";
import type { HostConfig } from "../types.js";
import type Docker from "dockerode";

describe("DockerService", () => {
  let service: DockerService;
  let mockFactory: (config: HostConfig) => Docker;

  beforeEach(() => {
    mockFactory = vi.fn(() => ({
      listContainers: vi.fn().mockResolvedValue([]),
      ping: vi.fn().mockResolvedValue(true),
      info: vi.fn().mockResolvedValue({}),
      version: vi.fn().mockResolvedValue({})
    } as unknown as Docker));

    service = new DockerService(mockFactory);
  });

  it("creates a service instance", () => {
    expect(service).toBeInstanceOf(DockerService);
  });

  it("uses injected factory to create Docker clients", () => {
    const host: HostConfig = { name: "test", host: "localhost", protocol: "http", dockerSocketPath: "/var/run/docker.sock" };
    const client = service.getDockerClient(host);
    expect(mockFactory).toHaveBeenCalledWith(host);
    expect(client).toBeDefined();
  });

  it("caches Docker clients per host", () => {
    const host: HostConfig = { name: "test", host: "localhost", protocol: "http", dockerSocketPath: "/var/run/docker.sock" };
    const client1 = service.getDockerClient(host);
    const client2 = service.getDockerClient(host);
    expect(mockFactory).toHaveBeenCalledTimes(1);
    expect(client1).toBe(client2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/docker-service.test.ts`

Expected: FAIL (missing DockerService export)

### Task 3: Implement DockerService and remove globals

**Files:**
- Modify: `src/services/docker.ts`
- Modify: `src/services/docker.test.ts`

**Step 1: Implement DockerService (no module globals)**

- Remove `dockerClients` and `clearDockerClients` exports.
- Convert `getDockerClient` into class method using `this.clientCache`.
- Convert other exported functions to instance methods.
- Export `DockerService` class and supporting types (`ListImagesOptions`, `DockerSystemInfo`, etc.).
- Keep pure helpers (`formatBytes`, `formatUptime`, `formatImageId`, `isSocketPath`) as named exports.

**Implementation sketch:**

```typescript
export class DockerService implements IDockerService {
  private clientCache = new Map<string, Docker>();
  constructor(private dockerFactory: (config: HostConfig) => Docker = createDefaultDockerClient) {}

  getDockerClient(config: HostConfig): Docker { /* same logic, uses this.clientCache */ }
  clearClients(): void { this.clientCache.clear(); }

  async listContainers(hosts: HostConfig[], options: ListContainersOptions = {}): Promise<ContainerInfo[]> {
    return await Promise.allSettled(hosts.map((h) => this.listContainersOnHost(h, options)))
      .then((results) => results.filter((r): r is PromiseFulfilledResult<ContainerInfo[]> => r.status === "fulfilled").flatMap((r) => r.value));
  }

  private async listContainersOnHost(host: HostConfig, options: ListContainersOptions): Promise<ContainerInfo[]> { /* move existing body */ }

  // Convert remaining exports to methods, replacing getDockerClient with this.getDockerClient
}
```

**Step 2: Update docker tests to use class**

- Remove references to `dockerClients` and `clearDockerClients`.
- Add tests that assert `DockerService.clearClients()` empties cache.
- Update `checkConnection` test to use a DockerService instance method and validate cache invalidation there.

**Step 3: Run tests**

Run: `pnpm test src/services/docker-service.test.ts`

Expected: PASS

Run: `pnpm test src/services/docker.test.ts`

Expected: PASS (with updated tests)

**Step 4: Commit**

```bash
git add src/services/docker.ts src/services/docker.test.ts src/services/docker-service.test.ts
git commit -m "refactor(di): convert docker module to DockerService"
```

---

## Phase 3: SSH Pool + SSH Service (No Globals)

**Goal:** Remove global SSH pool singleton and provide instance-based pool and service.

### Task 4: SSHConnectionPool class tests

**Files:**
- Create: `src/services/ssh-connection-pool.test.ts`

**Step 1: Write failing test for class usage**

```typescript
import { describe, it, expect } from "vitest";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";

describe("SSHConnectionPoolImpl", () => {
  it("creates a pool instance", () => {
    const pool = new SSHConnectionPoolImpl({ maxConnections: 1 });
    expect(pool).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails if export is missing**

Run: `pnpm test src/services/ssh-connection-pool.test.ts`

Expected: FAIL only if class is not exported or named differently. If it passes, proceed.

### Task 5: SSHService class + remove global pool

**Files:**
- Modify: `src/services/ssh-pool-exec.ts`
- Create: `src/services/ssh-service.test.ts`
- Modify: `src/services/ssh.ts`
- Modify: `src/services/ssh-pool-exec.test.ts`

**Step 1: Write failing tests for SSHService**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SSHService } from "./ssh-service.js";
import type { HostConfig } from "../types.js";
import type { ISSHConnectionPool } from "./interfaces.js";

describe("SSHService", () => {
  let pool: ISSHConnectionPool;
  let service: SSHService;

  beforeEach(() => {
    pool = {
      getConnection: vi.fn(async () => ({ execCommand: vi.fn().mockResolvedValue({ code: 0, stdout: "ok", stderr: "" }) } as never)),
      releaseConnection: vi.fn(async () => {}),
      closeConnection: vi.fn(async () => {}),
      closeAll: vi.fn(async () => {}),
      getStats: vi.fn(() => ({}) as never)
    };
    service = new SSHService(pool);
  });

  it("executes commands via pool", async () => {
    const host: HostConfig = { name: "test", host: "127.0.0.1", protocol: "http" };
    const result = await service.executeCommand(host, "echo", ["ok"]);
    expect(result).toBe("ok");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/ssh-service.test.ts`

Expected: FAIL (SSHService missing)

**Step 3: Implement SSHService and remove global pool**

- Replace `getGlobalPool` with a new class `SSHService` that accepts an `ISSHConnectionPool` in constructor.
- Move `executeSSHCommand` logic into `SSHService.executeCommand`.
- Keep `SSHCommandOptions` exported from `ssh-pool-exec.ts` or move to `ssh-service.ts`.
- Remove all global shutdown handlers from `ssh-pool-exec.ts` (container will own lifecycle).
- Update `ssh.ts` to accept an `ISSHService` instance OR convert `getHostResources` into a method on `SSHService` and remove the direct import of `executeSSHCommand`.

**Step 4: Update existing tests**

- `src/services/ssh-pool-exec.test.ts` should be replaced to test `SSHService` (or deleted if superseded).
- `src/services/ssh.test.ts` should remain for `sanitizeForShell` and `validateHostForSsh` only.

**Step 5: Run tests**

Run: `pnpm test src/services/ssh-service.test.ts`

Expected: PASS

Run: `pnpm test src/services/ssh.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/services/ssh-pool-exec.ts src/services/ssh.ts src/services/ssh-service.test.ts src/services/ssh-pool-exec.test.ts

git commit -m "refactor(di): replace global ssh pool with SSHService"
```

---

## Phase 4: Compose Service Class (No Globals)

**Goal:** Convert Compose functions into class using injected SSHService.

### Task 6: ComposeService tests

**Files:**
- Create: `src/services/compose-service.test.ts`

**Step 1: Write failing test for ComposeService**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeService } from "./compose.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("ComposeService", () => {
  let ssh: ISSHService;
  let service: ComposeService;

  beforeEach(() => {
    ssh = {
      executeCommand: vi.fn().mockResolvedValue(""),
      getHostResources: vi.fn().mockResolvedValue({}) as never
    };
    service = new ComposeService(ssh);
  });

  it("executes compose commands via SSH service", async () => {
    const host: HostConfig = { name: "test", host: "127.0.0.1", protocol: "http" };
    await service.composeExec(host, "proj", "ps");
    expect(ssh.executeCommand).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose-service.test.ts`

Expected: FAIL (ComposeService class missing)

### Task 7: Implement ComposeService class

**Files:**
- Modify: `src/services/compose.ts`
- Modify: `src/services/compose.test.ts`
- Modify: `src/services/compose.integration.test.ts`

**Step 1: Convert exports to class**

- Export `ComposeService` class that accepts `ISSHService` in constructor.
- Convert `composeExec`, `listComposeProjects`, `getComposeStatus`, etc. to methods.
- Replace direct `executeSSHCommand` calls with `this.sshService.executeCommand`.
- Keep pure helpers (`validateProjectName`) exported as named exports.

**Step 2: Update tests to instantiate ComposeService**

- Replace direct function calls with `new ComposeService(mockSsh).composeExec(...)` etc.

**Step 3: Run tests**

Run: `pnpm test src/services/compose-service.test.ts`

Expected: PASS

Run: `pnpm test src/services/compose.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add src/services/compose.ts src/services/compose.test.ts src/services/compose.integration.test.ts src/services/compose-service.test.ts
git commit -m "refactor(di): convert compose module to ComposeService"
```

---

## Phase 5: Service Container

**Goal:** Create a lightweight container that builds and owns service instances.

### Task 8: Add ServiceContainer with tests

**Files:**
- Create: `src/services/container.ts`
- Create: `src/services/container.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { ServiceContainer } from "./container.js";
import type { IDockerService, ISSHService, IComposeService } from "./interfaces.js";

describe("ServiceContainer", () => {
  it("creates default services lazily", () => {
    const container = new ServiceContainer();
    expect(container.getDockerService()).toBeDefined();
    expect(container.getSSHService()).toBeDefined();
    expect(container.getComposeService()).toBeDefined();
  });

  it("allows service overrides", () => {
    const container = new ServiceContainer();
    const docker = {} as IDockerService;
    const ssh = {} as ISSHService;
    const compose = {} as IComposeService;

    container.setDockerService(docker);
    container.setSSHService(ssh);
    container.setComposeService(compose);

    expect(container.getDockerService()).toBe(docker);
    expect(container.getSSHService()).toBe(ssh);
    expect(container.getComposeService()).toBe(compose);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/container.test.ts`

Expected: FAIL (ServiceContainer missing)

**Step 3: Implement container**

Create: `src/services/container.ts`

```typescript
import { DockerService } from "./docker.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import { SSHService } from "./ssh-service.js";
import { ComposeService } from "./compose.js";
import type { IDockerService, ISSHService, IComposeService, ISSHConnectionPool } from "./interfaces.js";

export class ServiceContainer {
  private dockerService?: IDockerService;
  private sshService?: ISSHService;
  private composeService?: IComposeService;
  private sshPool?: ISSHConnectionPool;

  getDockerService(): IDockerService {
    if (!this.dockerService) this.dockerService = new DockerService();
    return this.dockerService;
  }

  setDockerService(service: IDockerService): void {
    this.dockerService = service;
  }

  getSSHConnectionPool(): ISSHConnectionPool {
    if (!this.sshPool) this.sshPool = new SSHConnectionPoolImpl();
    return this.sshPool;
  }

  setSSHConnectionPool(pool: ISSHConnectionPool): void {
    this.sshPool = pool;
  }

  getSSHService(): ISSHService {
    if (!this.sshService) this.sshService = new SSHService(this.getSSHConnectionPool());
    return this.sshService;
  }

  setSSHService(service: ISSHService): void {
    this.sshService = service;
  }

  getComposeService(): IComposeService {
    if (!this.composeService) this.composeService = new ComposeService(this.getSSHService());
    return this.composeService;
  }

  setComposeService(service: IComposeService): void {
    this.composeService = service;
  }

  async cleanup(): Promise<void> {
    if (this.sshPool) await this.sshPool.closeAll();
    if (this.dockerService && "clearClients" in this.dockerService) {
      (this.dockerService as DockerService).clearClients();
    }
  }
}

export function createDefaultContainer(): ServiceContainer {
  return new ServiceContainer();
}
```

**Step 4: Run tests**

Run: `pnpm test src/services/container.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/container.ts src/services/container.test.ts
git commit -m "feat(di): add service container"
```

---

## Phase 6: Tool Handler Refactor

**Goal:** Use DI in tool handlers and remove direct function imports.

### Task 9: Update unified tool to use container

**Files:**
- Modify: `src/tools/unified.ts`
- Modify: `src/tools/unified.test.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write failing test for container injection**

Add to `src/tools/unified.test.ts`:

```typescript
import { ServiceContainer } from "../services/container.js";
import type { IDockerService, ISSHService, IComposeService } from "../services/interfaces.js";

it("uses injected services from container", () => {
  const container = new ServiceContainer();
  const docker = { listContainers: async () => [] } as IDockerService;
  const ssh = { executeCommand: async () => "" } as ISSHService;
  const compose = { listComposeProjects: async () => [] } as IComposeService;

  container.setDockerService(docker);
  container.setSSHService(ssh);
  container.setComposeService(compose);

  expect(container.getDockerService()).toBe(docker);
  expect(container.getSSHService()).toBe(ssh);
  expect(container.getComposeService()).toBe(compose);
});
```

**Step 2: Run test to verify it fails if imports are wrong**

Run: `pnpm test src/tools/unified.test.ts -t "uses injected services"`

Expected: PASS or FAIL depending on missing imports. If it passes, proceed.

**Step 3: Refactor unified tool to accept container**

- Change `registerUnifiedTool(server: McpServer)` to `registerUnifiedTool(server: McpServer, container: ServiceContainer)`.
- Remove direct imports from `services/docker`, `services/ssh`, `services/compose`.
- In handler, fetch services from container and call methods.
- Move `loadHostConfigs` to a new config module if you want to avoid Docker module coupling.

**Step 4: Update index tool registry**

`src/tools/index.ts` should accept optional container and pass it to `registerUnifiedTool`.

**Step 5: Run tests**

Run: `pnpm test src/tools/unified.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/unified.ts src/tools/unified.test.ts src/tools/index.ts
git commit -m "refactor(di): inject services into unified tool"
```

---

## Phase 7: Entry Point & Shutdown

**Goal:** Instantiate container in entry point and cleanly shutdown services.

### Task 10: Update server creation and cleanup

**Files:**
- Modify: `src/index.ts`

**Step 1: Write failing test (if entry tests exist)**

If no entry tests exist, skip test creation and proceed with implementation.

**Step 2: Update entrypoint to use container**

- Create a module-level `serviceContainer`.
- Initialize container in `createServer()` and pass to `registerTools`.
- Replace `clearDockerClients()` shutdown with `await serviceContainer.cleanup()`.

**Step 3: Run build**

Run: `pnpm run build`

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "refactor(di): wire service container into server lifecycle"
```

---

## Phase 8: Documentation

**Goal:** Document the new DI architecture (no legacy APIs).

### Task 11: Add architecture doc

**Files:**
- Create: `docs/architecture/dependency-injection.md`

**Step 1: Write doc**

Include:
- Overview
- ServiceContainer dependency graph
- Example usage in tools
- Testing example with mocked services
- Explicit note that globals are removed and classes are required

**Step 2: Commit**

```bash
git add docs/architecture/dependency-injection.md
git commit -m "docs(di): document new dependency injection architecture"
```

---

## Phase 9: Final Verification

### Task 12: Full verification

**Step 1: Run build**

Run: `pnpm run build`

Expected: PASS

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All tests pass

**Step 3: Run integration tests**

Run: `pnpm test src/tools/unified.integration.test.ts`

Expected: PASS

**Step 4: Start server**

Run: `node dist/index.js --stdio`

Expected: Server starts without errors

**Step 5: Commit (if needed)**

```bash
git add .
git commit -m "feat(di): complete non-legacy dependency injection refactor"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2025-12-24-dependency-injection-architecture.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
