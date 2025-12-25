# Refactor Functions to Stay Under 50-Line Limit

**Created:** 04:36:22 AM | 12/25/2025 (UTC)

> **Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor all 12 functions exceeding the 50-line limit by extracting helper functions following DRY, YAGNI, and KISS principles.

**Architecture:** Extract switch case handlers into dedicated functions, create calculation helpers for repetitive stats logic, and build response formatters to eliminate duplication. Maintain existing behavior while improving modularity.

**Tech Stack:** TypeScript 5.7+, Vitest, strict type checking

---

## Task 1: Extract handleContainerAction Case Handlers (238 lines → <50)

**Priority:** CRITICAL
**Files:**
- Modify: `src/tools/unified.ts:244-481`
- Test: `src/tools/unified.test.ts`

**Pattern:** Large switch statement with 11 cases. Extract each case into a dedicated handler function.

### Step 1: Write test for container list behavior via public API

**Test file:** `src/tools/unified.test.ts`

Note: We test the extracted handler behavior through the public `routeAction` function, not by exporting private helpers. This maintains encapsulation while ensuring correct behavior.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeAction } from "./unified.js";
import type { HostConfig } from "../types.js";

// Mock the docker service
vi.mock("../services/docker.js", () => ({
  listContainers: vi.fn().mockResolvedValue([])
}));

describe("container list action", () => {
  const mockHosts: HostConfig[] = [
    { name: "test", host: "localhost", protocol: "http", port: 2375 }
  ];

  it("should return error when host not found", async () => {
    const params = {
      action: "container" as const,
      subaction: "list" as const,
      host: "nonexistent",
      offset: 0,
      limit: 50,
      response_format: "markdown" as const
    };

    const result = await routeAction(params, mockHosts);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Host 'nonexistent' not found");
  });

  it("should list containers successfully", async () => {
    const params = {
      action: "container" as const,
      subaction: "list" as const,
      offset: 0,
      limit: 50,
      response_format: "markdown" as const
    };

    const result = await routeAction(params, mockHosts);

    expect(result.isError).toBeUndefined();
  });
});
```

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS (tests existing behavior before refactor)

### Step 2: Extract handleContainerList function (internal)

**Modify:** `src/tools/unified.ts`

Extract as a **private** function (not exported) - this is an internal refactor that doesn't change the public API. Add before `handleContainerAction`:

```typescript
/**
 * Handle container list subaction
 */
async function handleContainerList(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
  if (params.host && targetHosts.length === 0) {
    return errorResponse(
      `Host '${params.host}' not found. Available: ${hosts.map((h) => h.name).join(", ")}`
    );
  }

  const containers = await listContainers(targetHosts, {
    state: params.state,
    nameFilter: params.name_filter,
    imageFilter: params.image_filter,
    labelFilter: params.label_filter
  });

  const total = containers.length;
  const paginated = containers.slice(params.offset, params.offset + params.limit);
  const hasMore = total > params.offset + params.limit;

  const output = {
    total,
    count: paginated.length,
    offset: params.offset,
    containers: paginated,
    has_more: hasMore
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatContainersMarkdown(paginated, total, params.offset, hasMore);

  return successResponse(text, output);
}
```

Replace case "list" block in `handleContainerAction`:

```typescript
case "list":
  return handleContainerList(params, hosts);
```

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

### Step 3: Extract handleContainerAction helpers (start/stop/restart/pause/unpause)

Add before `handleContainerAction`:

```typescript
/**
 * Handle container state change actions (start, stop, restart, pause, unpause)
 */
async function handleContainerStateAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
  if (!targetHost) {
    return errorResponse(`Container '${params.container_id}' not found.`);
  }

  await containerAction(params.container_id, params.subaction as "start" | "stop" | "restart" | "pause" | "unpause", targetHost);
  return successResponse(
    `✓ Successfully performed '${params.subaction}' on container '${params.container_id}' (host: ${targetHost.name})`
  );
}
```

Replace in `handleContainerAction`:

```typescript
case "start":
case "stop":
case "restart":
case "pause":
case "unpause":
  return handleContainerStateAction(params, hosts);
```

### Step 4: Extract remaining container handlers

Add these functions:

```typescript
/**
 * Handle container logs subaction
 */
async function handleContainerLogs(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
  if (!targetHost) {
    return errorResponse(`Container '${params.container_id}' not found.`);
  }

  let logs = await getContainerLogs(params.container_id, targetHost, {
    lines: params.lines,
    since: params.since,
    until: params.until,
    stream: params.stream
  });

  if (params.grep) {
    const grepLower = params.grep.toLowerCase();
    logs = logs.filter((l) => l.message.toLowerCase().includes(grepLower));
  }

  const output = {
    container: params.container_id,
    host: targetHost.name,
    count: logs.length,
    logs
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatLogsMarkdown(logs, params.container_id, targetHost.name);

  return successResponse(text, output);
}

/**
 * Handle container stats subaction
 */
async function handleContainerStats(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.container_id) {
    const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
    if (!targetHost) {
      return errorResponse(`Container '${params.container_id}' not found.`);
    }

    const stats = await getContainerStats(params.container_id, targetHost);
    const output = { ...stats, host: targetHost.name };
    const text =
      params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatStatsMarkdown([stats], targetHost.name);

    return successResponse(text, output);
  } else {
    const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
    const allStats = await collectStatsParallel(targetHosts, 20);

    const output = { stats: allStats.map((s) => ({ ...s.stats, host: s.host })) };
    const text =
      params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatMultiStatsMarkdown(allStats);

    return successResponse(text, output);
  }
}

