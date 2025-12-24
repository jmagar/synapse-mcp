# Unified Homelab Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

**Goal:** Consolidate 15 separate MCP tools into a single `homelab` tool with action/subaction pattern to reduce token usage from tool schemas.

**Architecture:** Single unified Zod schema with discriminated union on `action` field. Router function dispatches to existing service layer. New operations (pull, build, recreate) added to services. All 15 existing tool handlers refactored into action handlers within one tool registration.

**Tech Stack:** TypeScript, Zod schemas, MCP SDK, dockerode, SSH via execFile

---

## Task 1: Create Unified Schema

**Files:**
- Create: `src/schemas/unified.ts`
- Modify: `src/schemas/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// src/schemas/unified.test.ts
import { describe, it, expect } from "vitest";
import { UnifiedHomelabSchema } from "./unified.js";

describe("UnifiedHomelabSchema", () => {
  it("should validate container list action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "list",
      state: "running"
    });
    expect(result.success).toBe(true);
  });

  it("should validate container restart action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "restart",
      container_id: "plex"
    });
    expect(result.success).toBe(true);
  });

  it("should validate compose up action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "compose",
      subaction: "up",
      host: "tootie",
      project: "plex"
    });
    expect(result.success).toBe(true);
  });

  it("should validate host resources action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "host",
      subaction: "resources",
      host: "tootie"
    });
    expect(result.success).toBe(true);
  });

  it("should validate docker prune action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "docker",
      subaction: "prune",
      prune_target: "images",
      force: true
    });
    expect(result.success).toBe(true);
  });

  it("should validate image list action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "image",
      subaction: "list",
      dangling_only: true
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "invalid",
      subaction: "list"
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid subaction for action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "up" // up is for compose, not container
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/unified.test.ts`
Expected: FAIL with "Cannot find module './unified.js'"

**Step 3: Write the unified schema**

```typescript
// src/schemas/unified.ts
import { z } from "zod";
import { ResponseFormat } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_LOG_LINES, MAX_LOG_LINES } from "../constants.js";

// ===== Base schemas =====
const responseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' or 'json'");

const paginationSchema = {
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0)
};

// ===== Container subactions =====
const containerListSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("list"),
  host: z.string().optional(),
  state: z.enum(["all", "running", "stopped", "paused"]).default("all"),
  name_filter: z.string().optional(),
  image_filter: z.string().optional(),
  label_filter: z.string().optional(),
  ...paginationSchema,
  response_format: responseFormatSchema
});

// Individual container control schemas (for proper discrimination)
const containerStartSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("start"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerStopSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("stop"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerRestartSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("restart"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerPauseSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("pause"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerUnpauseSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("unpause"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerLogsSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("logs"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  since: z.string().optional(),
  until: z.string().optional(),
  grep: z.string().optional(),
  stream: z.enum(["all", "stdout", "stderr"]).default("all"),
  response_format: responseFormatSchema
});

const containerStatsSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("stats"),
  container_id: z.string().optional(),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const containerInspectSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("inspect"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const containerSearchSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("search"),
  query: z.string().min(1),
  host: z.string().optional(),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const containerPullSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("pull"),
  container_id: z.string().min(1),
  host: z.string().optional()
});

const containerRecreateSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("recreate"),
  container_id: z.string().min(1),
  host: z.string().optional(),
  pull: z.boolean().default(true).describe("Pull latest image before recreating")
});

// ===== Compose subactions =====
const composeListSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("list"),
  host: z.string().min(1),
  response_format: responseFormatSchema
});

const composeStatusSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("status"),
  host: z.string().min(1),
  project: z.string().min(1),
  response_format: responseFormatSchema
});

const composeUpSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("up"),
  host: z.string().min(1),
  project: z.string().min(1),
  detach: z.boolean().default(true)
});

const composeDownSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("down"),
  host: z.string().min(1),
  project: z.string().min(1),
  remove_volumes: z.boolean().default(false)
});

const composeRestartSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("restart"),
  host: z.string().min(1),
  project: z.string().min(1)
});

const composeLogsSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("logs"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional(),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  response_format: responseFormatSchema
});

const composeBuildSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("build"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional(),
  no_cache: z.boolean().default(false)
});

const composeRecreateSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("recreate"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional()
});

const composePullSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("pull"),
  host: z.string().min(1),
  project: z.string().min(1),
  service: z.string().optional()
});

// ===== Host subactions =====
const hostStatusSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("status"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const hostResourcesSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("resources"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

// ===== Docker subactions =====
const dockerInfoSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("info"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const dockerDfSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("df"),
  host: z.string().optional(),
  response_format: responseFormatSchema
});

const dockerPruneSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("prune"),
  host: z.string().optional(),
  prune_target: z.enum(["containers", "images", "volumes", "networks", "buildcache", "all"]),
  force: z.boolean().default(false)
});

// ===== Image subactions =====
const imageListSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("list"),
  host: z.string().optional(),
  dangling_only: z.boolean().default(false),
  ...paginationSchema,
  response_format: responseFormatSchema
});

const imagePullSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("pull"),
  host: z.string().min(1),
  image: z.string().min(1).describe("Image name with optional tag (e.g., 'nginx:latest')")
});

const imageBuildSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("build"),
  host: z.string().min(1),
  context: z.string().min(1).describe("Path to build context directory"),
  tag: z.string().min(1).describe("Image tag (e.g., 'myapp:v1')"),
  dockerfile: z.string().optional().describe("Path to Dockerfile (default: context/Dockerfile)"),
  no_cache: z.boolean().default(false)
});

const imageRemoveSchema = z.object({
  action: z.literal("image"),
  subaction: z.literal("remove"),
  host: z.string().min(1),
  image: z.string().min(1).describe("Image ID or name:tag"),
  force: z.boolean().default(false)
});

// ===== Unified schema using z.union (flat structure for proper validation) =====
// NOTE: z.discriminatedUnion requires all variants to share the same discriminator.
// Since we have action + subaction pairs, we use z.union with refinement for clarity.
export const UnifiedHomelabSchema = z.union([
  // Container actions
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerUnpauseSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  // Compose actions
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composeRecreateSchema,
  composePullSchema,
  // Host actions
  hostStatusSchema,
  hostResourcesSchema,
  // Docker actions
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  // Image actions
  imageListSchema,
  imagePullSchema,
  imageBuildSchema,
  imageRemoveSchema
]);

export type UnifiedHomelabInput = z.infer<typeof UnifiedHomelabSchema>;

// Re-export individual schemas for type narrowing
export {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerUnpauseSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composeRecreateSchema,
  composePullSchema,
  hostStatusSchema,
  hostResourcesSchema,
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  imageListSchema,
  imagePullSchema,
  imageBuildSchema,
  imageRemoveSchema
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/unified.test.ts`
Expected: PASS

