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
  composeRecreate,
  type ComposeProject
} from "../services/compose.js";
import { ResponseFormat, HostConfig, ContainerInfo, ImageInfo } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

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
            type: "text" as const,
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

// ===== Container Action Handlers =====

async function handleContainerAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
  if (params.action !== "container") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "list": {
      const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
      if (params.host && targetHosts.length === 0) {
        return errorResponse(`Host '${params.host}' not found. Available: ${hosts.map((h) => h.name).join(", ")}`);
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

      const output = { total, count: paginated.length, offset: params.offset, containers: paginated, has_more: hasMore };
      const text = params.response_format === ResponseFormat.JSON
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
      return successResponse(`✓ Successfully performed '${subaction}' on container '${params.container_id}' (host: ${targetHost.name})`);
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

      const output = { container: params.container_id, host: targetHost.name, count: logs.length, logs };
      const text = params.response_format === ResponseFormat.JSON
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
        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatStatsMarkdown([stats], targetHost.name);

        return successResponse(text, output);
      } else {
        const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
        const allStats: Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }> = [];

        for (const host of targetHosts) {
          try {
            const containers = await listContainers([host], { state: "running" });
            for (const c of containers.slice(0, 20)) {
              try {
                const stats = await getContainerStats(c.id, host);
                allStats.push({ stats, host: host.name });
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }

        const output = { stats: allStats.map((s) => ({ ...s.stats, host: s.host })) };
        const text = params.response_format === ResponseFormat.JSON
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
      const output = { ...info, _host: targetHost.name };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatInspectMarkdown(info, targetHost.name);

      return successResponse(text, output);
    }

    case "search": {
      const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
      const allContainers = await listContainers(targetHosts, {});
      const query = params.query.toLowerCase();

      const matches = allContainers.filter((c) => {
        const searchText = [c.name, c.image, ...Object.keys(c.labels), ...Object.values(c.labels)].join(" ").toLowerCase();
        return searchText.includes(query);
      });

      const total = matches.length;
      const paginated = matches.slice(params.offset, params.offset + params.limit);
      const hasMore = total > params.offset + params.limit;

      const output = { query: params.query, total, count: paginated.length, containers: paginated, has_more: hasMore };
      const text = params.response_format === ResponseFormat.JSON
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

      return successResponse(`✓ Successfully pulled latest image '${imageName}' for container '${params.container_id}'`);
    }

    case "recreate": {
      const targetHost = await resolveContainerHost(params.container_id, params.host, hosts);
      if (!targetHost) {
        return errorResponse(`Container '${params.container_id}' not found.`);
      }

      const result = await recreateContainer(params.container_id, targetHost, { pull: params.pull });
      return successResponse(`✓ ${result.status}. New container ID: ${result.containerId.slice(0, 12)}`);
    }

    default:
      throw new Error(`Unknown container subaction: ${subaction}`);
  }
}

// ===== Compose Action Handlers =====

async function handleComposeAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
  if (params.action !== "compose") throw new Error("Invalid action");
  const { subaction } = params;

  const targetHost = hosts.find((h) => h.name === params.host);
  if (!targetHost) {
    return errorResponse(`Host '${params.host}' not found.`);
  }

  switch (subaction) {
    case "list": {
      const projects = await listComposeProjects(targetHost);
      const output = { host: params.host, projects };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatComposeListMarkdown(projects, params.host);

      return successResponse(text, output);
    }

    case "status": {
      const status = await getComposeStatus(targetHost, params.project);
      const output = { project: params.project, host: params.host, status };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatComposeStatusMarkdown(status);

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
        lines: params.lines,
        service: params.service
      });

      const title = params.service
        ? `## Logs: ${params.project}/${params.service}`
        : `## Logs: ${params.project}`;

      const output = { project: params.project, host: params.host, service: params.service || "all", logs };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : `${title}\n\n\`\`\`\n${logs}\n\`\`\``;

      return successResponse(text, output);
    }

    case "build": {
      await composeBuild(targetHost, params.project, {
        service: params.service,
        noCache: params.no_cache
      });
      return successResponse(`✓ Built images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`);
    }

    case "pull": {
      await composePull(targetHost, params.project, { service: params.service });
      return successResponse(`✓ Pulled images for project '${params.project}'${params.service ? ` (service: ${params.service})` : ""}`);
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

async function handleHostAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
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
      const text = params.response_format === ResponseFormat.JSON
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
            return { host: host.name, resources: null, error: error instanceof Error ? error.message : "SSH failed" };
          }
        })
      );

      const output = { hosts: results };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatHostResourcesMarkdown(results);

      return successResponse(text, output);
    }

    default:
      throw new Error(`Unknown host subaction: ${subaction}`);
  }
}