/**
 * Handle container inspect subaction
 */
async function handleContainerInspect(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
  if (!targetHost) {
    return errorResponse(`Container '${params.container_id}' not found.`);
  }

  const info = await inspectContainer(params.container_id, targetHost);

  if (params.summary) {
    const summary = {
      id: info.Id?.slice(0, 12),
      name: info.Name?.replace(/^\//, ""),
      image: info.Config?.Image,
      state: info.State?.Status,
      created: info.Created,
      started: info.State?.StartedAt,
      restartCount: info.RestartCount,
      ports: Object.keys(info.NetworkSettings?.Ports || {}).filter(
        (p) => info.NetworkSettings?.Ports?.[p]
      ),
      mounts: (info.Mounts || []).map((m: { Source?: string; Destination?: string; Type?: string }) => ({
        src: m.Source,
        dst: m.Destination,
        type: m.Type
      })),
      networks: Object.keys(info.NetworkSettings?.Networks || {}),
      env_count: (info.Config?.Env || []).length,
      labels_count: Object.keys(info.Config?.Labels || {}).length,
      host: targetHost.name
    };
    const text =
      params.response_format === ResponseFormat.JSON
        ? JSON.stringify(summary, null, 2)
        : formatInspectSummaryMarkdown(summary);

    return successResponse(text, summary);
  }

  const output = { ...info, _host: targetHost.name };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatInspectMarkdown(info, targetHost.name);

  return successResponse(text, output);
}

/**
 * Handle container search subaction
 */
async function handleContainerSearch(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
  const allContainers = await listContainers(targetHosts, {});
  const query = params.query.toLowerCase();

  const matches = allContainers.filter((c) => {
    const searchText = [c.name, c.image, ...Object.keys(c.labels), ...Object.values(c.labels)]
      .join(" ")
      .toLowerCase();
    return searchText.includes(query);
  });

  const total = matches.length;
  const paginated = matches.slice(params.offset, params.offset + params.limit);
  const hasMore = total > params.offset + params.limit;

  const output = {
    query: params.query,
    total,
    count: paginated.length,
    containers: paginated,
    has_more: hasMore
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatSearchResultsMarkdown(paginated, params.query, total);

  return successResponse(text, output);
}

/**
 * Handle container pull subaction
 */
async function handleContainerPull(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
  if (!targetHost) {
    return errorResponse(`Container '${params.container_id}' not found.`);
  }

  const info = await inspectContainer(params.container_id, targetHost);
  const imageName = info.Config.Image;
  await pullImage(imageName, targetHost);

  return successResponse(
    `✓ Successfully pulled latest image '${imageName}' for container '${params.container_id}'`
  );
}

/**
 * Handle container recreate subaction
 */
async function handleContainerRecreate(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
  if (!targetHost) {
    return errorResponse(`Container '${params.container_id}' not found.`);
  }

  const result = await recreateContainer(params.container_id, targetHost, {
    pull: params.pull
  });
  return successResponse(
    `✓ ${result.status}. New container ID: ${result.containerId.slice(0, 12)}`
  );
}
```

### Step 5: Simplify handleContainerAction to dispatch only

Replace entire `handleContainerAction` body:

```typescript
async function handleContainerAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "container") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "list":
      return handleContainerList(params, hosts);
    case "start":
    case "stop":
    case "restart":
    case "pause":
    case "unpause":
      return handleContainerStateAction(params, hosts);
    case "logs":
      return handleContainerLogs(params, hosts);
    case "stats":
      return handleContainerStats(params, hosts);
    case "inspect":
      return handleContainerInspect(params, hosts);
    case "search":
      return handleContainerSearch(params, hosts);
    case "pull":
      return handleContainerPull(params, hosts);
    case "recreate":
      return handleContainerRecreate(params, hosts);
    default:
      throw new Error(`Unknown container subaction: ${subaction}`);
  }
}
```

Now `handleContainerAction` is 24 lines.

### Step 6: Run all tests

Run: `pnpm test src/tools/unified.test.ts`
Expected: All tests PASS

### Step 7: Commit container action refactor

```bash
git add src/tools/unified.ts src/tools/unified.test.ts
git commit -m "refactor: extract handleContainerAction case handlers (238→24 lines)"
```

---

## Task 2: Extract handleComposeAction Case Handlers (154 lines → <50)

**Files:**
- Modify: `src/tools/unified.ts:485-638`

**Pattern:** Switch statement with 8 compose subaction cases.

### Step 1: Extract compose case handlers

Add these functions before `handleComposeAction`:

```typescript
/**
 * Handle compose list subaction
 */