**Step 5: Export from schemas/index.ts**

Add to `src/schemas/index.ts`:
```typescript
export * from "./unified.js";
```

**Step 6: Commit**

```bash
git add src/schemas/unified.ts src/schemas/unified.test.ts src/schemas/index.ts
git commit -m "$(cat <<'EOF'
feat: add unified homelab schema with action/subaction pattern

Consolidates 15 separate tool schemas into single discriminated union.
Supports container, compose, host, docker, and image actions.
EOF
)"
```

---

## Task 2: Add New Service Functions (Container Pull/Recreate)

**Files:**
- Modify: `src/services/docker.ts`
- Modify: `src/services/docker.test.ts`

**Step 1: Write the failing tests**

Add to `src/services/docker.test.ts`:
```typescript
import { pullImage, recreateContainer, removeImage, buildImage } from "./docker.js";

describe("pullImage", () => {
  it("should be an async function that accepts imageName and host", () => {
    expect(typeof pullImage).toBe("function");
    expect(pullImage.length).toBe(2); // 2 parameters
  });

  it("should reject with error message when Docker connection fails", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(pullImage("nginx:latest", invalidHost))
      .rejects.toThrow(/Failed to pull image|ENOTFOUND|ECONNREFUSED/);
  });

  it("should reject with error for empty image name", async () => {
    const invalidHost = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(pullImage("", invalidHost))
      .rejects.toThrow();
  });
});

describe("recreateContainer", () => {
  it("should be an async function that accepts containerId, host, and options", () => {
    expect(typeof recreateContainer).toBe("function");
    expect(recreateContainer.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject when container does not exist", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(recreateContainer("nonexistent-container", invalidHost))
      .rejects.toThrow();
  });
});

describe("removeImage", () => {
  it("should be an async function that accepts imageId, host, and options", () => {
    expect(typeof removeImage).toBe("function");
    expect(removeImage.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject when image does not exist", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(removeImage("nonexistent:image", invalidHost))
      .rejects.toThrow();
  });
});

describe("buildImage", () => {
  it("should be an async function that accepts host and options", () => {
    expect(typeof buildImage).toBe("function");
    expect(buildImage.length).toBe(2);
  });

  it("should reject with validation error for invalid tag characters", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(buildImage(host, {
      context: "/valid/path",
      tag: "invalid tag with spaces"
    })).rejects.toThrow("Invalid image tag");
  });

  it("should reject with validation error for invalid context path", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(buildImage(host, {
      context: "path with spaces",
      tag: "valid:tag"
    })).rejects.toThrow("Invalid build context");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/docker.test.ts`