// ===== Docker Action Handlers =====

async function handleDockerAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
  if (params.action !== "docker") throw new Error("Invalid action");
  const { subaction } = params;

  switch (subaction) {
    case "info": {
      const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
      if (params.host && targetHosts.length === 0) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const results = await Promise.all(
        targetHosts.map(async (host) => {
          try {
            const info = await getDockerInfo(host);
            return { host: host.name, info };
          } catch (error) {
            return {
              host: host.name,
              info: {
                dockerVersion: "error",
                apiVersion: "error",
                os: error instanceof Error ? error.message : "Connection failed",
                arch: "", kernelVersion: "", cpus: 0, memoryBytes: 0, storageDriver: "", rootDir: "",
                containersTotal: 0, containersRunning: 0, containersPaused: 0, containersStopped: 0, images: 0
              }
            };
          }
        })
      );

      const output = { hosts: results };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatDockerInfoMarkdown(results);

      return successResponse(text, output);
    }

    case "df": {
      const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
      if (params.host && targetHosts.length === 0) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const settled = await Promise.allSettled(
        targetHosts.map(async (host) => {
          const usage = await getDockerDiskUsage(host);
          return { host: host.name, usage };
        })
      );

      const results = settled
        .filter((r): r is PromiseFulfilledResult<{ host: string; usage: Awaited<ReturnType<typeof getDockerDiskUsage>> }> =>
          r.status === "fulfilled"
        )
        .map((r) => r.value);

      const output = { hosts: results };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatDockerDfMarkdown(results);

      return successResponse(text, output);
    }

    case "prune": {
      if (!params.force) {
        return errorResponse("⚠️ This is a destructive operation. Set force=true to confirm.");
      }

      const targetHosts = params.host ? hosts.filter((h) => h.name === params.host) : hosts;
      if (params.host && targetHosts.length === 0) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const allResults: Array<{ host: string; results: Awaited<ReturnType<typeof pruneDocker>> }> = [];

      for (const host of targetHosts) {
        try {
          const results = await pruneDocker(host, params.prune_target);
          allResults.push({ host: host.name, results });
        } catch (error) {
          allResults.push({
            host: host.name,
            results: [{
              type: params.prune_target,
              spaceReclaimed: 0,
              itemsDeleted: 0,
              details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
            }]
          });
        }
      }

      const output = { hosts: allResults };
      const text = formatPruneMarkdown(allResults);

      return successResponse(text, output);
    }

    default:
      throw new Error(`Unknown docker subaction: ${subaction}`);
  }
}

// ===== Image Action Handlers =====

async function handleImageAction(params: UnifiedHomelabInput, hosts: HostConfig[]) {
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

      const text = params.response_format === ResponseFormat.JSON
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

function successResponse(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: truncateIfNeeded(text) }],
    ...(structuredContent ? { structuredContent } : {})
  };
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

function truncateIfNeeded(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT - 100) + "\n\n... [Output truncated. Use pagination or filters to reduce results.]";
}

// ===== Formatting Functions =====