async function handleComposeList(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  let projects = await listComposeProjects(targetHost);

  if (params.name_filter) {
    const filter = params.name_filter.toLowerCase();
    projects = projects.filter((p) => p.name.toLowerCase().includes(filter));
  }

  const total = projects.length;
  const paginated = projects.slice(params.offset, params.offset + params.limit);
  const hasMore = total > params.offset + params.limit;

  const output = {
    host: params.host,
    total,
    count: paginated.length,
    offset: params.offset,
    projects: paginated,
    has_more: hasMore
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatComposeListMarkdown(paginated, params.host, total, params.offset, hasMore);

  return successResponse(text, output);
}

/**
 * Handle compose status subaction
 */
async function handleComposeStatus(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  let status = await getComposeStatus(targetHost, params.project);

  if (params.service_filter) {
    const filter = params.service_filter.toLowerCase();
    status = {
      ...status,
      services: status.services.filter((s) => s.name.toLowerCase().includes(filter))
    };
  }

  const totalServices = status.services.length;
  const paginatedServices = status.services.slice(params.offset, params.offset + params.limit);
  const hasMore = totalServices > params.offset + params.limit;

  const paginatedStatus = { ...status, services: paginatedServices };
  const output = {
    project: params.project,
    host: params.host,
    total_services: totalServices,
    count: paginatedServices.length,
    offset: params.offset,
    has_more: hasMore,
    status: paginatedStatus
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatComposeStatusMarkdown(paginatedStatus, totalServices, params.offset, hasMore);

  return successResponse(text, output);
}

/**
 * Handle compose up subaction
 */
async function handleComposeUp(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composeUp(targetHost, params.project, params.detach);
  const status = await getComposeStatus(targetHost, params.project);
  const text = `✓ Started project '${params.project}'\n\n${formatComposeStatusMarkdown(status)}`;

  return successResponse(text, { project: params.project, status });
}

/**
 * Handle compose down subaction
 */
async function handleComposeDown(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composeDown(targetHost, params.project, params.remove_volumes);
  return successResponse(`✓ Stopped project '${params.project}'`);
}

/**
 * Handle compose restart subaction
 */
async function handleComposeRestart(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composeRestart(targetHost, params.project);
  const status = await getComposeStatus(targetHost, params.project);
  const text = `✓ Restarted project '${params.project}'\n\n${formatComposeStatusMarkdown(status)}`;

  return successResponse(text, { project: params.project, status });
}

/**
 * Handle compose logs subaction
 */
async function handleComposeLogs(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  const logs = await composeLogs(targetHost, params.project, {
    tail: params.lines,
    services: params.service ? [params.service] : undefined
  });

  const title = params.service
    ? `## Logs: ${params.project}/${params.service}`
    : `## Logs: ${params.project}`;

  const output = {
    project: params.project,
    host: params.host,
    service: params.service || "all",
    logs
  };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : `${title}\n\n\`\`\`\n${logs}\n\`\`\``;

  return successResponse(text, output);
}

/**
 * Handle compose build subaction
 */
async function handleComposeBuild(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composeBuild(targetHost, params.project, {
    service: params.service,
    noCache: params.no_cache
  });
  return successResponse(
    `✓ Built images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`
  );
}

/**
 * Handle compose pull subaction
 */
async function handleComposePull(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composePull(targetHost, params.project, { service: params.service });
  return successResponse(
    `✓ Pulled images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`
  );
}

/**
 * Handle compose recreate subaction
 */
async function handleComposeRecreate(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await composeRecreate(targetHost, params.project, { service: params.service });
  const status = await getComposeStatus(targetHost, params.project);
  const text = `✓ Recreated project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}\n\n${formatComposeStatusMarkdown(status)}`;

  return successResponse(text, { project: params.project, status });
}
```

### Step 2: Simplify handleComposeAction

Replace entire function body:

```typescript
async function handleComposeAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "compose") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "list":
      return handleComposeList(params, hosts);
    case "status":
      return handleComposeStatus(params, hosts);
    case "up":
      return handleComposeUp(params, hosts);
    case "down":
      return handleComposeDown(params, hosts);
    case "restart":
      return handleComposeRestart(params, hosts);
    case "logs":
      return handleComposeLogs(params, hosts);
    case "build":
      return handleComposeBuild(params, hosts);
    case "pull":
      return handleComposePull(params, hosts);
    case "recreate":
      return handleComposeRecreate(params, hosts);
    default:
      throw new Error(`Unknown compose subaction: ${subaction}`);
  }
}
```

Now `handleComposeAction` is 28 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

```bash
git add src/tools/unified.ts
git commit -m "refactor: extract handleComposeAction case handlers (154→28 lines)"
```

---

## Task 3: Extract Remaining Handler Functions

### Step 3a: handleDockerAction (89 lines → <50)

**Pattern:** 3 cases (info, df, prune)

Add before `handleDockerAction`:

```typescript
/**
 * Handle docker info subaction
 */
async function handleDockerInfo(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  try {
    const info = await getDockerInfo(targetHost);
    const results = [{ host: targetHost.name, info }];

    const output = { hosts: results };
    const text =
      params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatDockerInfoMarkdown(results);

    return successResponse(text, output);
  } catch (error) {
    return errorResponse(
      `Failed to get Docker info from ${targetHost.name}: ${error instanceof Error ? error.message : "Connection failed"}`
    );
  }
}

/**
 * Handle docker df subaction
 */
async function handleDockerDf(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  try {
    const usage = await getDockerDiskUsage(targetHost);
    const results = [{ host: targetHost.name, usage }];

    const output = { hosts: results };
    const text =
      params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatDockerDfMarkdown(results);

    return successResponse(text, output);
  } catch (error) {
    return errorResponse(
      `Failed to get disk usage from ${targetHost.name}: ${error instanceof Error ? error.message : "Connection failed"}`
    );
  }
}