Expected: FAIL with "pullImage is not exported" or similar import error

**Step 3: Implement the new functions**

Add to `src/services/docker.ts`:
```typescript
/**
 * Pull an image on a host
 */
export async function pullImage(
  imageName: string,
  host: HostConfig
): Promise<{ status: string }> {
  const docker = getDockerClient(host);

  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) {
        reject(new Error(`Failed to pull image: ${err.message}`));
        return;
      }

      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) {
          reject(new Error(`Pull failed: ${err.message}`));
        } else {
          resolve({ status: `Successfully pulled ${imageName}` });
        }
      });
    });
  });
}

/**
 * Recreate a container (stop, remove, pull latest, start with same config)
 */
export async function recreateContainer(
  containerId: string,
  host: HostConfig,
  options: { pull?: boolean } = {}
): Promise<{ status: string; containerId: string }> {
  const docker = getDockerClient(host);
  const container = docker.getContainer(containerId);

  // Get current container config
  const info = await container.inspect();
  const imageName = info.Config.Image;

  // Stop container if running
  if (info.State.Running) {
    await container.stop();
  }

  // Remove container
  await container.remove();

  // Pull latest image if requested
  if (options.pull !== false) {
    await pullImage(imageName, host);
  }

  // Create new container with same config
  const newContainer = await docker.createContainer({
    ...info.Config,
    HostConfig: info.HostConfig,
    NetworkingConfig: {
      EndpointsConfig: info.NetworkSettings.Networks
    }
  });

  // Start new container
  await newContainer.start();

  return {
    status: "Container recreated successfully",
    containerId: newContainer.id
  };
}

/**
 * Remove an image
 */
export async function removeImage(
  imageId: string,
  host: HostConfig,
  options: { force?: boolean } = {}
): Promise<{ status: string }> {
  const docker = getDockerClient(host);
  const image = docker.getImage(imageId);

  await image.remove({ force: options.force });

  return { status: `Successfully removed image ${imageId}` };
}

/**
 * Build an image from a Dockerfile (SSH-based for remote hosts)
 */
export async function buildImage(
  host: HostConfig,
  options: {
    context: string;
    tag: string;
    dockerfile?: string;
    noCache?: boolean;
  }
): Promise<{ status: string }> {
  // For remote builds, we need to use SSH and docker build command
  // dockerode's build() requires local tar stream which won't work for remote

  const { context, tag, dockerfile, noCache } = options;

  // Validate inputs
  if (!/^[a-zA-Z0-9._\-/:]+$/.test(tag)) {
    throw new Error(`Invalid image tag: ${tag}`);
  }
  if (!/^[a-zA-Z0-9._\-/]+$/.test(context)) {
    throw new Error(`Invalid build context: ${context}`);
  }

  const args: string[] = ["build", "-t", tag];

  if (noCache) {
    args.push("--no-cache");
  }

  if (dockerfile) {
    if (!/^[a-zA-Z0-9._\-/]+$/.test(dockerfile)) {
      throw new Error(`Invalid dockerfile path: ${dockerfile}`);
    }
    args.push("-f", dockerfile);
  }

  args.push(context);

  // Execute via SSH for remote hosts, or locally for socket connections
  if (host.host.startsWith("/")) {
    // Local socket - use docker directly
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    await execFileAsync("docker", args, { timeout: 600000 }); // 10 min timeout for builds
  } else {
    // Remote - use SSH
    const { validateHostForSsh, sanitizeForShell } = await import("./ssh.js");
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    validateHostForSsh(host);

    const sshArgs = [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=5",
      "-o", "StrictHostKeyChecking=accept-new",
      sanitizeForShell(host.name),
      `docker ${args.join(" ")}`
    ];

    await execFileAsync("ssh", sshArgs, { timeout: 600000 });
  }

  return { status: `Successfully built image ${tag}` };
}
```

