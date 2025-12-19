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

const containerActionSchema = z.object({
  action: z.literal("container"),
  subaction: z.enum(["start", "stop", "restart", "pause", "unpause"]),
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

// ===== Unified discriminated union =====
export const UnifiedHomelabSchema = z.discriminatedUnion("action", [
  // Container actions - need custom discrimination
  z.discriminatedUnion("subaction", [
    containerListSchema,
    containerLogsSchema,
    containerStatsSchema,
    containerInspectSchema,
    containerSearchSchema,
    containerPullSchema,
    containerRecreateSchema
  ]).or(containerActionSchema),
  // Compose actions
  z.discriminatedUnion("subaction", [
    composeListSchema,
    composeStatusSchema,
    composeUpSchema,
    composeDownSchema,
    composeRestartSchema,
    composeLogsSchema,
    composeBuildSchema,
    composeRecreateSchema,
    composePullSchema
  ]),
  // Host actions
  z.discriminatedUnion("subaction", [
    hostStatusSchema,
    hostResourcesSchema
  ]),
  // Docker actions
  z.discriminatedUnion("subaction", [
    dockerInfoSchema,
    dockerDfSchema,
    dockerPruneSchema
  ]),
  // Image actions
  z.discriminatedUnion("subaction", [
    imageListSchema,
    imagePullSchema,
    imageBuildSchema,
    imageRemoveSchema
  ])
]);

export type UnifiedHomelabInput = z.infer<typeof UnifiedHomelabSchema>;

// Re-export individual schemas for type narrowing
export {
  containerListSchema,
  containerActionSchema,
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
describe("pullImage", () => {
  it("should be a function", () => {
    expect(typeof pullImage).toBe("function");
  });
});

describe("recreateContainer", () => {
  it("should be a function", () => {
    expect(typeof recreateContainer).toBe("function");
  });
});

describe("removeImage", () => {
  it("should be a function", () => {
    expect(typeof removeImage).toBe("function");
  });
});

describe("buildImage", () => {
  it("should be a function", () => {
    expect(typeof buildImage).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/docker.test.ts`
Expected: FAIL with "pullImage is not defined"

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
describe("composeBuild", () => {
  it("should be a function", () => {
    expect(typeof composeBuild).toBe("function");
  });
});

describe("composePull", () => {
  it("should be a function", () => {
    expect(typeof composePull).toBe("function");
  });
});

describe("composeRecreate", () => {
  it("should be a function", () => {
    expect(typeof composeRecreate).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/compose.test.ts`
Expected: FAIL with "composeBuild is not defined"

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
- Modify: `src/tools/index.ts` (replace all individual registrations)

**Step 1: Create the unified tool handler**

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

**Step 2: Implement all action handlers**

Create individual handler functions for each action category that dispatch based on subaction. These reuse the existing service layer and formatting functions.

**Step 3: Update tools/index.ts**

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

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Build and verify**

Run: `pnpm build`
Expected: Build successful

**Step 6: Commit**

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
- Modify: `src/tools/unified.ts` (import formatters)

**Step 1: Extract all format* functions to src/formatters/index.ts**

Move all the formatting helper functions (formatContainersMarkdown, formatLogsMarkdown, etc.) from tools/index.ts to a dedicated formatters module.

**Step 2: Update imports in unified.ts**

**Step 3: Run tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/formatters/index.ts src/tools/unified.ts
git commit -m "$(cat <<'EOF'
refactor: extract formatting helpers to dedicated module

Improves code organization and reusability.
EOF
)"
```

---

## Task 6: Delete Legacy Schema Exports (Optional Cleanup)

**Files:**
- Modify: `src/schemas/index.ts`

**Step 1: Remove individual schema exports**

Keep only the unified schema exports. The old schemas are no longer needed.

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/schemas/index.ts
git commit -m "$(cat <<'EOF'
refactor: remove legacy individual tool schemas

Unified schema replaces all individual schemas.
EOF
)"
```

---

## Task 7: Integration Testing

**Files:**
- No new files

**Step 1: Build the project**

Run: `pnpm build`
Expected: Build successful

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 3: Manual MCP testing**

After reconnecting the MCP server, test key operations:
```
homelab container list
homelab container logs plex
homelab compose list tootie
homelab host resources
homelab docker info
homelab image list
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create unified Zod schema | `schemas/unified.ts` |
| 2 | Add container pull/recreate services | `services/docker.ts` |
| 3 | Add compose build/pull/recreate services | `services/compose.ts` |
| 4 | Create unified tool handler | `tools/unified.ts` |
| 5 | Extract formatters to module | `formatters/index.ts` |
| 6 | Cleanup legacy schemas | `schemas/index.ts` |
| 7 | Integration testing | - |

**Token Savings:** 15 tool schemas (~3000 tokens) → 1 unified schema (~500 tokens) = ~2500 token reduction per conversation.