/**
 * Handle docker prune subaction
 */
async function handleDockerPrune(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (!params.force) {
    return errorResponse("⚠️ This is a destructive operation. Set force=true to confirm.");
  }

  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  try {
    const results = await pruneDocker(targetHost, params.prune_target);
    const allResults = [{ host: targetHost.name, results }];

    const output = { hosts: allResults };
    const text = formatPruneMarkdown(allResults);

    return successResponse(text, output);
  } catch (error) {
    return errorResponse(
      `Failed to prune on ${targetHost.name}: ${error instanceof Error ? error.message : "Connection failed"}`
    );
  }
}
```

Replace `handleDockerAction`:

```typescript
async function handleDockerAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "docker") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "info":
      return handleDockerInfo(params, hosts);
    case "df":
      return handleDockerDf(params, hosts);
    case "prune":
      return handleDockerPrune(params, hosts);
    default:
      throw new Error(`Unknown docker subaction: ${subaction}`);
  }
}
```

Now `handleDockerAction` is 20 lines.

### Step 3b: handleImageAction (78 lines → <50)

**Pattern:** 4 cases (list, pull, build, remove)

Add before `handleImageAction`:

```typescript
/**
 * Handle image list subaction
 */
async function handleImageList(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
  if (params.host && targetHosts.length === 0) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  const images = await listImages(targetHosts, { danglingOnly: params.dangling_only });
  const paginated = images.slice(params.offset, params.offset + params.limit);

  const output = {
    images: paginated,
    pagination: {
      total: images.length,
      count: paginated.length,
      offset: params.offset,
      hasMore: params.offset + params.limit < images.length
    }
  };

  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatImagesMarkdown(paginated, images.length, params.offset);

  return successResponse(text, output);
}

/**
 * Handle image pull subaction
 */
async function handleImagePull(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await pullImage(params.image, targetHost);
  return successResponse(`✓ Successfully pulled image '${params.image}' on ${params.host}`);
}

/**
 * Handle image build subaction
 */
async function handleImageBuild(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await buildImage(targetHost, {
    context: params.context,
    tag: params.tag,
    dockerfile: params.dockerfile,
    noCache: params.no_cache
  });
  return successResponse(`✓ Successfully built image '${params.tag}' on ${params.host}`);
}

/**
 * Handle image remove subaction
 */
async function handleImageRemove(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  await removeImage(params.image, targetHost, { force: params.force });
  return successResponse(`✓ Successfully removed image '${params.image}' from ${params.host}`);
}
```

Replace `handleImageAction`:

```typescript
async function handleImageAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "image") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "list":
      return handleImageList(params, hosts);
    case "pull":
      return handleImagePull(params, hosts);
    case "build":
      return handleImageBuild(params, hosts);
    case "remove":
      return handleImageRemove(params, hosts);
    default:
      throw new Error(`Unknown image subaction: ${subaction}`);
  }
}
```

Now `handleImageAction` is 22 lines.

### Step 3c: handleHostAction (65 lines → <50)

**Pattern:** 2 cases (status, resources)

Add before `handleHostAction`:

```typescript
/**
 * Handle host status subaction
 */
async function handleHostStatus(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
  if (params.host && targetHosts.length === 0) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  const status = await getHostStatus(targetHosts);
  const output = { hosts: status };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatHostStatusMarkdown(status);

  return successResponse(text, output);
}

/**
 * Handle host resources subaction
 */
async function handleHostResources(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
  if (params.host && targetHosts.length === 0) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  const results = await Promise.all(
    targetHosts.map(async (host) => {
      if (host.host.startsWith("/")) {
        return { host: host.name, resources: null, error: "Local socket - SSH not available" };
      }
      try {
        const resources = await getHostResources(host);
        return { host: host.name, resources };
      } catch (error) {
        return {
          host: host.name,
          resources: null,
          error: error instanceof Error ? error.message : "SSH failed"
        };
      }
    })
  );

  const output = { hosts: results };
  const text =
    params.response_format === ResponseFormat.JSON
      ? JSON.stringify(output, null, 2)
      : formatHostResourcesMarkdown(results);

  return successResponse(text, output);
}
```

Replace `handleHostAction`:

```typescript
async function handleHostAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "host") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "status":
      return handleHostStatus(params, hosts);
    case "resources":
      return handleHostResources(params, hosts);
    default:
      throw new Error(`Unknown host subaction: ${subaction}`);
  }
}
```

Now `handleHostAction` is 18 lines.

### Step 3d: Run tests and commit all handler extractions

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

```bash
git add src/tools/unified.ts
git commit -m "refactor: extract docker, image, and host action handlers to <50 lines"
```

---

## Task 4: Refactor getDockerDiskUsage (82 lines → <50)

**Files:**
- Modify: `src/services/docker.ts:717-798`

**Pattern:** Repetitive calculation blocks for images, containers, volumes, build cache.

### Step 1: Extract calculation helpers

Add before `getDockerDiskUsage`:

```typescript
/**
 * Calculate image disk usage statistics
 */
function calculateImageStats(images: Array<{ Size?: number; SharedSize?: number; Containers?: number }>) {
  const imageSize = images.reduce((sum, i) => sum + (i.Size || 0), 0);
  const imageShared = images.reduce((sum, i) => sum + (i.SharedSize || 0), 0);
  const activeImages = images.filter((i) => i.Containers && i.Containers > 0).length;

  return {
    total: images.length,
    active: activeImages,
    size: imageSize,
    reclaimable: imageSize - imageShared
  };
}