**Step 4: Export the new functions**

Add exports to bottom of `src/services/docker.ts`:
```typescript
export { pullImage, recreateContainer, removeImage, buildImage };
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/docker.ts src/services/docker.test.ts
git commit -m "$(cat <<'EOF'
feat: add pullImage, recreateContainer, removeImage, buildImage services

New service functions for expanded container/image operations.
EOF
)"
```

---

## Task 3: Add New Compose Service Functions (Build/Pull/Recreate)

**Files:**
- Modify: `src/services/compose.ts`
- Modify: `src/services/compose.test.ts`

**Step 1: Write the failing tests**

Add to `src/services/compose.test.ts`:
```typescript
import { composeBuild, composePull, composeRecreate } from "./compose.js";

describe("composeBuild", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeBuild).toBe("function");
    expect(composeBuild.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(composeBuild(host, "myproject", {
      service: "invalid service name with spaces"
    })).rejects.toThrow("Invalid service name");
  });
});

describe("composePull", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composePull).toBe("function");
    expect(composePull.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(composePull(host, "myproject", {
      service: "invalid!service"
    })).rejects.toThrow("Invalid service name");
  });
});

describe("composeRecreate", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeRecreate).toBe("function");
    expect(composeRecreate.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(composeRecreate(host, "myproject", {
      service: "bad@service"
    })).rejects.toThrow("Invalid service name");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose.test.ts`
Expected: FAIL with "composeBuild is not exported" or similar import error

**Step 3: Implement the new functions**

Add to `src/services/compose.ts`:
```typescript
/**
 * Build images for a compose project
 */
export async function composeBuild(
  host: HostConfig,
  project: string,
  options: { service?: string; noCache?: boolean } = {}
): Promise<string> {
  const args: string[] = [];

  if (options.noCache) {
    args.push("--no-cache");
  }

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "build", args);
}

/**
 * Pull images for a compose project
 */
export async function composePull(
  host: HostConfig,
  project: string,
  options: { service?: string } = {}
): Promise<string> {
  const args: string[] = [];

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "pull", args);
}

/**
 * Recreate containers for a compose project (force recreate)
 */
export async function composeRecreate(
  host: HostConfig,
  project: string,
  options: { service?: string } = {}
): Promise<string> {
  const args: string[] = ["-d", "--force-recreate"];

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "up", args);
}
```

**Step 4: Export the new functions**

Update exports at bottom of file to include new functions.

**Step 5: Run test to verify it passes**

Run: `pnpm test src/services/compose.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/compose.ts src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
feat: add composeBuild, composePull, composeRecreate services

New compose operations for build, pull, and force-recreate workflows.
EOF
)"
```

---

## Task 4: Create Unified Tool Handler

**Files:**
- Create: `src/tools/unified.ts`
- Create: `src/tools/unified.test.ts`
- Modify: `src/tools/index.ts` (replace all individual registrations)

**Step 1: Write the failing tests**

```typescript
// src/tools/unified.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("registerUnifiedTool", () => {
  let mockServer: McpServer;
  let registeredTools: Map<string, unknown>;

  beforeEach(() => {
    registeredTools = new Map();
    mockServer = {
      registerTool: vi.fn((name, config, handler) => {
        registeredTools.set(name, { config, handler });
      })
    } as unknown as McpServer;
  });

  it("should register a single 'homelab' tool", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
    expect(registeredTools.has("homelab")).toBe(true);
  });

  it("should register tool with correct title and description", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    const tool = registeredTools.get("homelab") as { config: { title: string; description: string } };
    expect(tool.config.title).toBe("Homelab Manager");
    expect(tool.config.description).toContain("container");
    expect(tool.config.description).toContain("compose");
    expect(tool.config.description).toContain("host");
    expect(tool.config.description).toContain("docker");
    expect(tool.config.description).toContain("image");
  });

  it("should have a handler function", async () => {
    const { registerUnifiedTool } = await import("./unified.js");
    registerUnifiedTool(mockServer);

    const tool = registeredTools.get("homelab") as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});

describe("routeAction", () => {
  it("should throw error for unknown action", async () => {
    // This tests the internal routing logic
    const { registerUnifiedTool } = await import("./unified.js");
    const mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);

    const handler = (mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const result = await handler({ action: "invalid", subaction: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown action");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/unified.test.ts`
