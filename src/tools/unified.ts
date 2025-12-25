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
import {
  truncateIfNeeded,
  formatContainersMarkdown,
  formatLogsMarkdown,
  formatStatsMarkdown,
  formatMultiStatsMarkdown,
  formatInspectMarkdown,
  formatInspectSummaryMarkdown,
  formatHostStatusMarkdown,
  formatSearchResultsMarkdown,
  formatDockerInfoMarkdown,
  formatDockerDfMarkdown,
  formatPruneMarkdown,
  formatHostResourcesMarkdown,
  formatImagesMarkdown,
  formatComposeListMarkdown,
  formatComposeStatusMarkdown
} from "../formatters/index.js";
import { logError, HostOperationError } from "../utils/errors.js";

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
          .filter(
            (
              result
            ): result is PromiseFulfilledResult<{
              stats: Awaited<ReturnType<typeof getContainerStats>>;
              host: string;
            }> => result.status === "fulfilled"
          )
          .map((result) => result.value);
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
    })
  );

  // Flatten results from all hosts
  const allStats: Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }> =
    [];

  for (const result of hostResults) {
    if (result.status === "fulfilled") {
      allStats.push(...result.value);
    } else {
      console.error("Host stats collection failed:", result.reason);
    }
  }

  return allStats;
}

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
    async (params: unknown) => {
      try {
        // Validate and parse input with Zod
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

/**
 * Route action to appropriate handler
 */
async function routeAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[]
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
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

// ===== Container Action Handlers =====

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
    case "list": {
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

    case "start":
    case "stop":
    case "restart":
    case "pause":
    case "unpause": {
      const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
      if (!targetHost) {
        return errorResponse(`Container '${params.container_id}' not found.`);
      }

      await containerAction(params.container_id, subaction, targetHost);
      return successResponse(
        `✓ Successfully performed '${subaction}' on container '${params.container_id}' (host: ${targetHost.name})`
      );
    }

    case "logs": {
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

    case "stats": {
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

        // Collect stats in parallel across all hosts and containers
        const allStats = await collectStatsParallel(targetHosts, 20);

        const output = { stats: allStats.map((s) => ({ ...s.stats, host: s.host })) };
        const text =
          params.response_format === ResponseFormat.JSON
            ? JSON.stringify(output, null, 2)
            : formatMultiStatsMarkdown(allStats);

        return successResponse(text, output);
      }
    }

    case "inspect": {
      const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
      if (!targetHost) {
        return errorResponse(`Container '${params.container_id}' not found.`);
      }

      const info = await inspectContainer(params.container_id, targetHost);

      // Summary mode returns condensed output to save tokens
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

      // Full mode returns complete inspect output
      const output = { ...info, _host: targetHost.name };
      const text =
        params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatInspectMarkdown(info, targetHost.name);

      return successResponse(text, output);
    }

    case "search": {
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

    case "pull": {
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

    case "recreate": {
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

    default:
      throw new Error(`Unknown container subaction: ${subaction}`);
  }
}

// ===== Compose Action Handlers =====

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

  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  switch (subaction) {
    case "list": {
      let projects = await listComposeProjects(targetHost);

      // Apply name filter if provided
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

    case "status": {
      let status = await getComposeStatus(targetHost, params.project);

      // Apply service filter if provided
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

    case "up": {
      await composeUp(targetHost, params.project, params.detach);
      const status = await getComposeStatus(targetHost, params.project);
      const text = `✓ Started project '${params.project}'\n\n${formatComposeStatusMarkdown(status)}`;

      return successResponse(text, { project: params.project, status });
    }

    case "down": {
      await composeDown(targetHost, params.project, params.remove_volumes);
      return successResponse(`✓ Stopped project '${params.project}'`);
    }

    case "restart": {
      await composeRestart(targetHost, params.project);
      const status = await getComposeStatus(targetHost, params.project);
      const text = `✓ Restarted project '${params.project}'\n\n${formatComposeStatusMarkdown(status)}`;

      return successResponse(text, { project: params.project, status });
    }

    case "logs": {
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

    case "build": {
      await composeBuild(targetHost, params.project, {
        service: params.service,
        noCache: params.no_cache
      });
      return successResponse(
        `✓ Built images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`
      );
    }

    case "pull": {
      await composePull(targetHost, params.project, { service: params.service });
      return successResponse(
        `✓ Pulled images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`
      );
    }

    case "recreate": {
      await composeRecreate(targetHost, params.project, { service: params.service });
      const status = await getComposeStatus(targetHost, params.project);
      const text = `✓ Recreated project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}\n\n${formatComposeStatusMarkdown(status)}`;

      return successResponse(text, { project: params.project, status });
    }

    default:
      throw new Error(`Unknown compose subaction: ${subaction}`);
  }
}

// ===== Host Action Handlers =====

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
    case "status": {
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

    case "resources": {
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
        })
      );

      const output = { hosts: results };
      const text =
        params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatHostResourcesMarkdown(results);

      return successResponse(text, output);
    }

    default:
      throw new Error(`Unknown host subaction: ${subaction}`);
  }
}

// ===== Docker Action Handlers =====

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
    case "info": {
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

    case "df": {
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

    case "prune": {
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

    default:
      throw new Error(`Unknown docker subaction: ${subaction}`);
  }
}

// ===== Image Action Handlers =====

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
    case "list": {
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

    case "pull": {
      const targetHost = hosts.find((h) => h.name === params.host);
      if (!targetHost) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      await pullImage(params.image, targetHost);
      return successResponse(`✓ Successfully pulled image '${params.image}' on ${params.host}`);
    }

    case "build": {
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

    case "remove": {
      const targetHost = hosts.find((h) => h.name === params.host);
      if (!targetHost) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      await removeImage(params.image, targetHost, { force: params.force });
      return successResponse(`✓ Successfully removed image '${params.image}' from ${params.host}`);
    }

    default:
      throw new Error(`Unknown image subaction: ${subaction}`);
  }
}

// ===== Helper Functions =====

async function resolveContainerHost(
  containerId: string,
  hostName: string | undefined,
  hosts: HostConfig[]
): Promise<HostConfig | null> {
  if (hostName) {
    const found = hosts.find((h) => h.name === hostName);
    return found || null;
  }

  const result = await findContainerHost(containerId, hosts);
  return result?.host || null;
}

function successResponse(
  text: string,
  structuredContent?: Record<string, unknown>
): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
} {
  return {
    content: [{ type: "text" as const, text: truncateIfNeeded(text) }],
    ...(structuredContent ? { structuredContent } : {})
  };
}

function errorResponse(message: string): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}