/**
 * Calculate container disk usage statistics
 */
function calculateContainerStats(containers: Array<{ SizeRw?: number; SizeRootFs?: number; State?: string }>) {
  const containerSize = containers.reduce((sum, c) => sum + (c.SizeRw || 0), 0);
  const containerRootFs = containers.reduce((sum, c) => sum + (c.SizeRootFs || 0), 0);
  const runningContainers = containers.filter((c) => c.State === "running").length;

  return {
    total: containers.length,
    running: runningContainers,
    size: containerSize + containerRootFs,
    reclaimable: containerSize
  };
}

/**
 * Calculate volume disk usage statistics
 */
function calculateVolumeStats(volumes: Array<{ UsageData?: { Size?: number; RefCount?: number } }>) {
  const volumeSize = volumes.reduce((sum, v) => sum + (v.UsageData?.Size || 0), 0);
  const activeVolumes = volumes.filter(
    (v) => v.UsageData?.RefCount && v.UsageData.RefCount > 0
  ).length;
  const unusedVolumeSize = volumes
    .filter((v) => !v.UsageData?.RefCount)
    .reduce((sum, v) => sum + (v.UsageData?.Size || 0), 0);

  return {
    total: volumes.length,
    active: activeVolumes,
    size: volumeSize,
    reclaimable: unusedVolumeSize
  };
}

/**
 * Calculate build cache disk usage statistics
 */
function calculateBuildCacheStats(buildCache: Array<{ Size?: number; InUse?: boolean }>) {
  const buildCacheSize = buildCache.reduce((sum, b) => sum + (b.Size || 0), 0);
  const buildCacheReclaimable = buildCache
    .filter((b) => !b.InUse)
    .reduce((sum, b) => sum + (b.Size || 0), 0);

  return {
    total: buildCache.length,
    size: buildCacheSize,
    reclaimable: buildCacheReclaimable
  };
}
```

### Step 2: Simplify getDockerDiskUsage using helpers

Replace function body:

```typescript
export async function getDockerDiskUsage(host: HostConfig): Promise<DockerDiskUsage> {
  const docker = getDockerClient(host);
  const df = await docker.df();

  const images = calculateImageStats(df.Images || []);
  const containers = calculateContainerStats(df.Containers || []);
  const volumes = calculateVolumeStats(df.Volumes || []);
  const buildCache = calculateBuildCacheStats(df.BuildCache || []);

  const totalSize = images.size + containers.size + volumes.size + buildCache.size;
  const totalReclaimable =
    images.reclaimable + containers.reclaimable + volumes.reclaimable + buildCache.reclaimable;

  return {
    images,
    containers,
    volumes,
    buildCache,
    totalSize,
    totalReclaimable
  };
}
```

Now `getDockerDiskUsage` is 18 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

```bash
git add src/services/docker.ts
git commit -m "refactor: extract getDockerDiskUsage calculation helpers (82→18 lines)"
```

---

## Task 5: Refactor pruneDocker (81 lines → <50)

**Files:**
- Modify: `src/services/docker.ts:803-883`

**Pattern:** Large switch statement with 5 prune targets, repetitive error handling.

### Step 1: Extract prune target handlers

Add before `pruneDocker`:

```typescript
/**
 * Prune containers
 */