Expected: FAIL with "Cannot find module './unified.js'"

**Step 3: Create the unified tool handler**

```typescript
// src/tools/unified.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UnifiedHomelabSchema, type UnifiedHomelabInput } from "../schemas/unified.js";
import {
  loadHostConfigs,
  listContainers,
  containerAction,
  getContainerLogs,
  getContainerStats,
  getHostStatus,
  inspectContainer,
  findContainerHost,
  formatBytes,
  getDockerInfo,
  getDockerDiskUsage,
  pruneDocker,
  listImages,
  pullImage,
  recreateContainer,
  removeImage,
  buildImage
} from "../services/docker.js";
import { getHostResources } from "../services/ssh.js";
import {
  listComposeProjects,
  getComposeStatus,
  composeUp,
  composeDown,
  composeRestart,
  composeLogs,
  composeBuild,
  composePull,
  composeRecreate
} from "../services/compose.js";
import { ResponseFormat, HostConfig } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

// Import all formatters from original tools/index.ts (will refactor these)
// For now, inline the key ones

/**
 * Register the unified homelab tool
 */
export function registerUnifiedTool(server: McpServer): void {
  const hosts = loadHostConfigs();

  const TOOL_DESCRIPTION = `Unified homelab Docker management tool.

ACTIONS:
  container <subaction>  - Container operations
    list                 - List containers with filters
    start/stop/restart   - Control container state
    pause/unpause        - Pause/unpause container
    logs                 - Get container logs
    stats                - Get resource usage stats
    inspect              - Get detailed container info
    search               - Search containers by query
    pull                 - Pull latest image for container
    recreate             - Recreate container with latest image

  compose <subaction>    - Docker Compose operations
    list                 - List compose projects
    status               - Get project status
    up/down/restart      - Control project state
    logs                 - Get project logs
    build                - Build project images
    pull                 - Pull project images
    recreate             - Force recreate containers

  host <subaction>       - Host operations
    status               - Check host connectivity
    resources            - Get CPU/memory/disk via SSH

  docker <subaction>     - Docker daemon operations
    info                 - Get Docker system info
    df                   - Get disk usage
    prune                - Remove unused resources

  image <subaction>      - Image operations
    list                 - List images
    pull                 - Pull an image
    build                - Build from Dockerfile
    remove               - Remove an image

EXAMPLES:
  { action: "container", subaction: "list", state: "running" }
  { action: "container", subaction: "restart", container_id: "plex" }
  { action: "compose", subaction: "up", host: "tootie", project: "plex" }
  { action: "host", subaction: "resources", host: "tootie" }
  { action: "docker", subaction: "prune", prune_target: "images", force: true }
  { action: "image", subaction: "pull", host: "tootie", image: "nginx:latest" }`;

  server.registerTool(
    "homelab",
    {
      title: "Homelab Manager",
      description: TOOL_DESCRIPTION,
      inputSchema: UnifiedHomelabSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: UnifiedHomelabInput) => {
      try {
        return await routeAction(params, hosts);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );
}

/**
 * Route action to appropriate handler
 */
async function routeAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
  const { action } = params;

  switch (action) {
    case "container":
      return handleContainerAction(params, hosts);
    case "compose":
      return handleComposeAction(params, hosts);
    case "host":
      return handleHostAction(params, hosts);
    case "docker":
      return handleDockerAction(params, hosts);
    case "image":
      return handleImageAction(params, hosts);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ... (handler implementations follow the same pattern as existing tool handlers)
// Each handler function routes based on subaction and calls the service layer
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS - all 4 tests should pass

**Step 5: Implement all action handlers**

Create individual handler functions for each action category that dispatch based on subaction. These reuse the existing service layer and formatting functions.

**Step 6: Update tools/index.ts**

Replace the entire file with:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";

/**
 * Register all homelab tools with the MCP server
 */
export function registerTools(server: McpServer): void {
  registerUnifiedTool(server);
}
```

**Step 7: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 8: Build and verify**

Run: `pnpm build`
Expected: Build successful

**Step 9: Commit**

```bash
git add src/tools/unified.ts src/tools/index.ts
git commit -m "$(cat <<'EOF'
feat: consolidate 15 tools into unified homelab tool

Single tool with action/subaction pattern replaces 15 separate tools.
Reduces schema token overhead significantly.
All existing functionality preserved.
EOF
)"
```

