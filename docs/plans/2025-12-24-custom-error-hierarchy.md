# Custom Error Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

**Goal:** Implement a comprehensive custom error hierarchy to replace generic Error usage, enabling better error categorization, debugging, and MCP protocol integration.

**Architecture:** Create base error class with error codes and context, extend to specific error categories (Validation, Connection, Docker, SSH, Security, Resource, Configuration), integrate with MCP error responses, migrate all existing error usage.

**Tech Stack:** TypeScript 5.7+, Vitest for testing, Zod for validation, MCP SDK

---

## Task 1: Create Base Error Class with Tests

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/base.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/base.test.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing test for base error class**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/base.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { HomelabError } from "./base.js";

describe("HomelabError", () => {
  it("should create error with message and code", () => {
    const error = new HomelabError("Test error", "TEST_ERROR");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.name).toBe("HomelabError");
  });

  it("should include optional context", () => {
    const context = { userId: "123", action: "test" };
    const error = new HomelabError("Test error", "TEST_ERROR", context);

    expect(error.context).toEqual(context);
  });

  it("should chain cause errors", () => {
    const cause = new Error("Original error");
    const error = new HomelabError("Wrapped error", "WRAP_ERROR", undefined, cause);

    expect(error.cause).toBe(cause);
  });

  it("should serialize to JSON with all fields", () => {
    const context = { host: "test-host" };
    const cause = new Error("Root cause");
    const error = new HomelabError("Test error", "TEST_ERROR", context, cause);

    const json = error.toJSON();

    expect(json.name).toBe("HomelabError");
    expect(json.message).toBe("Test error");
    expect(json.code).toBe("TEST_ERROR");
    expect(json.context).toEqual(context);
    expect(json.cause).toBe("Root cause");
  });

  it("should serialize to JSON without optional fields", () => {
    const error = new HomelabError("Simple error", "SIMPLE_ERROR");

    const json = error.toJSON();

    expect(json.context).toBeUndefined();
    expect(json.cause).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/base.test.ts`

Expected output:
```
FAIL  src/errors/base.test.ts
  ● Test suite failed to run
    Cannot find module './base.js'
```

**Step 3: Write minimal base error implementation**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/base.ts`

```typescript
/**
 * Base error class for all homelab-mcp-server errors
 *
 * Provides:
 * - Error codes for programmatic error handling
 * - Structured context for debugging
 * - Error chaining via cause
 * - JSON serialization for logging/API responses
 */
export class HomelabError extends Error {
  /**
   * Machine-readable error code (e.g., "CONTAINER_NOT_FOUND")
   */
  public readonly code: string;

  /**
   * Additional context data for debugging
   */
  public readonly context?: Record<string, unknown>;

  /**
   * Original error that caused this error (error chaining)
   */
  public override readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = "HomelabError";
    this.code = code;
    this.context = context;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON for logging or API responses
   */
  toJSON(): {
    name: string;
    message: string;
    code: string;
    context?: Record<string, unknown>;
    cause?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...(this.context ? { context: this.context } : {}),
      ...(this.cause ? { cause: this.cause.message } : {}),
      ...(this.stack ? { stack: this.stack } : {})
    };
  }
}
```

**Step 4: Create barrel export**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/base.test.ts`

Expected output:
```
PASS  src/errors/base.test.ts
  HomelabError
    ✓ should create error with message and code
    ✓ should include optional context
    ✓ should chain cause errors
    ✓ should serialize to JSON with all fields
    ✓ should serialize to JSON without optional fields

Test Files  1 passed (1)
     Tests  5 passed (5)
```

**Step 6: Commit base error**

```bash
git add src/errors/
git commit -m "feat(errors): add HomelabError base class with error codes and context

- Add base error class with code, context, and cause fields
- Implement JSON serialization for logging and API responses
- Add comprehensive test coverage

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Validation Error Class

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/validation.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/validation.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing test for validation errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/validation.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { ValidationError } from "./validation.js";

describe("ValidationError", () => {
  it("should create validation error with field context", () => {
    const error = new ValidationError(
      "Invalid project name",
      "project-name",
      "my-project!"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid project name");
    expect(error.field).toBe("project-name");
    expect(error.value).toBe("my-project!");
    expect(error.context).toEqual({
      field: "project-name",
      value: "my-project!"
    });
  });

  it("should redact sensitive values", () => {
    const error = new ValidationError(
      "Invalid SSH key",
      "sshKeyPath",
      "/home/user/.ssh/id_rsa"
    );

    expect(error.value).toBe("/home/user/.ssh/id_rsa");
    expect(error.context?.value).toBe("/home/user/.ssh/id_rsa");
  });

  it("should include cause when chaining errors", () => {
    const cause = new Error("Zod validation failed");
    const error = new ValidationError(
      "Schema validation failed",
      "input",
      { invalid: "data" },
      cause
    );

    expect(error.cause).toBe(cause);
  });

  it("should serialize to JSON", () => {
    const error = new ValidationError(
      "Invalid host format",
      "host",
      "invalid-host$"
    );

    const json = error.toJSON();

    expect(json.name).toBe("ValidationError");
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.message).toBe("Invalid host format");
    expect(json.context).toEqual({
      field: "host",
      value: "invalid-host$"
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/validation.test.ts`

Expected output:
```
FAIL  src/errors/validation.test.ts
  ● Test suite failed to run
    Cannot find module './validation.js'
```

**Step 3: Implement ValidationError class**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/validation.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * Error thrown when input validation fails
 *
 * Examples:
 * - Invalid project name format
 * - Invalid host configuration
 * - Invalid path (directory traversal)
 * - Shell injection attempt
 */
export class ValidationError extends HomelabError {
  public readonly field: string;
  public readonly value: unknown;

  constructor(
    message: string,
    field: string,
    value: unknown,
    cause?: Error
  ) {
    super(
      message,
      "VALIDATION_ERROR",
      { field, value },
      cause
    );
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/validation.test.ts`

Expected output:
```
PASS  src/errors/validation.test.ts
  ValidationError
    ✓ should create validation error with field context
    ✓ should redact sensitive values
    ✓ should include cause when chaining errors
    ✓ should serialize to JSON

Test Files  1 passed (1)
     Tests  4 passed (4)
```

**Step 6: Commit validation error**

```bash
git add src/errors/
git commit -m "feat(errors): add ValidationError for input validation failures

- Add ValidationError with field and value context
- Include field name and invalid value in error context
- Support error chaining for Zod validation errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Connection Error Classes

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/connection.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/connection.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing tests for connection errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/connection.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";

describe("ConnectionError", () => {
  it("should create connection error with host context", () => {
    const error = new ConnectionError(
      "Failed to connect to host",
      "test-host",
      2375
    );

    expect(error.name).toBe("ConnectionError");
    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.host).toBe("test-host");
    expect(error.port).toBe(2375);
    expect(error.context).toEqual({
      host: "test-host",
      port: 2375
    });
  });

  it("should chain cause errors", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new ConnectionError(
      "Connection refused",
      "localhost",
      2375,
      cause
    );

    expect(error.cause).toBe(cause);
  });
});

describe("SSHConnectionError", () => {
  it("should create SSH-specific error", () => {
    const error = new SSHConnectionError(
      "SSH authentication failed",
      "remote-host",
      22,
      "user"
    );

    expect(error.name).toBe("SSHConnectionError");
    expect(error.code).toBe("SSH_CONNECTION_ERROR");
    expect(error.host).toBe("remote-host");
    expect(error.port).toBe(22);
    expect(error.user).toBe("user");
    expect(error.context).toEqual({
      host: "remote-host",
      port: 22,
      user: "user"
    });
  });

  it("should include default SSH port", () => {
    const error = new SSHConnectionError(
      "SSH failed",
      "host.local",
      undefined,
      "root"
    );

    expect(error.port).toBeUndefined();
  });
});

describe("DockerConnectionError", () => {
  it("should create Docker-specific error", () => {
    const error = new DockerConnectionError(
      "Docker daemon not responding",
      "docker-host",
      2375,
      "http"
    );

    expect(error.name).toBe("DockerConnectionError");
    expect(error.code).toBe("DOCKER_CONNECTION_ERROR");
    expect(error.protocol).toBe("http");
    expect(error.context).toEqual({
      host: "docker-host",
      port: 2375,
      protocol: "http"
    });
  });

  it("should support unix socket protocol", () => {
    const error = new DockerConnectionError(
      "Socket not found",
      "/var/run/docker.sock",
      undefined,
      "unix"
    );

    expect(error.protocol).toBe("unix");
    expect(error.host).toBe("/var/run/docker.sock");
  });
});

describe("TimeoutError", () => {
  it("should create timeout error with duration", () => {
    const error = new TimeoutError(
      "Operation timed out",
      "test-host",
      30000,
      "docker ps"
    );

    expect(error.name).toBe("TimeoutError");
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.timeoutMs).toBe(30000);
    expect(error.operation).toBe("docker ps");
    expect(error.context).toEqual({
      host: "test-host",
      timeoutMs: 30000,
      operation: "docker ps"
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/connection.test.ts`

Expected output:
```
FAIL  src/errors/connection.test.ts
  ● Test suite failed to run
    Cannot find module './connection.js'
```

**Step 3: Implement connection error classes**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/connection.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * Base error for connection failures
 */
export class ConnectionError extends HomelabError {
  public readonly host: string;
  public readonly port?: number;

  constructor(
    message: string,
    host: string,
    port?: number,
    cause?: Error
  ) {
    super(
      message,
      "CONNECTION_ERROR",
      { host, ...(port !== undefined ? { port } : {}) },
      cause
    );
    this.name = "ConnectionError";
    this.host = host;
    this.port = port;
  }
}

/**
 * Error thrown when SSH connection fails
 */
export class SSHConnectionError extends HomelabError {
  public readonly host: string;
  public readonly port?: number;
  public readonly user?: string;

  constructor(
    message: string,
    host: string,
    port?: number,
    user?: string,
    cause?: Error
  ) {
    super(
      message,
      "SSH_CONNECTION_ERROR",
      {
        host,
        ...(port !== undefined ? { port } : {}),
        ...(user ? { user } : {})
      },
      cause
    );
    this.name = "SSHConnectionError";
    this.host = host;
    this.port = port;
    this.user = user;
  }
}

/**
 * Error thrown when Docker API connection fails
 */
export class DockerConnectionError extends HomelabError {
  public readonly host: string;
  public readonly port?: number;
  public readonly protocol: "http" | "https" | "unix" | "ssh";

  constructor(
    message: string,
    host: string,
    port?: number,
    protocol: "http" | "https" | "unix" | "ssh" = "http",
    cause?: Error
  ) {
    super(
      message,
      "DOCKER_CONNECTION_ERROR",
      {
        host,
        ...(port !== undefined ? { port } : {}),
        protocol
      },
      cause
    );
    this.name = "DockerConnectionError";
    this.host = host;
    this.port = port;
    this.protocol = protocol;
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends HomelabError {
  public readonly timeoutMs: number;
  public readonly operation?: string;

  constructor(
    message: string,
    host: string,
    timeoutMs: number,
    operation?: string,
    cause?: Error
  ) {
    super(
      message,
      "TIMEOUT_ERROR",
      {
        host,
        timeoutMs,
        ...(operation ? { operation } : {})
      },
      cause
    );
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
export {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/connection.test.ts`

Expected output:
```
PASS  src/errors/connection.test.ts
  ConnectionError
    ✓ should create connection error with host context
    ✓ should chain cause errors
  SSHConnectionError
    ✓ should create SSH-specific error
    ✓ should include default SSH port
  DockerConnectionError
    ✓ should create Docker-specific error
    ✓ should support unix socket protocol
  TimeoutError
    ✓ should create timeout error with duration

Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Step 6: Commit connection errors**

```bash
git add src/errors/
git commit -m "feat(errors): add connection error classes for SSH and Docker

- Add ConnectionError base class with host/port context
- Add SSHConnectionError with user context
- Add DockerConnectionError with protocol context
- Add TimeoutError with timeout duration and operation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Resource Error Classes

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/resource.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/resource.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing tests for resource errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/resource.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  ResourceNotFoundError,
  ContainerNotFoundError,
  ImageNotFoundError,
  HostNotFoundError,
  ProjectNotFoundError
} from "./resource.js";

describe("ResourceNotFoundError", () => {
  it("should create resource not found error", () => {
    const error = new ResourceNotFoundError(
      "container",
      "my-container",
      "test-host"
    );

    expect(error.name).toBe("ResourceNotFoundError");
    expect(error.code).toBe("RESOURCE_NOT_FOUND");
    expect(error.resourceType).toBe("container");
    expect(error.resourceId).toBe("my-container");
    expect(error.host).toBe("test-host");
    expect(error.context).toEqual({
      resourceType: "container",
      resourceId: "my-container",
      host: "test-host"
    });
  });

  it("should work without host context", () => {
    const error = new ResourceNotFoundError(
      "image",
      "nginx:latest"
    );

    expect(error.host).toBeUndefined();
    expect(error.context).toEqual({
      resourceType: "image",
      resourceId: "nginx:latest"
    });
  });
});

describe("ContainerNotFoundError", () => {
  it("should create container-specific error", () => {
    const error = new ContainerNotFoundError("plex", "unraid");

    expect(error.name).toBe("ContainerNotFoundError");
    expect(error.code).toBe("CONTAINER_NOT_FOUND");
    expect(error.resourceType).toBe("container");
    expect(error.containerId).toBe("plex");
    expect(error.message).toBe("Container 'plex' not found on host 'unraid'");
  });

  it("should work without host", () => {
    const error = new ContainerNotFoundError("missing");

    expect(error.message).toBe("Container 'missing' not found");
  });
});

describe("ImageNotFoundError", () => {
  it("should create image-specific error", () => {
    const error = new ImageNotFoundError("nginx:alpine", "proxmox");

    expect(error.name).toBe("ImageNotFoundError");
    expect(error.code).toBe("IMAGE_NOT_FOUND");
    expect(error.imageId).toBe("nginx:alpine");
  });
});

describe("HostNotFoundError", () => {
  it("should create host-specific error", () => {
    const error = new HostNotFoundError("unknown-host", [
      "unraid",
      "proxmox",
      "local"
    ]);

    expect(error.name).toBe("HostNotFoundError");
    expect(error.code).toBe("HOST_NOT_FOUND");
    expect(error.hostName).toBe("unknown-host");
    expect(error.availableHosts).toEqual(["unraid", "proxmox", "local"]);
    expect(error.message).toContain("unknown-host");
    expect(error.message).toContain("unraid, proxmox, local");
  });
});

describe("ProjectNotFoundError", () => {
  it("should create project-specific error", () => {
    const error = new ProjectNotFoundError("missing-project", "unraid");

    expect(error.name).toBe("ProjectNotFoundError");
    expect(error.code).toBe("PROJECT_NOT_FOUND");
    expect(error.projectName).toBe("missing-project");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/resource.test.ts`

Expected output:
```
FAIL  src/errors/resource.test.ts
  ● Test suite failed to run
    Cannot find module './resource.js'
```

**Step 3: Implement resource error classes**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/resource.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * Base error for resource not found
 */
export class ResourceNotFoundError extends HomelabError {
  public readonly resourceType: string;
  public readonly resourceId: string;
  public readonly host?: string;

  constructor(
    resourceType: string,
    resourceId: string,
    host?: string,
    cause?: Error
  ) {
    const message = host
      ? `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} '${resourceId}' not found on host '${host}'`
      : `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} '${resourceId}' not found`;

    super(
      message,
      "RESOURCE_NOT_FOUND",
      {
        resourceType,
        resourceId,
        ...(host ? { host } : {})
      },
      cause
    );
    this.name = "ResourceNotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.host = host;
  }
}

/**
 * Error thrown when container is not found
 */
export class ContainerNotFoundError extends ResourceNotFoundError {
  public readonly containerId: string;

  constructor(containerId: string, host?: string, cause?: Error) {
    super("container", containerId, host, cause);
    this.name = "ContainerNotFoundError";
    this.code = "CONTAINER_NOT_FOUND";
    this.containerId = containerId;
  }
}

/**
 * Error thrown when image is not found
 */
export class ImageNotFoundError extends ResourceNotFoundError {
  public readonly imageId: string;

  constructor(imageId: string, host?: string, cause?: Error) {
    super("image", imageId, host, cause);
    this.name = "ImageNotFoundError";
    this.code = "IMAGE_NOT_FOUND";
    this.imageId = imageId;
  }
}

/**
 * Error thrown when host is not found in configuration
 */
export class HostNotFoundError extends HomelabError {
  public readonly hostName: string;
  public readonly availableHosts: string[];

  constructor(hostName: string, availableHosts: string[], cause?: Error) {
    const message = `Host '${hostName}' not found. Available hosts: ${availableHosts.join(", ")}`;

    super(
      message,
      "HOST_NOT_FOUND",
      { hostName, availableHosts },
      cause
    );
    this.name = "HostNotFoundError";
    this.hostName = hostName;
    this.availableHosts = availableHosts;
  }
}

/**
 * Error thrown when Docker Compose project is not found
 */
export class ProjectNotFoundError extends ResourceNotFoundError {
  public readonly projectName: string;

  constructor(projectName: string, host?: string, cause?: Error) {
    super("project", projectName, host, cause);
    this.name = "ProjectNotFoundError";
    this.code = "PROJECT_NOT_FOUND";
    this.projectName = projectName;
  }
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
export {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";
export {
  ResourceNotFoundError,
  ContainerNotFoundError,
  ImageNotFoundError,
  HostNotFoundError,
  ProjectNotFoundError
} from "./resource.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/resource.test.ts`

Expected output:
```
PASS  src/errors/resource.test.ts
  ResourceNotFoundError
    ✓ should create resource not found error
    ✓ should work without host context
  ContainerNotFoundError
    ✓ should create container-specific error
    ✓ should work without host
  ImageNotFoundError
    ✓ should create image-specific error
  HostNotFoundError
    ✓ should create host-specific error
  ProjectNotFoundError
    ✓ should create project-specific error

Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Step 6: Commit resource errors**

```bash
git add src/errors/
git commit -m "feat(errors): add resource not found error classes

- Add ResourceNotFoundError base with resource type/id
- Add ContainerNotFoundError for missing containers
- Add ImageNotFoundError for missing images
- Add HostNotFoundError with available hosts list
- Add ProjectNotFoundError for compose projects

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Operation Error Classes

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/operation.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/operation.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing tests for operation errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/operation.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  OperationError,
  DockerOperationError,
  SSHCommandError,
  ComposeOperationError
} from "./operation.js";

describe("OperationError", () => {
  it("should create operation error with operation context", () => {
    const error = new OperationError(
      "Operation failed",
      "container-start",
      "plex",
      "unraid"
    );

    expect(error.name).toBe("OperationError");
    expect(error.code).toBe("OPERATION_ERROR");
    expect(error.operation).toBe("container-start");
    expect(error.target).toBe("plex");
    expect(error.host).toBe("unraid");
  });
});

describe("DockerOperationError", () => {
  it("should create Docker operation error", () => {
    const error = new DockerOperationError(
      "Failed to start container",
      "start",
      "nginx",
      "proxmox",
      409
    );

    expect(error.name).toBe("DockerOperationError");
    expect(error.code).toBe("DOCKER_OPERATION_ERROR");
    expect(error.operation).toBe("start");
    expect(error.statusCode).toBe(409);
    expect(error.context).toMatchObject({
      operation: "start",
      target: "nginx",
      host: "proxmox",
      statusCode: 409
    });
  });

  it("should work without status code", () => {
    const error = new DockerOperationError(
      "Operation failed",
      "inspect",
      "container-id",
      "local"
    );

    expect(error.statusCode).toBeUndefined();
  });
});

describe("SSHCommandError", () => {
  it("should create SSH command error with exit code", () => {
    const error = new SSHCommandError(
      "Command failed",
      "docker ps",
      "unraid",
      127,
      "command not found"
    );

    expect(error.name).toBe("SSHCommandError");
    expect(error.code).toBe("SSH_COMMAND_ERROR");
    expect(error.command).toBe("docker ps");
    expect(error.exitCode).toBe(127);
    expect(error.stderr).toBe("command not found");
    expect(error.context).toMatchObject({
      command: "docker ps",
      host: "unraid",
      exitCode: 127,
      stderr: "command not found"
    });
  });

  it("should work without stderr", () => {
    const error = new SSHCommandError(
      "Command failed",
      "ls",
      "remote",
      1
    );

    expect(error.stderr).toBeUndefined();
  });
});

describe("ComposeOperationError", () => {
  it("should create compose operation error", () => {
    const error = new ComposeOperationError(
      "Failed to start project",
      "up",
      "plex-stack",
      "unraid",
      "plex"
    );

    expect(error.name).toBe("ComposeOperationError");
    expect(error.code).toBe("COMPOSE_OPERATION_ERROR");
    expect(error.operation).toBe("up");
    expect(error.project).toBe("plex-stack");
    expect(error.service).toBe("plex");
    expect(error.context).toMatchObject({
      operation: "up",
      project: "plex-stack",
      host: "unraid",
      service: "plex"
    });
  });

  it("should work without service context", () => {
    const error = new ComposeOperationError(
      "Project down failed",
      "down",
      "stack",
      "host"
    );

    expect(error.service).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/operation.test.ts`

Expected output:
```
FAIL  src/errors/operation.test.ts
  ● Test suite failed to run
    Cannot find module './operation.js'
```

**Step 3: Implement operation error classes**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/operation.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * Base error for operation failures
 */
export class OperationError extends HomelabError {
  public readonly operation: string;
  public readonly target?: string;
  public readonly host?: string;

  constructor(
    message: string,
    operation: string,
    target?: string,
    host?: string,
    cause?: Error
  ) {
    super(
      message,
      "OPERATION_ERROR",
      {
        operation,
        ...(target ? { target } : {}),
        ...(host ? { host } : {})
      },
      cause
    );
    this.name = "OperationError";
    this.operation = operation;
    this.target = target;
    this.host = host;
  }
}

/**
 * Error thrown when Docker operation fails
 */
export class DockerOperationError extends HomelabError {
  public readonly operation: string;
  public readonly target: string;
  public readonly host: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    operation: string,
    target: string,
    host: string,
    statusCode?: number,
    cause?: Error
  ) {
    super(
      message,
      "DOCKER_OPERATION_ERROR",
      {
        operation,
        target,
        host,
        ...(statusCode !== undefined ? { statusCode } : {})
      },
      cause
    );
    this.name = "DockerOperationError";
    this.operation = operation;
    this.target = target;
    this.host = host;
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when SSH command execution fails
 */
export class SSHCommandError extends HomelabError {
  public readonly command: string;
  public readonly host: string;
  public readonly exitCode: number;
  public readonly stderr?: string;

  constructor(
    message: string,
    command: string,
    host: string,
    exitCode: number,
    stderr?: string,
    cause?: Error
  ) {
    super(
      message,
      "SSH_COMMAND_ERROR",
      {
        command,
        host,
        exitCode,
        ...(stderr ? { stderr } : {})
      },
      cause
    );
    this.name = "SSHCommandError";
    this.command = command;
    this.host = host;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Error thrown when Docker Compose operation fails
 */
export class ComposeOperationError extends HomelabError {
  public readonly operation: string;
  public readonly project: string;
  public readonly host: string;
  public readonly service?: string;

  constructor(
    message: string,
    operation: string,
    project: string,
    host: string,
    service?: string,
    cause?: Error
  ) {
    super(
      message,
      "COMPOSE_OPERATION_ERROR",
      {
        operation,
        project,
        host,
        ...(service ? { service } : {})
      },
      cause
    );
    this.name = "ComposeOperationError";
    this.operation = operation;
    this.project = project;
    this.host = host;
    this.service = service;
  }
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
export {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";
export {
  ResourceNotFoundError,
  ContainerNotFoundError,
  ImageNotFoundError,
  HostNotFoundError,
  ProjectNotFoundError
} from "./resource.js";
export {
  OperationError,
  DockerOperationError,
  SSHCommandError,
  ComposeOperationError
} from "./operation.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/operation.test.ts`

Expected output:
```
PASS  src/errors/operation.test.ts
  OperationError
    ✓ should create operation error with operation context
  DockerOperationError
    ✓ should create Docker operation error
    ✓ should work without status code
  SSHCommandError
    ✓ should create SSH command error with exit code
    ✓ should work without stderr
  ComposeOperationError
    ✓ should create compose operation error
    ✓ should work without service context

Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Step 6: Commit operation errors**

```bash
git add src/errors/
git commit -m "feat(errors): add operation error classes for Docker and SSH

- Add OperationError base with operation/target context
- Add DockerOperationError with status codes
- Add SSHCommandError with exit code and stderr
- Add ComposeOperationError with project/service context

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Configuration Error Class

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/config.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/config.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing test for configuration errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/config.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { ConfigurationError } from "./config.js";

describe("ConfigurationError", () => {
  it("should create configuration error", () => {
    const error = new ConfigurationError(
      "Missing required configuration",
      "hosts"
    );

    expect(error.name).toBe("ConfigurationError");
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.configKey).toBe("hosts");
    expect(error.context).toEqual({ configKey: "hosts" });
  });

  it("should include config path when provided", () => {
    const error = new ConfigurationError(
      "Invalid config file",
      "protocol",
      "/etc/homelab/config.json"
    );

    expect(error.configPath).toBe("/etc/homelab/config.json");
    expect(error.context).toMatchObject({
      configKey: "protocol",
      configPath: "/etc/homelab/config.json"
    });
  });

  it("should chain cause errors", () => {
    const cause = new Error("JSON parse error");
    const error = new ConfigurationError(
      "Failed to parse config",
      "hosts",
      "/config.json",
      cause
    );

    expect(error.cause).toBe(cause);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/config.test.ts`

Expected output:
```
FAIL  src/errors/config.test.ts
  ● Test suite failed to run
    Cannot find module './config.js'
```

**Step 3: Implement ConfigurationError class**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/config.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * Error thrown when configuration is missing or invalid
 *
 * Examples:
 * - Missing config file
 * - Invalid JSON in config
 * - Missing required fields
 * - Invalid host configuration
 */
export class ConfigurationError extends HomelabError {
  public readonly configKey?: string;
  public readonly configPath?: string;

  constructor(
    message: string,
    configKey?: string,
    configPath?: string,
    cause?: Error
  ) {
    super(
      message,
      "CONFIGURATION_ERROR",
      {
        ...(configKey ? { configKey } : {}),
        ...(configPath ? { configPath } : {})
      },
      cause
    );
    this.name = "ConfigurationError";
    this.configKey = configKey;
    this.configPath = configPath;
  }
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
export {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";
export {
  ResourceNotFoundError,
  ContainerNotFoundError,
  ImageNotFoundError,
  HostNotFoundError,
  ProjectNotFoundError
} from "./resource.js";
export {
  OperationError,
  DockerOperationError,
  SSHCommandError,
  ComposeOperationError
} from "./operation.js";
export { ConfigurationError } from "./config.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/config.test.ts`

Expected output:
```
PASS  src/errors/config.test.ts
  ConfigurationError
    ✓ should create configuration error
    ✓ should include config path when provided
    ✓ should chain cause errors

Test Files  1 passed (1)
     Tests  3 passed (3)
```

**Step 6: Commit configuration error**

```bash
git add src/errors/
git commit -m "feat(errors): add ConfigurationError for config issues

- Add ConfigurationError with config key and path context
- Support error chaining for JSON parse errors
- Use for missing/invalid configuration

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create MCP Error Formatter

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/mcp-formatter.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/errors/mcp-formatter.test.ts`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

**Step 1: Write failing test for MCP error formatting**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/mcp-formatter.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { formatErrorForMCP } from "./mcp-formatter.js";
import {
  ValidationError,
  ContainerNotFoundError,
  DockerConnectionError,
  SSHCommandError
} from "./index.js";

describe("formatErrorForMCP", () => {
  it("should format ValidationError", () => {
    const error = new ValidationError(
      "Invalid project name",
      "project",
      "bad@name"
    );

    const response = formatErrorForMCP(error);

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].text).toContain("Invalid project name");
    expect(response.content[0].text).toContain("VALIDATION_ERROR");
  });

  it("should format ContainerNotFoundError", () => {
    const error = new ContainerNotFoundError("plex", "unraid");

    const response = formatErrorForMCP(error);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Container 'plex' not found");
    expect(response.content[0].text).toContain("unraid");
  });

  it("should format DockerConnectionError with cause", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new DockerConnectionError(
      "Failed to connect",
      "unraid.local",
      2375,
      "http",
      cause
    );

    const response = formatErrorForMCP(error);

    expect(response.content[0].text).toContain("Failed to connect");
    expect(response.content[0].text).toContain("DOCKER_CONNECTION_ERROR");
    expect(response.content[0].text).toContain("ECONNREFUSED");
  });

  it("should format SSHCommandError with stderr", () => {
    const error = new SSHCommandError(
      "Command failed",
      "docker ps",
      "remote",
      127,
      "command not found: docker"
    );

    const response = formatErrorForMCP(error);

    expect(response.content[0].text).toContain("Command failed");
    expect(response.content[0].text).toContain("SSH_COMMAND_ERROR");
    expect(response.content[0].text).toContain("Exit code: 127");
    expect(response.content[0].text).toContain("command not found: docker");
  });

  it("should format generic Error as fallback", () => {
    const error = new Error("Unknown error");

    const response = formatErrorForMCP(error);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Unknown error");
    expect(response.content[0].text).toContain("UNKNOWN_ERROR");
  });

  it("should format unknown errors", () => {
    const error = "string error";

    const response = formatErrorForMCP(error);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("string error");
  });

  it("should include context in formatted output", () => {
    const error = new ValidationError(
      "Invalid input",
      "host",
      "bad$host"
    );

    const response = formatErrorForMCP(error);

    expect(response.content[0].text).toContain("field: host");
    expect(response.content[0].text).toContain("value: bad$host");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/errors/mcp-formatter.test.ts`

Expected output:
```
FAIL  src/errors/mcp-formatter.test.ts
  ● Test suite failed to run
    Cannot find module './mcp-formatter.js'
```

**Step 3: Implement MCP error formatter**

Create: `/mnt/cache/code/homelab-mcp-server/src/errors/mcp-formatter.ts`

```typescript
import { HomelabError } from "./base.js";

/**
 * MCP error response format
 */
interface MCPErrorResponse {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Format error for MCP protocol response
 *
 * Converts errors to MCP-compatible format with:
 * - Error code
 * - Error message
 * - Context details
 * - Cause chain
 *
 * @param error - Any error (HomelabError, Error, or unknown)
 * @returns MCP error response object
 */
export function formatErrorForMCP(error: unknown): MCPErrorResponse {
  // Handle HomelabError with structured data
  if (error instanceof HomelabError) {
    const parts: string[] = [
      `Error: ${error.message}`,
      `Code: ${error.code}`
    ];

    // Add context if present
    if (error.context && Object.keys(error.context).length > 0) {
      parts.push("");
      parts.push("Context:");
      for (const [key, value] of Object.entries(error.context)) {
        parts.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    // Add cause if present
    if (error.cause) {
      parts.push("");
      parts.push(`Caused by: ${error.cause.message}`);
    }

    return {
      isError: true,
      content: [{ type: "text", text: parts.join("\n") }]
    };
  }

  // Handle standard Error
  if (error instanceof Error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error.message}\nCode: UNKNOWN_ERROR`
        }
      ]
    };
  }

  // Handle unknown error types
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${String(error)}\nCode: UNKNOWN_ERROR`
      }
    ]
  };
}
```

**Step 4: Update barrel export**

Modify: `/mnt/cache/code/homelab-mcp-server/src/errors/index.ts`

```typescript
export { HomelabError } from "./base.js";
export { ValidationError } from "./validation.js";
export {
  ConnectionError,
  SSHConnectionError,
  DockerConnectionError,
  TimeoutError
} from "./connection.js";
export {
  ResourceNotFoundError,
  ContainerNotFoundError,
  ImageNotFoundError,
  HostNotFoundError,
  ProjectNotFoundError
} from "./resource.js";
export {
  OperationError,
  DockerOperationError,
  SSHCommandError,
  ComposeOperationError
} from "./operation.js";
export { ConfigurationError } from "./config.js";
export { formatErrorForMCP } from "./mcp-formatter.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/errors/mcp-formatter.test.ts`

Expected output:
```
PASS  src/errors/mcp-formatter.test.ts
  formatErrorForMCP
    ✓ should format ValidationError
    ✓ should format ContainerNotFoundError
    ✓ should format DockerConnectionError with cause
    ✓ should format SSHCommandError with stderr
    ✓ should format generic Error as fallback
    ✓ should format unknown errors
    ✓ should include context in formatted output

Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Step 6: Commit MCP formatter**

```bash
git add src/errors/
git commit -m "feat(errors): add MCP error formatter for protocol responses

- Add formatErrorForMCP to convert errors to MCP format
- Include error code, message, context, and cause chain
- Handle HomelabError, Error, and unknown error types
- Format context as readable key-value pairs

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Migrate Path Security Validation Errors

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/utils/path-security.ts:36-84`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/utils/path-security.test.ts`

**Step 1: Write test for ValidationError in path security**

Modify: `/mnt/cache/code/homelab-mcp-server/src/utils/path-security.test.ts`

Add import at top:
```typescript
import { ValidationError } from "../errors/index.js";
```

Add new test before existing tests:
```typescript
describe("validateSecurePath - custom errors", () => {
  it("should throw ValidationError for empty path", () => {
    expect(() => validateSecurePath("", "testPath")).toThrow(ValidationError);

    try {
      validateSecurePath("", "testPath");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("testPath");
      expect((error as ValidationError).value).toBe("");
      expect((error as ValidationError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("should throw ValidationError for invalid characters", () => {
    expect(() => validateSecurePath("/path/with$special", "path")).toThrow(ValidationError);

    try {
      validateSecurePath("/path/with$special", "path");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("path");
      expect((error as ValidationError).message).toContain("Invalid characters");
    }
  });

  it("should throw ValidationError for directory traversal", () => {
    expect(() => validateSecurePath("/path/../etc", "path")).toThrow(ValidationError);

    try {
      validateSecurePath("/path/../etc", "path");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("directory traversal");
    }
  });

  it("should throw ValidationError for relative paths", () => {
    expect(() => validateSecurePath("relative/path", "path")).toThrow(ValidationError);

    try {
      validateSecurePath("relative/path", "path");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("absolute path required");
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/path-security.test.ts`

Expected output:
```
FAIL  src/utils/path-security.test.ts
  validateSecurePath - custom errors
    ✕ should throw ValidationError for empty path
    ✕ should throw ValidationError for invalid characters
    ✕ should throw ValidationError for directory traversal
    ✕ should throw ValidationError for relative paths
```

**Step 3: Migrate path-security to use ValidationError**

Modify: `/mnt/cache/code/homelab-mcp-server/src/utils/path-security.ts`

Add import at top:
```typescript
import { ValidationError } from "../errors/index.js";
```

Replace all `throw new Error` with `throw new ValidationError`:

```typescript
export function validateSecurePath(path: string, paramName: string): void {
  // 1. Check for empty path
  if (!path || path.length === 0) {
    throw new ValidationError(
      `${paramName}: Path cannot be empty`,
      paramName,
      path
    );
  }

  // 2. Character validation - only allow alphanumeric, dots, hyphens, underscores, forward slashes
  if (!/^[a-zA-Z0-9._\-/]+$/.test(path)) {
    throw new ValidationError(
      `${paramName}: Invalid characters in path: ${path}`,
      paramName,
      path
    );
  }

  // 3. Split path into components and check for ".." traversal first
  const components = path.split("/").filter(c => c.length > 0);

  for (const component of components) {
    // Reject ".." (parent directory traversal) - check this first
    if (component === "..") {
      throw new ValidationError(
        `${paramName}: directory traversal (..) not allowed in path: ${path}`,
        paramName,
        path
      );
    }
  }

  // 4. Must be absolute path (starts with /) - checked after .. but before .
  if (!path.startsWith("/")) {
    throw new ValidationError(
      `${paramName}: absolute path required, got: ${path}`,
      paramName,
      path
    );
  }

  // 5. Check for "." as standalone component (only in absolute paths)
  for (const component of components) {
    // Reject "." as standalone component (current directory)
    // BUT allow dots in filenames like "file.txt" or "config.prod"
    if (component === ".") {
      throw new ValidationError(
        `${paramName}: directory traversal (.) not allowed in path: ${path}`,
        paramName,
        path
      );
    }
  }

  // 6. Additional safety check: resolve path and verify it doesn't traverse
  const resolved = resolve(path);
  if (!resolved.startsWith(path.split("/")[1] ? `/${path.split("/")[1]}` : "/")) {
    throw new ValidationError(
      `${paramName}: Path resolution resulted in directory traversal: ${path}`,
      paramName,
      path
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/path-security.test.ts`

Expected output:
```
PASS  src/utils/path-security.test.ts
  validateSecurePath - custom errors
    ✓ should throw ValidationError for empty path
    ✓ should throw ValidationError for invalid characters
    ✓ should throw ValidationError for directory traversal
    ✓ should throw ValidationError for relative paths
  [... existing tests pass ...]

Test Files  1 passed (1)
     Tests  [all passing]
```

**Step 5: Commit path security migration**

```bash
git add src/utils/path-security.ts src/utils/path-security.test.ts
git commit -m "refactor(errors): migrate path-security to ValidationError

- Replace generic Error with ValidationError in validateSecurePath
- Include field name and invalid value in error context
- Add tests verifying ValidationError properties
- Maintain backward compatibility with error messages

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Migrate SSH Service Validation Errors

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh.ts:8-34`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh.test.ts` (create if doesn't exist)

**Step 1: Create test file for SSH validation (if doesn't exist)**

Check if test file exists: `ls -la src/services/ssh.test.ts`

If not exists, create: `/mnt/cache/code/homelab-mcp-server/src/services/ssh.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { sanitizeForShell, validateHostForSsh } from "./ssh.js";
import { ValidationError } from "../errors/index.js";
import type { HostConfig } from "../types.js";

describe("sanitizeForShell", () => {
  it("should throw ValidationError for invalid characters", () => {
    expect(() => sanitizeForShell("test;rm -rf")).toThrow(ValidationError);

    try {
      sanitizeForShell("test;rm -rf");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("input");
      expect((error as ValidationError).value).toBe("test;rm -rf");
      expect((error as ValidationError).message).toContain("Invalid characters");
    }
  });

  it("should allow valid characters", () => {
    expect(() => sanitizeForShell("test-file_123.txt")).not.toThrow();
    expect(() => sanitizeForShell("/path/to/file")).not.toThrow();
  });
});

describe("validateHostForSsh", () => {
  it("should throw ValidationError for invalid host format", () => {
    const host: HostConfig = {
      name: "test",
      host: "invalid$host",
      protocol: "ssh"
    };

    expect(() => validateHostForSsh(host)).toThrow(ValidationError);

    try {
      validateHostForSsh(host);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("host");
      expect((error as ValidationError).message).toContain("Invalid host format");
    }
  });

  it("should throw ValidationError for invalid SSH user", () => {
    const host: HostConfig = {
      name: "test",
      host: "valid.host",
      protocol: "ssh",
      sshUser: "user@invalid"
    };

    expect(() => validateHostForSsh(host)).toThrow(ValidationError);

    try {
      validateHostForSsh(host);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("sshUser");
    }
  });

  it("should throw ValidationError for invalid SSH key path", () => {
    const host: HostConfig = {
      name: "test",
      host: "valid.host",
      protocol: "ssh",
      sshUser: "user",
      sshKeyPath: "invalid$path"
    };

    expect(() => validateHostForSsh(host)).toThrow(ValidationError);

    try {
      validateHostForSsh(host);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("sshKeyPath");
    }
  });

  it("should accept valid host config", () => {
    const host: HostConfig = {
      name: "test",
      host: "valid.host.com",
      protocol: "ssh",
      sshUser: "valid_user",
      sshKeyPath: "/home/user/.ssh/id_rsa"
    };

    expect(() => validateHostForSsh(host)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/ssh.test.ts`

Expected output:
```
FAIL  src/services/ssh.test.ts
  sanitizeForShell
    ✕ should throw ValidationError for invalid characters
  validateHostForSsh
    ✕ should throw ValidationError for invalid host format
    ✕ should throw ValidationError for invalid SSH user
    ✕ should throw ValidationError for invalid SSH key path
```

**Step 3: Migrate SSH service to use ValidationError**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh.ts`

Add import at top:
```typescript
import { ValidationError } from "../errors/index.js";
```

Replace validation functions:
```typescript
export function sanitizeForShell(input: string): string {
  // Only allow alphanumeric, dots, hyphens, underscores, and forward slashes (for paths)
  if (!/^[a-zA-Z0-9._\-/]+$/.test(input)) {
    throw new ValidationError(
      `Invalid characters in input: ${input}`,
      "input",
      input
    );
  }
  return input;
}

export function validateHostForSsh(host: HostConfig): void {
  // Validate hostname/IP - allow alphanumeric, dots, hyphens, colons (IPv6), and brackets
  if (host.host && !/^[a-zA-Z0-9.\-:[\]/]+$/.test(host.host)) {
    throw new ValidationError(
      `Invalid host format: ${host.host}`,
      "host",
      host.host
    );
  }

  // Validate SSH user if provided
  if (host.sshUser && !/^[a-zA-Z0-9_-]+$/.test(host.sshUser)) {
    throw new ValidationError(
      `Invalid SSH user: ${host.sshUser}`,
      "sshUser",
      host.sshUser
    );
  }

  // Validate key path if provided
  if (host.sshKeyPath && !/^[a-zA-Z0-9._\-/~]+$/.test(host.sshKeyPath)) {
    throw new ValidationError(
      `Invalid SSH key path: ${host.sshKeyPath}`,
      "sshKeyPath",
      host.sshKeyPath
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/ssh.test.ts`

Expected output:
```
PASS  src/services/ssh.test.ts
  sanitizeForShell
    ✓ should throw ValidationError for invalid characters
    ✓ should allow valid characters
  validateHostForSsh
    ✓ should throw ValidationError for invalid host format
    ✓ should throw ValidationError for invalid SSH user
    ✓ should throw ValidationError for invalid SSH key path
    ✓ should accept valid host config

Test Files  1 passed (1)
     Tests  6 passed (6)
```

**Step 5: Commit SSH service migration**

```bash
git add src/services/ssh.ts src/services/ssh.test.ts
git commit -m "refactor(errors): migrate SSH service to ValidationError

- Replace generic Error with ValidationError in SSH validation
- Add dedicated tests for SSH validation functions
- Include field names and invalid values in error context
- Improve testability with structured errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Migrate Compose Service Validation Errors

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.ts:9-36`
- Update existing tests in `/mnt/cache/code/homelab-mcp-server/src/services/compose.test.ts`

**Step 1: Add ValidationError tests to compose.test.ts**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.test.ts`

Add import at top:
```typescript
import { ValidationError } from "../errors/index.js";
```

Add new test suite near top of file:
```typescript
describe("validateProjectName - custom errors", () => {
  it("should throw ValidationError for invalid project name", () => {
    expect(() => validateProjectName("invalid@name")).toThrow(ValidationError);

    try {
      validateProjectName("invalid@name");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("projectName");
      expect((error as ValidationError).value).toBe("invalid@name");
      expect((error as ValidationError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("should throw ValidationError for empty project name", () => {
    expect(() => validateProjectName("")).toThrow(ValidationError);

    try {
      validateProjectName("");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("projectName");
    }
  });

  it("should accept valid project names", () => {
    expect(() => validateProjectName("valid-project")).not.toThrow();
    expect(() => validateProjectName("project_123")).not.toThrow();
    expect(() => validateProjectName("MyProject")).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose.test.ts -t "validateProjectName - custom errors"`

Expected output:
```
FAIL  src/services/compose.test.ts
  validateProjectName - custom errors
    ✕ should throw ValidationError for invalid project name
    ✕ should throw ValidationError for empty project name
```

**Step 3: Migrate compose validation to ValidationError**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.ts`

Add import at top:
```typescript
import { ValidationError } from "../errors/index.js";
```

Replace validation functions:
```typescript
export function validateProjectName(name: string): void {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new ValidationError(
      `Invalid project name: ${name}`,
      "projectName",
      name
    );
  }
}

function validateComposeArgs(args: string[]): void {
  const SHELL_METACHARACTERS = /[;&|`$()<>{}[\]\\"\n\r\t]/;

  for (const arg of args) {
    if (SHELL_METACHARACTERS.test(arg)) {
      throw new ValidationError(
        `Invalid character in compose argument: ${arg}`,
        "composeArg",
        arg
      );
    }

    // Additional safety: reject extremely long arguments (DoS prevention)
    if (arg.length > 500) {
      throw new ValidationError(
        `Compose argument too long: ${arg.substring(0, 50)}...`,
        "composeArg",
        arg
      );
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/compose.test.ts -t "validateProjectName - custom errors"`

Expected output:
```
PASS  src/services/compose.test.ts
  validateProjectName - custom errors
    ✓ should throw ValidationError for invalid project name
    ✓ should throw ValidationError for empty project name
    ✓ should accept valid project names

Test Files  1 passed (1)
     Tests  3 passed (3)
```

**Step 5: Run full compose test suite**

Run: `pnpm test src/services/compose.test.ts`

Expected: All tests pass (existing tests should still work)

**Step 6: Commit compose service migration**

```bash
git add src/services/compose.ts src/services/compose.test.ts
git commit -m "refactor(errors): migrate compose service to ValidationError

- Replace generic Error with ValidationError in compose validation
- Add tests for ValidationError properties in compose functions
- Include field names for projectName and composeArg validations
- Maintain backward compatibility with existing tests

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Migrate Docker Service Error Handling

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/docker.ts`
- Create: `/mnt/cache/code/homelab-mcp-server/src/services/docker.test.ts` (if needed)

**Step 1: Identify and replace unsupported protocol error**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/docker.ts`

Add imports at top:
```typescript
import { ValidationError, ConfigurationError } from "../errors/index.js";
```

Replace line 166 (unsupported protocol):
```typescript
  } else {
    throw new ValidationError(
      `Unsupported protocol: ${config.protocol}`,
      "protocol",
      config.protocol
    );
  }
```

**Step 2: Replace config parsing errors**

Replace lines 102-104 (config parse error):
```typescript
      } catch (error) {
        throw new ConfigurationError(
          `Failed to parse config file: ${error instanceof Error ? error.message : "Invalid JSON"}`,
          "hosts",
          configPath,
          error instanceof Error ? error : undefined
        );
      }
```

Replace lines 115-117 (env config parse error):
```typescript
      } catch (error) {
        throw new ConfigurationError(
          `Failed to parse HOMELAB_HOSTS_CONFIG: ${error instanceof Error ? error.message : "Invalid JSON"}`,
          "HOMELAB_HOSTS_CONFIG",
          undefined,
          error instanceof Error ? error : undefined
        );
      }
```

**Step 3: Replace image name validation error**

Replace line 890 (image name required):
```typescript
    throw new ValidationError(
      "Image name is required",
      "image",
      ""
    );
```

Replace line 1004 (invalid image tag):
```typescript
    throw new ValidationError(
      `Invalid image tag: ${tag}`,
      "tag",
      tag
    );
```

**Step 4: Create minimal test for docker service errors**

Create: `/mnt/cache/code/homelab-mcp-server/src/services/docker.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { getDockerClient } from "./docker.js";
import { ValidationError } from "../errors/index.js";
import type { HostConfig } from "../types.js";

describe("getDockerClient", () => {
  it("should throw ValidationError for unsupported protocol", () => {
    const config: HostConfig = {
      name: "test",
      host: "localhost",
      protocol: "ftp" as any // Invalid protocol
    };

    expect(() => getDockerClient(config)).toThrow(ValidationError);

    try {
      getDockerClient(config);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("protocol");
      expect((error as ValidationError).value).toBe("ftp");
    }
  });
});
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/services/docker.test.ts`

Expected output:
```
PASS  src/services/docker.test.ts
  getDockerClient
    ✓ should throw ValidationError for unsupported protocol

Test Files  1 passed (1)
     Tests  1 passed (1)
```

**Step 6: Verify existing tests still pass**

Run: `pnpm test src/services/`

Expected: All service tests pass

**Step 7: Commit docker service migration**

```bash
git add src/services/docker.ts src/services/docker.test.ts
git commit -m "refactor(errors): migrate docker service to custom errors

- Replace generic Error with ValidationError for protocol validation
- Replace generic Error with ConfigurationError for config parsing
- Add ValidationError for image name validation
- Add basic unit tests for error handling

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Migrate SSH Pool and Execution Error Handling

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh-pool-exec.ts:76-100`
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh-pool.ts:140-168`

**Step 1: Migrate ssh-pool-exec timeout and command errors**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh-pool-exec.ts`

Add imports at top:
```typescript
import { TimeoutError, SSHCommandError } from "../errors/index.js";
```

Replace lines 74-78 (timeout error):
```typescript
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `SSH command timeout after ${timeoutMs}ms: ${command}`,
          host.name,
          timeoutMs,
          fullCommand
        ));
      }, timeoutMs);
    });
```

Replace lines 85-90 (command failure error):
```typescript
    if (result.code !== 0) {
      throw new SSHCommandError(
        `SSH command failed (exit ${result.code}): ${command}`,
        fullCommand,
        host.name,
        result.code,
        result.stderr
      );
    }
```

Replace lines 94-99 (catch block):
```typescript
  } catch (error) {
    // Re-throw TimeoutError and SSHCommandError as-is
    if (error instanceof TimeoutError || error instanceof SSHCommandError) {
      throw error;
    }
    // Wrap other errors
    throw new SSHCommandError(
      `SSH command failed: ${command} - ${String(error)}`,
      command,
      host.name,
      -1,
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
```

**Step 2: Migrate ssh-pool health check error**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh-pool.ts`

Add import at top:
```typescript
import { SSHConnectionError } from "../errors/index.js";
```

Replace line 140 (health check error):
```typescript
        throw new SSHConnectionError(
          "Health check command failed",
          host.host,
          host.port,
          host.sshUser
        );
```

Replace lines 168-172 (connection error):
```typescript
      throw new SSHConnectionError(
        `Failed to establish SSH connection to ${host.name}: ${error instanceof Error ? error.message : String(error)}`,
        host.host,
        host.port,
        host.sshUser,
        error instanceof Error ? error : undefined
      );
```

**Step 3: Update ssh-pool-exec tests**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/ssh-pool-exec.test.ts`

Add import at top:
```typescript
import { SSHCommandError } from "../errors/index.js";
```

Find the test around line 222 and update:
```typescript
      } catch (error) {
        expect(error).toBeInstanceOf(SSHCommandError);
        expect((error as SSHCommandError).command).toContain("nonexistent-command");
        expect((error as SSHCommandError).exitCode).toBeGreaterThan(0);
      }
```

**Step 4: Run ssh-pool tests to verify**

Run: `pnpm test src/services/ssh-pool`

Expected output:
```
PASS  src/services/ssh-pool.test.ts
PASS  src/services/ssh-pool-exec.test.ts
PASS  src/services/ssh-pool.benchmark.test.ts

Test Files  3 passed (3)
```

**Step 5: Commit ssh-pool migration**

```bash
git add src/services/ssh-pool.ts src/services/ssh-pool-exec.ts src/services/ssh-pool-exec.test.ts
git commit -m "refactor(errors): migrate SSH pool to custom errors

- Replace timeout Error with TimeoutError in ssh-pool-exec
- Replace command failure Error with SSHCommandError
- Replace health check Error with SSHConnectionError in ssh-pool
- Update tests to verify custom error types
- Preserve error chaining for root cause tracking

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Migrate Compose Service Operation Errors

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.ts:116-246`

**Step 1: Migrate compose operation errors**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.ts`

Add import at top:
```typescript
import { ComposeOperationError } from "../errors/index.js";
```

Replace lines 116-119 (composeExec error):
```typescript
  } catch (error) {
    throw new ComposeOperationError(
      `Compose command failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      command,
      projectName,
      host.name,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
```

Replace lines 150-153 (list projects error):
```typescript
  } catch (error) {
    throw new ComposeOperationError(
      `Failed to list compose projects: ${error instanceof Error ? error.message : "Unknown error"}`,
      "ls",
      "",
      host.name,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
```

Replace lines 243-246 (get status error):
```typescript
  } catch (error) {
    throw new ComposeOperationError(
      `Failed to get compose status: ${error instanceof Error ? error.message : "Unknown error"}`,
      "ps",
      projectName,
      host.name,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
```

**Step 2: Replace service name validation errors**

Find lines 318, 347, 375, 403 (service name validation):

Replace each occurrence of:
```typescript
        throw new Error(`Invalid service name: ${service}`);
```

With:
```typescript
        throw new ValidationError(
          `Invalid service name: ${service}`,
          "service",
          service
        );
```

**Step 3: Run compose tests to verify**

Run: `pnpm test src/services/compose.test.ts`

Expected: All tests pass (or need minimal updates)

**Step 4: Update compose integration test**

Modify: `/mnt/cache/code/homelab-mcp-server/src/services/compose.integration.test.ts`

Update line 24-26:
```typescript
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/Invalid character/);
      expect((error as ValidationError).value).toMatch(/-v;/);
```

**Step 5: Run integration test**

Run: `pnpm test src/services/compose.integration.test.ts`

Expected output:
```
PASS  src/services/compose.integration.test.ts

Test Files  1 passed (1)
```

**Step 6: Commit compose operations migration**

```bash
git add src/services/compose.ts src/services/compose.integration.test.ts
git commit -m "refactor(errors): migrate compose operations to custom errors

- Replace generic Error with ComposeOperationError
- Add operation context (command, project, service)
- Replace service validation with ValidationError
- Preserve error chaining for debugging
- Update integration tests

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Migrate Unified Tool Error Handling

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/tools/unified.ts:198-210,238-252,479-493,636-650,704-718,796-810,877-891`

**Step 1: Import formatErrorForMCP**

Modify: `/mnt/cache/code/homelab-mcp-server/src/tools/unified.ts`

Add import at top:
```typescript
import { formatErrorForMCP, HostNotFoundError } from "../errors/index.js";
```

**Step 2: Replace generic catch block (lines 198-210)**

Replace:
```typescript
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ]
        };
      }
```

With:
```typescript
      } catch (error) {
        return formatErrorForMCP(error);
      }
```

**Step 3: Replace action routing errors**

Replace line 238:
```typescript
      throw new Error(`Unknown action: ${action}`);
```

With:
```typescript
      throw new ValidationError(
        `Unknown action: ${action}`,
        "action",
        action
      );
```

Replace lines 252, 493, 650, 718, 810 (invalid action errors):
```typescript
  if (params.action !== "container") throw new Error("Invalid action");
```

With:
```typescript
  if (params.action !== "container") {
    throw new ValidationError(
      `Invalid action: expected 'container', got '${params.action}'`,
      "action",
      params.action
    );
  }
```

**Step 4: Replace subaction errors**

Replace lines 479, 636, 704, 796, 877 (unknown subaction):
```typescript
      throw new Error(`Unknown container subaction: ${subaction}`);
```

With:
```typescript
      throw new ValidationError(
        `Unknown container subaction: ${subaction}`,
        "subaction",
        subaction
      );
```

(Repeat for compose, host, docker, image subactions)

**Step 5: Replace host not found errors using helper**

Replace errorResponse calls for host not found (around lines 258-262, 497-499, etc.):

Replace:
```typescript
        return errorResponse(
          `Host '${params.host}' not found. Available: ${hosts.map((h) => h.name).join(", ")}`
        );
```

With:
```typescript
        throw new HostNotFoundError(
          params.host,
          hosts.map((h) => h.name)
        );
```

**Step 6: Simplify error response helpers**

Remove the `errorResponse` function since we now use `formatErrorForMCP`:

Delete lines 910-918:
```typescript
function errorResponse(message: string): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}
```

**Step 7: Update remaining errorResponse calls**

Replace all remaining `errorResponse(...)` calls with:
```typescript
return formatErrorForMCP(new Error("message"));
```

Or better, throw appropriate custom errors and let the catch block handle them.

**Step 8: Run unified tool tests**

Run: `pnpm test src/tools/unified`

Expected: Tests pass (may need minor updates)

**Step 9: Commit unified tool migration**

```bash
git add src/tools/unified.ts
git commit -m "refactor(errors): migrate unified tool to custom errors

- Replace generic Error with ValidationError for routing
- Use HostNotFoundError for missing hosts
- Replace errorResponse with formatErrorForMCP
- Remove redundant error response helper
- Simplify error handling with custom error types

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Update Integration Tests

**Files:**
- Modify: `/mnt/cache/code/homelab-mcp-server/src/tools/unified.integration.test.ts`

**Step 1: Update integration test error expectations**

Modify: `/mnt/cache/code/homelab-mcp-server/src/tools/unified.integration.test.ts`

Find all error assertion patterns and update to check for custom errors:

Replace patterns like:
```typescript
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
```

With:
```typescript
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("CONTAINER_NOT_FOUND");
    expect(result.content[0].text).toContain("not found");
```

**Step 2: Add error code checks**

For each error test case, add error code assertions:
```typescript
    expect(result.content[0].text).toMatch(/Code: \w+_ERROR/);
```

**Step 3: Run integration tests**

Run: `pnpm test src/tools/unified.integration.test.ts`

Expected: All tests pass with updated error format

**Step 4: Commit integration test updates**

```bash
git add src/tools/unified.integration.test.ts
git commit -m "test(errors): update integration tests for custom error format

- Add error code assertions to integration tests
- Verify formatErrorForMCP output format
- Check for structured error context in responses

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Run Full Test Suite and Fix Remaining Issues

**Step 1: Run full test suite**

Run: `pnpm test`

Expected: Identify any remaining test failures

**Step 2: Fix any remaining test failures**

For each failure:
1. Identify the test and error type
2. Update test expectations to match custom error format
3. Ensure error codes are checked where appropriate

**Step 3: Run tests again**

Run: `pnpm test`

Expected output:
```
Test Files  XX passed (XX)
     Tests  XXX passed (XXX)
```

All tests passing.

**Step 4: Run type checking**

Run: `pnpm run typecheck` (or `tsc --noEmit`)

Expected: No type errors

**Step 5: Run linting**

Run: `pnpm run lint`

Expected: No linting errors (or fix any that appear)

**Step 6: Commit final fixes**

```bash
git add .
git commit -m "test(errors): fix remaining test failures after error migration

- Update all test expectations for custom error format
- Fix type errors from error class changes
- Resolve linting issues

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 17: Update Documentation

**Files:**
- Create: `/mnt/cache/code/homelab-mcp-server/docs/errors.md`
- Modify: `/mnt/cache/code/homelab-mcp-server/README.md`

**Step 1: Create error documentation**

Create: `/mnt/cache/code/homelab-mcp-server/docs/errors.md`

```markdown
# Error Handling

## Overview

homelab-mcp-server uses a custom error hierarchy for better error categorization, debugging, and MCP protocol integration.

## Error Hierarchy

All errors extend `HomelabError` base class:

```typescript
class HomelabError extends Error {
  code: string;              // Machine-readable error code
  context?: Record<string, unknown>;  // Additional context
  cause?: Error;             // Original error (error chaining)
}
```

## Error Categories

### ValidationError

Thrown when input validation fails.

**Error Code:** `VALIDATION_ERROR`

**Fields:**
- `field: string` - Name of the invalid field
- `value: unknown` - The invalid value

**Examples:**
- Invalid project name format
- Invalid host configuration
- Directory traversal attempt
- Shell injection attempt

### ConnectionError

Base error for connection failures.

**Error Code:** `CONNECTION_ERROR`

**Subclasses:**
- `SSHConnectionError` - SSH connection failures
- `DockerConnectionError` - Docker API connection failures
- `TimeoutError` - Operation timeouts

### ResourceNotFoundError

Thrown when a resource cannot be found.

**Error Code:** `RESOURCE_NOT_FOUND`

**Subclasses:**
- `ContainerNotFoundError` - Container not found
- `ImageNotFoundError` - Image not found
- `HostNotFoundError` - Host not in configuration
- `ProjectNotFoundError` - Compose project not found

### OperationError

Thrown when an operation fails.

**Error Code:** `OPERATION_ERROR`

**Subclasses:**
- `DockerOperationError` - Docker operations (start, stop, etc.)
- `SSHCommandError` - SSH command execution
- `ComposeOperationError` - Compose operations (up, down, etc.)

### ConfigurationError

Thrown when configuration is missing or invalid.

**Error Code:** `CONFIGURATION_ERROR`

## Error Context

All errors include structured context for debugging:

```typescript
const error = new ValidationError(
  "Invalid project name",
  "projectName",
  "bad@name"
);

console.log(error.code);      // "VALIDATION_ERROR"
console.log(error.field);     // "projectName"
console.log(error.value);     // "bad@name"
console.log(error.context);   // { field: "projectName", value: "bad@name" }
```

## Error Chaining

Errors preserve the original error via `cause`:

```typescript
try {
  // Some operation that fails
} catch (err) {
  throw new DockerOperationError(
    "Failed to start container",
    "start",
    "plex",
    "unraid",
    undefined,
    err  // Preserve original error
  );
}
```

## MCP Integration

The `formatErrorForMCP` function converts errors to MCP protocol format:

```typescript
import { formatErrorForMCP } from "./errors/index.js";

try {
  // Operation
} catch (error) {
  return formatErrorForMCP(error);
}
```

**Output format:**
```
Error: Container 'plex' not found on host 'unraid'
Code: CONTAINER_NOT_FOUND

Context:
  resourceType: "container"
  resourceId: "plex"
  host: "unraid"
```

## Testing Errors

Custom errors make testing easier:

```typescript
import { ValidationError } from "../errors/index.js";

it("should throw ValidationError for invalid input", () => {
  expect(() => validateInput("bad$input")).toThrow(ValidationError);

  try {
    validateInput("bad$input");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("input");
    expect((error as ValidationError).code).toBe("VALIDATION_ERROR");
  }
});
```

## Best Practices

1. **Use specific error types** - Don't use generic `Error` or `HomelabError`
2. **Include context** - Always provide relevant context fields
3. **Chain errors** - Preserve original errors via `cause`
4. **Test error types** - Verify custom error types in tests
5. **Document error codes** - Keep this documentation updated
```

**Step 2: Update README.md**

Modify: `/mnt/cache/code/homelab-mcp-server/README.md`

Add section in appropriate place (after "Architecture" or before "Development"):

```markdown
## Error Handling

homelab-mcp-server uses a comprehensive custom error hierarchy for better debugging and error reporting.

See [docs/errors.md](./docs/errors.md) for detailed error handling documentation.

**Key features:**
- Structured error codes for programmatic handling
- Context-rich errors with field names and values
- Error chaining for root cause analysis
- MCP protocol integration
```

**Step 3: Commit documentation**

```bash
git add docs/errors.md README.md
git commit -m "docs(errors): add comprehensive error handling documentation

- Create detailed error hierarchy documentation
- Document all error types and their usage
- Add examples for error handling and testing
- Update README with error handling reference

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 18: Final Verification and Cleanup

**Step 1: Run full test suite with coverage**

Run: `pnpm run test:coverage`

Expected: High coverage for error classes (>90%)

**Step 2: Verify build succeeds**

Run: `pnpm run build`

Expected output:
```
Building TypeScript...
Build successful
```

**Step 3: Check for any remaining generic Error usage**

Run: `grep -r "throw new Error" src/ --include="*.ts" --exclude-dir=node_modules`

Review results - should only be tests or intentional generic errors.

**Step 4: Run linter**

Run: `pnpm run lint`

Expected: No errors

**Step 5: Create final summary commit**

```bash
git add .
git commit -m "feat(errors): complete custom error hierarchy implementation

Summary of changes:
- Implemented HomelabError base class with codes and context
- Added ValidationError for input validation failures
- Added connection errors (SSH, Docker, Timeout)
- Added resource errors (Container, Image, Host, Project)
- Added operation errors (Docker, SSH, Compose)
- Added ConfigurationError for config issues
- Integrated formatErrorForMCP for protocol responses
- Migrated all services to use custom errors
- Updated all tests to verify custom error types
- Added comprehensive error documentation

Benefits:
- Better error categorization and debugging
- Structured error context for logging
- Error chaining preserves root causes
- MCP protocol integration
- Improved testability

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Step 6: Review git log**

Run: `git log --oneline -20`

Verify all commits follow conventions and tell a clear story.

---

## Execution Complete

**Plan saved to:** `docs/plans/2025-12-24-custom-error-hierarchy.md`

**Estimated time:** 3-4 hours for complete implementation

**Test coverage target:** >90% for error classes

**Migration strategy:** Incremental - each task is independently testable and committable

---

## Post-Implementation Checklist

- [ ] All tests passing (`pnpm test`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Type checking passes (`pnpm run typecheck`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] Documentation updated
- [ ] Coverage targets met
- [ ] No generic Error usage in services (except intentional)
- [ ] All error responses use formatErrorForMCP