function formatContainersMarkdown(containers: ContainerInfo[], total: number, offset: number, hasMore: boolean): string {
  if (containers.length === 0) {
    return "No containers found matching the specified criteria.";
  }

  const lines = [`## Containers (${offset + 1}-${offset + containers.length} of ${total})`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    const ports = c.ports.filter((p) => p.hostPort).map((p) => `${p.hostPort}→${p.containerPort}`).join(", ");

    lines.push(`${stateEmoji} **${c.name}** (${c.hostName})`);
    lines.push(`   Image: ${c.image} | Status: ${c.status}`);
    if (ports) lines.push(`   Ports: ${ports}`);
    lines.push("");
  }

  if (hasMore) {
    lines.push(`*More results available. Use offset=${offset + containers.length} to see next page.*`);
  }

  return lines.join("\n");
}

function formatLogsMarkdown(logs: Array<{ timestamp: string; message: string }>, container: string, host: string): string {
  if (logs.length === 0) {
    return `No logs found for container '${container}' on ${host}.`;
  }

  const lines = [`## Logs: ${container} (${host})`, "", "```"];
  for (const log of logs) {
    const ts = log.timestamp.slice(11, 19);
    lines.push(`[${ts}] ${log.message}`);
  }
  lines.push("```");

  return lines.join("\n");
}

function formatStatsMarkdown(stats: Array<Awaited<ReturnType<typeof getContainerStats>>>, host: string): string {
  const s = stats[0];
  return `## Stats: ${s.containerName} (${host})

| Metric | Value |
|--------|-------|
| CPU | ${s.cpuPercent.toFixed(1)}% |
| Memory | ${formatBytes(s.memoryUsage)} / ${formatBytes(s.memoryLimit)} (${s.memoryPercent.toFixed(1)}%) |
| Network RX | ${formatBytes(s.networkRx)} |
| Network TX | ${formatBytes(s.networkTx)} |
| Block Read | ${formatBytes(s.blockRead)} |
| Block Write | ${formatBytes(s.blockWrite)} |`;
}

function formatMultiStatsMarkdown(allStats: Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }>): string {
  if (allStats.length === 0) return "No running containers found.";

  const lines = ["## Container Resource Usage", "", "| Container | Host | CPU% | Memory | Mem% |", "|-----------|------|------|--------|------|"];

  for (const { stats, host } of allStats) {
    lines.push(`| ${stats.containerName} | ${host} | ${stats.cpuPercent.toFixed(1)}% | ${formatBytes(stats.memoryUsage)} | ${stats.memoryPercent.toFixed(1)}% |`);
  }

  return lines.join("\n");
}

function formatInspectMarkdown(info: Awaited<ReturnType<typeof inspectContainer>>, host: string): string {
  const config = info.Config;
  const state = info.State;
  const mounts = info.Mounts || [];
  const network = info.NetworkSettings;

  const lines = [
    `## Container: ${info.Name.replace(/^\//, "")} (${host})`, "",
    "### State",
    `- Status: ${state.Status}`,
    `- Running: ${state.Running}`,
    `- Started: ${state.StartedAt}`,
    `- Restart Count: ${info.RestartCount}`, "",
    "### Configuration",
    `- Image: ${config.Image}`,
    `- Command: ${(config.Cmd || []).join(" ")}`,
    `- Working Dir: ${config.WorkingDir || "/"}`, ""
  ];

  if (config.Env && config.Env.length > 0) {
    lines.push("### Environment Variables");
    for (const env of config.Env.slice(0, 20)) {
      const [key] = env.split("=");
      const isSensitive = /password|secret|key|token|api/i.test(key);
      lines.push(`- ${isSensitive ? `${key}=****` : env}`);
    }
    if (config.Env.length > 20) lines.push(`- ... and ${config.Env.length - 20} more`);
    lines.push("");
  }

  if (mounts.length > 0) {
    lines.push("### Mounts");
    for (const m of mounts) {
      lines.push(`- ${m.Source} → ${m.Destination} (${m.Mode || "rw"})`);
    }
    lines.push("");
  }

  if (network.Ports) {
    lines.push("### Ports");
    for (const [containerPort, bindings] of Object.entries(network.Ports)) {
      if (bindings && bindings.length > 0) {
        for (const b of bindings) {
          lines.push(`- ${b.HostIp || "0.0.0.0"}:${b.HostPort} → ${containerPort}`);
        }
      }
    }
  }

  return lines.join("\n");
}