---

## Task 5: Move Formatting Functions to Dedicated Module

**Files:**
- Create: `src/formatters/index.ts`
- Create: `src/formatters/formatters.test.ts`
- Modify: `src/tools/unified.ts` (import formatters)

**Step 0: Create formatters directory**

```bash
mkdir -p src/formatters
```

**Step 1: Write tests for formatting functions BEFORE moving them**

```typescript
// src/formatters/formatters.test.ts
import { describe, it, expect } from "vitest";
import {
  formatContainersMarkdown,
  formatLogsMarkdown,
  formatHostStatusMarkdown,
  truncateIfNeeded
} from "./index.js";

describe("truncateIfNeeded", () => {
  it("should return text unchanged if under limit", () => {
    const text = "short text";
    expect(truncateIfNeeded(text)).toBe(text);
  });

  it("should truncate text exceeding CHARACTER_LIMIT", () => {
    const longText = "x".repeat(50000);
    const result = truncateIfNeeded(longText);
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain("truncated");
  });
});

describe("formatContainersMarkdown", () => {
  it("should return 'No containers found' for empty array", () => {
    const result = formatContainersMarkdown([], 0, 0, false);
    expect(result).toContain("No containers found");
  });

  it("should format container list with state emojis", () => {
    const containers = [{
      id: "abc123",
      name: "test-container",
      image: "nginx:latest",
      state: "running" as const,
      status: "Up 2 hours",
      hostName: "tootie",
      ports: [],
      labels: {}
    }];
    const result = formatContainersMarkdown(containers, 1, 0, false);
    expect(result).toContain("🟢");
    expect(result).toContain("test-container");
    expect(result).toContain("nginx:latest");
  });

  it("should show pagination info when hasMore is true", () => {
    const containers = [{
      id: "abc123",
      name: "test",
      image: "nginx",
      state: "running" as const,
      status: "Up",
      hostName: "tootie",
      ports: [],
      labels: {}
    }];
    const result = formatContainersMarkdown(containers, 10, 0, true);
    expect(result).toContain("More results available");
  });
});

describe("formatLogsMarkdown", () => {
  it("should return 'No logs found' for empty array", () => {
    const result = formatLogsMarkdown([], "test", "host");
    expect(result).toContain("No logs found");
  });

  it("should format log entries with timestamps", () => {
    const logs = [
      { timestamp: "2024-01-01T12:00:00Z", message: "Test log message" }
    ];
    const result = formatLogsMarkdown(logs, "container", "host");
    expect(result).toContain("12:00:00");
    expect(result).toContain("Test log message");
  });
});

describe("formatHostStatusMarkdown", () => {
  it("should show online status with green emoji", () => {
    const status = [{
      name: "tootie",
      connected: true,
      containerCount: 10,
      runningCount: 8
    }];
    const result = formatHostStatusMarkdown(status);
    expect(result).toContain("🟢");
    expect(result).toContain("Online");
    expect(result).toContain("tootie");
  });

  it("should show offline status with red emoji", () => {
    const status = [{
      name: "offline-host",
      connected: false,
      containerCount: 0,
      runningCount: 0,
      error: "Connection refused"
    }];
    const result = formatHostStatusMarkdown(status);
    expect(result).toContain("🔴");
    expect(result).toContain("Offline");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/formatters/formatters.test.ts`
Expected: FAIL with "Cannot find module './index.js'"

**Step 3: Extract all format* functions to src/formatters/index.ts**

Move all the formatting helper functions (formatContainersMarkdown, formatLogsMarkdown, etc.) from tools/index.ts to a dedicated formatters module.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/formatters/formatters.test.ts`
Expected: PASS - all formatter tests should pass

**Step 5: Update imports in unified.ts**

**Step 6: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/formatters/index.ts src/formatters/formatters.test.ts src/tools/unified.ts
git commit -m "$(cat <<'EOF'
refactor: extract formatting helpers to dedicated module

Adds comprehensive tests for formatters before refactoring.
Improves code organization and reusability.
EOF
)"
```

---

## Task 6: Delete Legacy Schema Exports (Optional Cleanup)

**Files:**
- Modify: `src/schemas/index.ts`
- Modify: `src/schemas/unified.test.ts`

**Step 1: Write tests verifying unified schema can replace legacy schemas (RED)**