async function pruneContainers(docker: Docker): Promise<PruneResult> {
  try {
    const res = await docker.pruneContainers();
    return {
      type: "containers",
      spaceReclaimed: res.SpaceReclaimed || 0,
      itemsDeleted: res.ContainersDeleted?.length || 0,
      details: res.ContainersDeleted
    };
  } catch (error) {
    return {
      type: "containers",
      spaceReclaimed: 0,
      itemsDeleted: 0,
      details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}

/**
 * Prune images
 */
async function pruneImages(docker: Docker): Promise<PruneResult> {
  try {
    const res = await docker.pruneImages();
    return {
      type: "images",
      spaceReclaimed: res.SpaceReclaimed || 0,
      itemsDeleted: res.ImagesDeleted?.length || 0,
      details: res.ImagesDeleted?.map((i) => i.Deleted || i.Untagged || "")
    };
  } catch (error) {
    return {
      type: "images",
      spaceReclaimed: 0,
      itemsDeleted: 0,
      details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}

/**
 * Prune volumes
 */
async function pruneVolumes(docker: Docker): Promise<PruneResult> {
  try {
    const res = await docker.pruneVolumes();
    return {
      type: "volumes",
      spaceReclaimed: res.SpaceReclaimed || 0,
      itemsDeleted: res.VolumesDeleted?.length || 0,
      details: res.VolumesDeleted
    };
  } catch (error) {
    return {
      type: "volumes",
      spaceReclaimed: 0,
      itemsDeleted: 0,
      details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}

/**
 * Prune networks
 */
async function pruneNetworks(docker: Docker): Promise<PruneResult> {
  try {
    const res = await docker.pruneNetworks();
    return {
      type: "networks",
      spaceReclaimed: 0,
      itemsDeleted: res.NetworksDeleted?.length || 0,
      details: res.NetworksDeleted
    };
  } catch (error) {
    return {
      type: "networks",
      spaceReclaimed: 0,
      itemsDeleted: 0,
      details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}

/**
 * Prune build cache
 */
async function pruneBuildCache(docker: Docker): Promise<PruneResult> {
  try {
    const res = (await docker.pruneBuilder()) as {
      SpaceReclaimed?: number;
      CachesDeleted?: string[];
    };
    return {
      type: "buildcache",
      spaceReclaimed: res.SpaceReclaimed || 0,
      itemsDeleted: res.CachesDeleted?.length || 0,
      details: res.CachesDeleted
    };
  } catch (error) {
    return {
      type: "buildcache",
      spaceReclaimed: 0,
      itemsDeleted: 0,
      details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}
```

### Step 2: Simplify pruneDocker using helpers

Replace function body:

```typescript
export async function pruneDocker(
  host: HostConfig,
  target: "containers" | "images" | "volumes" | "networks" | "buildcache" | "all"
): Promise<PruneResult[]> {
  const docker = getDockerClient(host);

  if (target === "all") {
    return Promise.all([
      pruneContainers(docker),
      pruneImages(docker),
      pruneVolumes(docker),
      pruneNetworks(docker),
      pruneBuildCache(docker)
    ]);
  }

  switch (target) {
    case "containers":
      return [await pruneContainers(docker)];
    case "images":
      return [await pruneImages(docker)];
    case "volumes":
      return [await pruneVolumes(docker)];
    case "networks":
      return [await pruneNetworks(docker)];
    case "buildcache":
      return [await pruneBuildCache(docker)];
  }
}
```

Now `pruneDocker` is 28 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

```bash
git add src/services/docker.ts
git commit -m "refactor: extract pruneDocker target handlers (81→28 lines)"
```

---

## Task 6: Refactor getComposeStatus (67 lines → <50)

**Files:**
- Modify: `src/services/compose.ts:177-243`

**Pattern:** Parse JSON lines + calculate overall status logic.

### Step 1: Extract JSON parsing helper

Add before `getComposeStatus`:

```typescript
/**
 * Parse compose service from JSON line
 */
function parseComposeServiceLine(line: string): ComposeService | null {
  if (!line.trim()) return null;

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

    return {
      name: svc.Name,
      status: svc.State,
      health: svc.Health,
      exitCode: svc.ExitCode,
      publishers: svc.Publishers?.map((p) => ({
        publishedPort: p.PublishedPort,
        targetPort: p.TargetPort,
        protocol: p.Protocol
      }))
    };
  } catch {
    return null;
  }
}

/**
 * Determine overall compose project status from services
 */
function determineProjectStatus(services: ComposeService[]): ComposeProject["status"] {
  if (services.length === 0) return "stopped";

  const running = services.filter((s) => s.status === "running").length;

  if (running === services.length) return "running";
  if (running > 0) return "partial";
  return "stopped";
}
```

### Step 2: Simplify getComposeStatus using helpers

Replace function body:

```typescript
export async function getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject> {
  validateHostForSsh(host);
  validateProjectName(project);

  const command = buildComposeCommand(project, "ps", ["--format", "json"]);

  try {
    const stdout = await executeSSHCommand(host, command, [], { timeoutMs: 15000 });

    const services: ComposeService[] = [];

    if (stdout.trim()) {
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const service = parseComposeServiceLine(line);
        if (service) {
          services.push(service);
        }
      }
    }

    return {
      name: project,
      status: determineProjectStatus(services),
      configFiles: [],
      services
    };
  } catch (error) {
    throw new Error(
      `Failed to get compose status: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
```

Now `getComposeStatus` is 33 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/services/compose.test.ts`
Expected: PASS

```bash
git add src/services/compose.ts
git commit -m "refactor: extract getComposeStatus parsing helpers (67→33 lines)"
```

---

## Task 7: Refactor formatInspectMarkdown (62 lines → <50)

**Files:**
- Modify: `src/formatters/index.ts:172-233`

**Pattern:** Multiple markdown sections (state, config, env, mounts, ports, networks).

### Step 1: Extract section builders

Add before `formatInspectMarkdown`:

```typescript
/**
 * Build environment variables section
 */
function buildEnvSection(env: string[] | undefined): string[] {
  if (!env || env.length === 0) return [];

  const lines = ["### Environment Variables"];
  for (const envVar of env.slice(0, 20)) {
    const [key] = envVar.split("=");
    const isSensitive = /password|secret|key|token|api/i.test(key);
    lines.push(`- ${isSensitive ? `${key}=****` : envVar}`);
  }
  if (env.length > 20) {
    lines.push(`- ... and ${env.length - 20} more`);
  }
  lines.push("");
  return lines;
}

/**
 * Build mounts section
 */
function buildMountsSection(mounts: Array<{ Source: string; Destination: string; Mode?: string }>): string[] {
  if (mounts.length === 0) return [];

  const lines = ["### Mounts"];
  for (const m of mounts) {
    lines.push(`- ${m.Source} → ${m.Destination} (${m.Mode || "rw"})`);
  }
  lines.push("");
  return lines;
}

/**
 * Build ports section
 */
function buildPortsSection(ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null> | undefined): string[] {
  if (!ports) return [];

  const lines = ["### Ports"];
  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (bindings && bindings.length > 0) {
      for (const b of bindings) {
        lines.push(`- ${b.HostIp || "0.0.0.0"}:${b.HostPort} → ${containerPort}`);
      }
    }
  }
  lines.push("");
  return lines;
}

/**
 * Build networks section
 */
function buildNetworksSection(networks: Record<string, unknown> | undefined): string[] {
  if (!networks || Object.keys(networks).length === 0) return [];

  const lines = ["### Networks"];
  for (const networkName of Object.keys(networks)) {
    lines.push(`- ${networkName}`);
  }
  return lines;
}
```

### Step 2: Simplify formatInspectMarkdown using helpers

Replace function body:

```typescript
export function formatInspectMarkdown(info: ContainerInspectInfo, host: string): string {
  const config = info.Config;
  const state = info.State;
  const mounts = info.Mounts || [];
  const network = info.NetworkSettings;

  const lines = [
    `## Container: ${info.Name.replace(/^\//, "")} (${host})`,
    "",
    "### State",
    `- Status: ${state.Status}`,
    `- Running: ${state.Running}`,
    `- Started: ${state.StartedAt}`,
    `- Restart Count: ${info.RestartCount}`,
    "",
    "### Configuration",
    `- Image: ${config.Image}`,
    `- Command: ${(config.Cmd || []).join(" ")}`,
    `- Working Dir: ${config.WorkingDir || "/"}`,
    ""
  ];

  lines.push(...buildEnvSection(config.Env));
  lines.push(...buildMountsSection(mounts));
  lines.push(...buildPortsSection(network.Ports));
  lines.push(...buildNetworksSection(network.Networks));

  return lines.join("\n");
}
```

Now `formatInspectMarkdown` is 28 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/formatters/formatters.test.ts`
Expected: PASS

```bash
git add src/formatters/index.ts
git commit -m "refactor: extract formatInspectMarkdown section builders (62→28 lines)"
```

---

## Task 8: Refactor listContainersOnHost (59 lines → <50)

**Files:**
- Modify: `src/services/docker.ts:213-271`

**Pattern:** Filtering logic mixed with container info building.

### Step 1: Extract filtering helper

Add before `listContainersOnHost`:

```typescript
/**
 * Check if container matches state filter
 */
function matchesStateFilter(
  containerState: string,
  stateFilter: "all" | "running" | "stopped" | "paused" | undefined
): boolean {
  if (!stateFilter || stateFilter === "all") return true;
  if (stateFilter === "stopped" && containerState !== "exited") return false;
  if (stateFilter === "paused" && containerState !== "paused") return false;
  if (stateFilter === "running" && containerState !== "running") return false;
  return true;
}

/**
 * Build ContainerInfo from Docker container
 */
function buildContainerInfo(c: Docker.ContainerInfo, hostName: string): ContainerInfo {
  const containerState = c.State?.toLowerCase() as ContainerInfo["state"];
  const name = c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12);

  return {
    id: c.Id,
    name,
    image: c.Image,
    state: containerState,
    status: c.Status,
    created: new Date(c.Created * 1000).toISOString(),
    ports: (c.Ports || []).map((p) => ({
      containerPort: p.PrivatePort,
      hostPort: p.PublicPort,
      protocol: p.Type as "tcp" | "udp",
      hostIp: p.IP
    })),
    labels: c.Labels || {},
    hostName
  };
}
```

### Step 2: Simplify listContainersOnHost using helpers

Replace function body:

```typescript
async function listContainersOnHost(
  host: HostConfig,
  options: ListContainersOptions
): Promise<ContainerInfo[]> {
  const docker = getDockerClient(host);
  const listOptions: Docker.ContainerListOptions = {
    all: options.state !== "running"
  };

  if (options.labelFilter) {
    listOptions.filters = { label: [options.labelFilter] };
  }

  const containers = await docker.listContainers(listOptions);
  const results: ContainerInfo[] = [];

  for (const c of containers) {
    const containerState = c.State?.toLowerCase() as ContainerInfo["state"];

    if (!matchesStateFilter(containerState, options.state)) continue;

    const info = buildContainerInfo(c, host.name);

    // Apply name and image filters
    if (options.nameFilter && !info.name.toLowerCase().includes(options.nameFilter.toLowerCase())) {
      continue;
    }
    if (options.imageFilter && !info.image.toLowerCase().includes(options.imageFilter.toLowerCase())) {
      continue;
    }

    results.push(info);
  }

  return results;
}
```

Now `listContainersOnHost` is 36 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

```bash
git add src/services/docker.ts
git commit -m "refactor: extract listContainersOnHost filtering helpers (59→36 lines)"
```

---

## Task 9: Refactor getContainerStats (53 lines → <50)

**Files:**
- Modify: `src/services/docker.ts:434-486`

**Pattern:** Repetitive calculation blocks for CPU, memory, network, block I/O.

### Step 1: Extract calculation helpers

Add before `getContainerStats`:

```typescript
/**
 * Calculate CPU percentage from stats
 */
function calculateCpuPercent(stats: Docker.ContainerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  return systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;
}

/**
 * Calculate network I/O from stats
 */
function calculateNetworkIO(stats: Docker.ContainerStats): { rx: number; tx: number } {
  let netRx = 0;
  let netTx = 0;

  if (stats.networks) {
    for (const net of Object.values(stats.networks)) {
      netRx += (net as { rx_bytes: number }).rx_bytes || 0;
      netTx += (net as { tx_bytes: number }).tx_bytes || 0;
    }
  }

  return { rx: netRx, tx: netTx };
}

/**
 * Calculate block I/O from stats
 */
function calculateBlockIO(stats: Docker.ContainerStats): { read: number; write: number } {
  let blockRead = 0;
  let blockWrite = 0;

  if (stats.blkio_stats?.io_service_bytes_recursive) {
    for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
      if (entry.op === "read") blockRead += entry.value;
      if (entry.op === "write") blockWrite += entry.value;
    }
  }

  return { read: blockRead, write: blockWrite };
}
```

### Step 2: Simplify getContainerStats using helpers

Replace function body:

```typescript
export async function getContainerStats(
  containerId: string,
  host: HostConfig
): Promise<ContainerStats> {
  const container = await getContainer(containerId, host);
  const stats = await container.stats({ stream: false });

  const cpuPercent = calculateCpuPercent(stats);
  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

  const { rx: netRx, tx: netTx } = calculateNetworkIO(stats);
  const { read: blockRead, write: blockWrite } = calculateBlockIO(stats);

  const info = await container.inspect();

  return {
    containerId,
    containerName: info.Name.replace(/^\//, ""),
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsage: memUsage,
    memoryLimit: memLimit,
    memoryPercent: Math.round(memPercent * 100) / 100,
    networkRx: netRx,
    networkTx: netTx,
    blockRead,
    blockWrite
  };
}
```

Now `getContainerStats` is 30 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

```bash
git add src/services/docker.ts
git commit -m "refactor: extract getContainerStats calculation helpers (53→30 lines)"
```

---

## Task 10: Refactor registerUnifiedTool (83 lines → <50)

**Files:**
- Modify: `src/tools/unified.ts:129-211`

**Pattern:** Large inline TOOL_DESCRIPTION string.

### Step 1: Extract tool description constant

Add at top of file after imports:

```typescript
/**
 * Tool description for unified homelab tool
 */
const UNIFIED_TOOL_DESCRIPTION = `Unified homelab Docker management tool.

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

  docker <subaction>     - Docker daemon operations (host parameter required)
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
  { action: "docker", subaction: "info", host: "tootie" }
  { action: "docker", subaction: "df", host: "tootie" }
  { action: "docker", subaction: "prune", host: "tootie", prune_target: "images", force: true }
  { action: "image", subaction: "pull", host: "tootie", image: "nginx:latest" }`;
```

### Step 2: Simplify registerUnifiedTool using constant

Replace function body:

```typescript
export function registerUnifiedTool(server: McpServer): void {
  const hosts = loadHostConfigs();

  server.registerTool(
    "homelab",
    {
      title: "Homelab Manager",
      description: UNIFIED_TOOL_DESCRIPTION,
      inputSchema: UnifiedHomelabSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      try {
        const validated = UnifiedHomelabSchema.parse(params);
        return await routeAction(validated, hosts);
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
    }
  );
}
```

Now `registerUnifiedTool` is 33 lines.

### Step 3: Run tests and commit

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

```bash
git add src/tools/unified.ts
git commit -m "refactor: extract registerUnifiedTool description constant (83→33 lines)"
```

---

## Task 11: Final Verification

### Step 1: Run full test suite

Run: `pnpm test`
Expected: All tests PASS

### Step 2: Run type checker

Run: `pnpm run typecheck`
Expected: No type errors

### Step 3: Run linter

Run: `pnpm run lint`
Expected: No lint errors

### Step 4: Verify line counts

```bash
# Count lines in refactored functions
grep -n "^export.*function\|^async function\|^function" src/tools/unified.ts
grep -n "^export.*function\|^async function\|^function" src/services/docker.ts
grep -n "^export.*function\|^async function\|^function" src/services/compose.ts
grep -n "^export.*function\|^async function\|^function" src/formatters/index.ts
```

Expected: All main handler functions under 50 lines

### Step 5: Final commit

```bash
git add .
git commit -m "refactor: all functions now under 50-line limit

- Extracted 40+ helper functions
- Reduced handleContainerAction from 238→24 lines
- Reduced handleComposeAction from 154→28 lines
- Improved modularity and maintainability
- Followed DRY, YAGNI, KISS principles
- All tests passing"
```

---

## Summary

**Refactored Functions:**

1. handleContainerAction: 238 → 24 lines (extracted 8 handlers)
2. handleComposeAction: 154 → 28 lines (extracted 9 handlers)
3. handleDockerAction: 89 → 20 lines (extracted 3 handlers)
4. handleImageAction: 78 → 22 lines (extracted 4 handlers)
5. handleHostAction: 65 → 18 lines (extracted 2 handlers)
6. getDockerDiskUsage: 82 → 18 lines (extracted 4 calculators)
7. pruneDocker: 81 → 28 lines (extracted 5 pruners)
8. registerUnifiedTool: 83 → 33 lines (extracted constant)
9. getComposeStatus: 67 → 33 lines (extracted 2 parsers)
10. formatInspectMarkdown: 62 → 28 lines (extracted 4 builders)
11. listContainersOnHost: 59 → 36 lines (extracted 2 filters)
12. getContainerStats: 53 → 30 lines (extracted 3 calculators)

**Total Functions Created:** 44 new helper functions
**Total Lines Reduced:** ~550 lines of complexity removed from large functions
**Principles Applied:** DRY, YAGNI, KISS, Single Responsibility

All functions now adhere to the 50-line limit while maintaining full functionality and test coverage.