function formatHostStatusMarkdown(status: Array<Awaited<ReturnType<typeof getHostStatus>>[0]>): string {
  const lines = ["## Homelab Host Status", "", "| Host | Status | Containers | Running |", "|------|--------|------------|---------|"];

  for (const h of status) {
    const statusEmoji = h.connected ? "🟢" : "🔴";
    const statusText = h.connected ? "Online" : `Offline (${h.error || "Unknown"})`;
    lines.push(`| ${h.name} | ${statusEmoji} ${statusText} | ${h.containerCount} | ${h.runningCount} |`);
  }

  return lines.join("\n");
}

function formatSearchResultsMarkdown(containers: ContainerInfo[], query: string, total: number): string {
  if (containers.length === 0) return `No containers found matching '${query}'.`;

  const lines = [`## Search Results for '${query}' (${total} matches)`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    lines.push(`${stateEmoji} **${c.name}** (${c.hostName})`);
    lines.push(`   Image: ${c.image} | State: ${c.state}`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatDockerInfoMarkdown(results: Array<{ host: string; info: Awaited<ReturnType<typeof getDockerInfo>> }>): string {
  const lines = ["## Docker System Info", ""];

  for (const { host, info } of results) {
    lines.push(`### ${host}`);
    if (info.dockerVersion === "error") {
      lines.push(`❌ Error: ${info.os}`);
    } else {
      lines.push(`- Docker: ${info.dockerVersion} (API ${info.apiVersion})`);
      lines.push(`- OS: ${info.os} (${info.arch})`);
      lines.push(`- Kernel: ${info.kernelVersion}`);
      lines.push(`- CPUs: ${info.cpus} | Memory: ${formatBytes(info.memoryBytes)}`);
      lines.push(`- Storage: ${info.storageDriver} @ ${info.rootDir}`);
      lines.push(`- Containers: ${info.containersRunning} running / ${info.containersTotal} total`);
      lines.push(`- Images: ${info.images}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatDockerDfMarkdown(results: Array<{ host: string; usage: Awaited<ReturnType<typeof getDockerDiskUsage>> }>): string {
  const lines = ["## Docker Disk Usage", ""];

  for (const { host, usage } of results) {
    lines.push(`### ${host}`, "", "| Type | Count | Size | Reclaimable |", "|------|-------|------|-------------|");
    lines.push(`| Images | ${usage.images.total} (${usage.images.active} active) | ${formatBytes(usage.images.size)} | ${formatBytes(usage.images.reclaimable)} |`);
    lines.push(`| Containers | ${usage.containers.total} (${usage.containers.running} running) | ${formatBytes(usage.containers.size)} | ${formatBytes(usage.containers.reclaimable)} |`);
    lines.push(`| Volumes | ${usage.volumes.total} (${usage.volumes.active} active) | ${formatBytes(usage.volumes.size)} | ${formatBytes(usage.volumes.reclaimable)} |`);
    lines.push(`| Build Cache | ${usage.buildCache.total} | ${formatBytes(usage.buildCache.size)} | ${formatBytes(usage.buildCache.reclaimable)} |`);
    lines.push(`| **Total** | | **${formatBytes(usage.totalSize)}** | **${formatBytes(usage.totalReclaimable)}** |`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatPruneMarkdown(allResults: Array<{ host: string; results: Array<{ type: string; spaceReclaimed: number; itemsDeleted: number }> }>): string {
  const lines = ["## Prune Results", ""];

  let totalReclaimed = 0;
  let totalDeleted = 0;

  for (const { host, results } of allResults) {
    lines.push(`### ${host}`, "", "| Type | Items Deleted | Space Reclaimed |", "|------|---------------|-----------------|");

    for (const r of results) {
      lines.push(`| ${r.type} | ${r.itemsDeleted} | ${formatBytes(r.spaceReclaimed)} |`);
      totalReclaimed += r.spaceReclaimed;
      totalDeleted += r.itemsDeleted;
    }
    lines.push("");
  }

  lines.push(`**Total: ${totalDeleted} items deleted, ${formatBytes(totalReclaimed)} reclaimed**`);

  return lines.join("\n");
}

function formatHostResourcesMarkdown(results: Array<{ host: string; resources: Awaited<ReturnType<typeof getHostResources>> | null; error?: string }>): string {
  const lines = ["## Host Resources", ""];

  for (const { host, resources, error } of results) {
    lines.push(`### ${host}`);

    if (error || !resources) {
      lines.push(`❌ ${error || "Unknown error"}`);
      lines.push("");
      continue;
    }

    lines.push(`- **Hostname:** ${resources.hostname}`);
    lines.push(`- **Uptime:** ${resources.uptime}`);
    lines.push(`- **Load:** ${resources.loadAverage.join(", ")}`);
    lines.push(`- **CPU:** ${resources.cpu.cores} cores @ ${resources.cpu.usagePercent}%`);
    lines.push(`- **Memory:** ${resources.memory.usedMB} MB / ${resources.memory.totalMB} MB (${resources.memory.usagePercent}%)`);

    if (resources.disk.length > 0) {
      lines.push("", "**Disks:**");
      for (const d of resources.disk) {
        lines.push(`- ${d.mount}: ${d.usedGB}G / ${d.totalGB}G (${d.usagePercent}%)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatImagesMarkdown(images: ImageInfo[], total: number, offset: number): string {
  if (images.length === 0) return "No images found.";

  const lines = ["## Docker Images", "", `Showing ${images.length} of ${total} images (offset: ${offset})`, "", "| ID | Tags | Size | Host | Containers |", "|-----|------|------|------|------------|"];

  for (const img of images) {
    const tags = img.tags.slice(0, 2).join(", ") + (img.tags.length > 2 ? "..." : "");
    lines.push(`| ${img.id} | ${tags} | ${formatBytes(img.size)} | ${img.hostName} | ${img.containers} |`);
  }

  return lines.join("\n");
}

function formatComposeListMarkdown(projects: ComposeProject[], host: string): string {
  if (projects.length === 0) return `No compose projects found on ${host}.`;

  const lines = [`## Compose Projects on ${host}`, "", "| Project | Status | Services |", "|---------|--------|----------|"];

  for (const p of projects) {
    const statusEmoji = p.status === "running" ? "🟢" : p.status === "partial" ? "🟡" : "🔴";
    lines.push(`| ${p.name} | ${statusEmoji} ${p.status} | ${p.services.length || "-"} |`);
  }

  return lines.join("\n");
}

function formatComposeStatusMarkdown(project: ComposeProject): string {
  const statusEmoji = project.status === "running" ? "🟢" : project.status === "partial" ? "🟡" : "🔴";

  const lines = [`## ${project.name} (${statusEmoji} ${project.status})`, ""];

  if (project.services.length === 0) {
    lines.push("No services running.");
  } else {
    lines.push("| Service | Status | Health | Ports |", "|---------|--------|--------|-------|");

    for (const svc of project.services) {
      const health = svc.health || "-";
      const ports = svc.publishers?.map((p) => `${p.publishedPort}→${p.targetPort}`).join(", ") || "-";
      const svcEmoji = svc.status === "running" ? "🟢" : "🔴";
      lines.push(`| ${svc.name} | ${svcEmoji} ${svc.status} | ${health} | ${ports} |`);
    }
  }

  return lines.join("\n");
}