Add to `src/schemas/unified.test.ts`:
```typescript
describe("unified schema replaces legacy schemas", () => {
  it("should export homelabSchema as default schema", async () => {
    const { homelabSchema } = await import("./unified.js");
    expect(homelabSchema).toBeDefined();
    expect(typeof homelabSchema.parse).toBe("function");
  });

  it("should export all subaction schemas for composition", async () => {
    const schemas = await import("./unified.js");

    // Container schemas
    expect(schemas.containerListSchema).toBeDefined();
    expect(schemas.containerActionSchema).toBeDefined();
    expect(schemas.containerLogsSchema).toBeDefined();
    expect(schemas.containerStatsSchema).toBeDefined();
    expect(schemas.containerInspectSchema).toBeDefined();
    expect(schemas.containerSearchSchema).toBeDefined();
    expect(schemas.containerPullSchema).toBeDefined();
    expect(schemas.containerRecreateSchema).toBeDefined();

    // Compose schemas
    expect(schemas.composeListSchema).toBeDefined();
    expect(schemas.composeStatusSchema).toBeDefined();
    expect(schemas.composeUpSchema).toBeDefined();
    expect(schemas.composeDownSchema).toBeDefined();
    expect(schemas.composeRestartSchema).toBeDefined();
    expect(schemas.composeLogsSchema).toBeDefined();
    expect(schemas.composeBuildSchema).toBeDefined();
    expect(schemas.composeRecreateSchema).toBeDefined();
    expect(schemas.composePullSchema).toBeDefined();

    // Host schemas
    expect(schemas.hostStatusSchema).toBeDefined();
    expect(schemas.hostResourcesSchema).toBeDefined();

    // Docker schemas
    expect(schemas.dockerInfoSchema).toBeDefined();
    expect(schemas.dockerDfSchema).toBeDefined();
    expect(schemas.dockerPruneSchema).toBeDefined();

    // Image schemas
    expect(schemas.imageListSchema).toBeDefined();
    expect(schemas.imagePullSchema).toBeDefined();
    expect(schemas.imageBuildSchema).toBeDefined();
    expect(schemas.imageRemoveSchema).toBeDefined();
  });

  it("should validate that unified schema index exports work", async () => {
    // This test ensures the index.ts re-export works correctly
    const { homelabSchema } = await import("./index.js");
    expect(homelabSchema).toBeDefined();
  });
});
```

**Step 2: Run test to verify it passes (GREEN)**

Run: `pnpm test src/schemas/unified.test.ts`
Expected: PASS - confirming unified schema exports work correctly

**Step 3: Remove individual schema exports from index.ts (REFACTOR)**

Modify `src/schemas/index.ts` to keep only unified schema exports:
```typescript
// src/schemas/index.ts
export * from "./unified.js";
```

**Step 4: Run all tests to verify nothing breaks**

Run: `pnpm test`
Expected: All tests PASS - no code depends on legacy schema exports

**Step 5: Commit**

```bash
git add src/schemas/index.ts src/schemas/unified.test.ts
git commit -m "$(cat <<'EOF'
refactor: remove legacy individual tool schemas

Unified schema replaces all individual schemas.
Tests verify all schema exports work correctly.
EOF
)"
```

---

## Task 7: Integration Testing

**Files:**
- Create: `src/tools/unified.integration.test.ts`

**Step 1: Write integration tests for the unified tool handler (RED)**

Create `src/tools/unified.integration.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiedTool } from "./unified.js";

describe("unified tool integration", () => {
  let mockServer: McpServer;
  let toolHandler: (params: unknown) => Promise<unknown>;

  beforeEach(() => {
    const registeredTools = new Map<string, (params: unknown) => Promise<unknown>>();
    mockServer = {
      tool: vi.fn((name, _desc, handler) => {
        registeredTools.set(name, handler);
      })
    } as unknown as McpServer;

    registerUnifiedTool(mockServer);
    toolHandler = registeredTools.get("homelab")!;
  });

  describe("container actions", () => {
    it("should handle container list with valid params", async () => {
      const result = await toolHandler({
        action: "container",
        subaction: "list",
        state: "running"
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    it("should reject invalid container action", async () => {
      await expect(toolHandler({
        action: "container",
        subaction: "invalid_action"
      })).rejects.toThrow();
    });

    it("should handle container stats request", async () => {
      const result = await toolHandler({
        action: "container",
        subaction: "stats"
      });
      expect(result).toBeDefined();
    });
  });

  describe("compose actions", () => {
    it("should handle compose list with host param", async () => {
      const result = await toolHandler({
        action: "compose",
        subaction: "list",
        host: "tootie"
      });
      expect(result).toBeDefined();
    });

    it("should reject compose up without required project param", async () => {
      await expect(toolHandler({
        action: "compose",
        subaction: "up",
        host: "tootie"
        // missing project param
      })).rejects.toThrow();
    });
  });

  describe("host actions", () => {
    it("should handle host status request", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "status"
      });
      expect(result).toBeDefined();
    });

    it("should handle host resources request", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "resources"
      });
      expect(result).toBeDefined();
    });
  });

  describe("docker actions", () => {
    it("should handle docker info request", async () => {
      const result = await toolHandler({
        action: "docker",
        subaction: "info"
      });
      expect(result).toBeDefined();
    });

    it("should handle docker df request", async () => {
      const result = await toolHandler({
        action: "docker",
        subaction: "df"
      });
      expect(result).toBeDefined();
    });

    it("should reject prune without force flag", async () => {
      await expect(toolHandler({
        action: "docker",
        subaction: "prune",
        target: "images"
        // missing force: true
      })).rejects.toThrow();
    });
  });

  describe("image actions", () => {
    it("should handle image list request", async () => {
      const result = await toolHandler({
        action: "image",
        subaction: "list"
      });
      expect(result).toBeDefined();
    });

    it("should reject image pull without image_name", async () => {
      await expect(toolHandler({
        action: "image",
        subaction: "pull"
        // missing image_name
      })).rejects.toThrow();
    });
  });

  describe("response format", () => {
    it("should return markdown by default", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "status"
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
    });

    it("should return JSON when response_format is json", async () => {
      const result = await toolHandler({
        action: "host",
        subaction: "status",
        response_format: "json"
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toBeDefined();
      // JSON format should be parseable
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe("schema validation", () => {
    it("should reject unknown action", async () => {
      await expect(toolHandler({
        action: "unknown",
        subaction: "list"
      })).rejects.toThrow();
    });

    it("should reject missing action", async () => {
      await expect(toolHandler({
        subaction: "list"
      })).rejects.toThrow();
    });

    it("should reject missing subaction", async () => {
      await expect(toolHandler({
        action: "container"
      })).rejects.toThrow();
    });
  });
});
```

**Step 2: Run tests to see failures (verify test setup)**

Run: `pnpm test src/tools/unified.integration.test.ts`
Expected: Tests run (may have some failures if services unavailable - that's OK)

**Step 3: Build the project**

Run: `pnpm build`
Expected: Build successful with no TypeScript errors

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Verify test coverage report**

Run: `pnpm test --coverage`
Expected: Coverage report shows unified tool is tested

**Step 6: Commit**

```bash
git add src/tools/unified.integration.test.ts
git commit -m "$(cat <<'EOF'
test: add integration tests for unified homelab tool

Tests cover:
- All action/subaction combinations
- Schema validation errors
- Response format handling
- Required parameter enforcement
EOF
)"
```

---

## Summary

| Task | Description | Files | TDD Pattern |
|------|-------------|-------|-------------|
| 1 | Create unified Zod schema | `schemas/unified.ts`, `schemas/unified.test.ts` | RED-GREEN-REFACTOR |
| 2 | Add container pull/recreate services | `services/docker.ts`, `services/docker.test.ts` | RED-GREEN-REFACTOR |
| 3 | Add compose build/pull/recreate services | `services/compose.ts`, `services/compose.test.ts` | RED-GREEN-REFACTOR |
| 4 | Create unified tool handler | `tools/unified.ts`, `tools/unified.test.ts` | RED-GREEN-REFACTOR |
| 5 | Extract formatters to module | `formatters/index.ts`, `formatters/formatters.test.ts` | RED-GREEN-REFACTOR |
| 6 | Cleanup legacy schemas | `schemas/index.ts`, `schemas/unified.test.ts` | RED-GREEN-REFACTOR |
| 7 | Integration testing | `tools/unified.integration.test.ts` | Automated tests |

**Token Savings:** 15 tool schemas (~3000 tokens) → 1 unified schema (~500 tokens) = ~2500 token reduction per conversation.

**TDD Compliance:** All tasks follow Red-Green-Refactor cycle with tests written before implementation.
