import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListContainersSchema,
  ContainerActionSchema,
  GetLogsSchema,
  ContainerStatsSchema,
  InspectContainerSchema,
  HostStatusSchema,
  SearchContainersSchema,
  DockerInfoSchema,
  DockerDiskUsageSchema,
  HostResourcesSchema,
  PruneSchema,
  type ListContainersInput,
  type ContainerActionInput,
  type GetLogsInput,
  type ContainerStatsInput,
  type InspectContainerInput,
  type HostStatusInput,
  type SearchContainersInput,
  type DockerInfoInput,
  type DockerDiskUsageInput,
  type HostResourcesInput,
  type PruneInput
} from "../schemas/index.js";
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
  formatUptime,
  getDockerInfo,
  getDockerDiskUsage,
  pruneDocker
} from "../services/docker.js";
import { getHostResources } from "../services/ssh.js";
import { ResponseFormat, HostConfig, ContainerInfo } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

/**
 * Register all homelab tools with the MCP server
 */
export function registerTools(server: McpServer): void {
  const hosts = loadHostConfigs();

  // ===== homelab_list_containers =====
  server.registerTool(
    "homelab_list_containers",
    {
      title: "List Homelab Containers",
      description: `List Docker containers across your homelab hosts with filtering options.

Retrieves containers from all configured hosts (or a specific host) with optional filtering by state, name, image, or labels.

Args:
  - host (string, optional): Filter by specific host name
  - state ('all' | 'running' | 'stopped' | 'paused'): Filter by container state (default: 'all')
  - name_filter (string, optional): Filter containers by name (partial match)
  - image_filter (string, optional): Filter by image name (partial match)
  - label_filter (string, optional): Filter by label (format: 'key=value' or just 'key')
  - limit (number): Max results (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of containers with id, name, image, state, status, ports, labels, and host.

Examples:
  - "List all running containers" -> { state: "running" }
  - "Show containers on unraid" -> { host: "unraid" }
  - "Find nginx containers" -> { name_filter: "nginx" }
  - "List stopped media containers" -> { state: "stopped", label_filter: "category=media" }`,
      inputSchema: ListContainersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListContainersInput) => {
      try {
        const targetHosts = params.host 
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found. Available hosts: ${hosts.map(h => h.name).join(", ")}`
            }]
          };
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
          has_more: hasMore,
          ...(hasMore ? { next_offset: params.offset + params.limit } : {})
        };

        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatContainersMarkdown(paginated, total, params.offset, hasMore);

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error listing containers: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_container_action =====
  server.registerTool(
    "homelab_container_action",
    {
      title: "Container Action",
      description: `Perform an action on a Docker container (start, stop, restart, pause, unpause).

Args:
  - container_id (string): Container ID or name
  - host (string, optional): Host where container is running (auto-detected if omitted)
  - action ('start' | 'stop' | 'restart' | 'pause' | 'unpause'): Action to perform

Returns:
  Success message or error details.

Examples:
  - "Restart nginx" -> { container_id: "nginx", action: "restart" }
  - "Stop plex on unraid" -> { container_id: "plex", host: "unraid", action: "stop" }`,
      inputSchema: ContainerActionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: ContainerActionInput) => {
      try {
        let targetHost: HostConfig;

        if (params.host) {
          const found = hosts.find(h => h.name === params.host);
          if (!found) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Host '${params.host}' not found. Available hosts: ${hosts.map(h => h.name).join(", ")}`
              }]
            };
          }
          targetHost = found;
        } else {
          const result = await findContainerHost(params.container_id, hosts);
          if (!result) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Container '${params.container_id}' not found on any host. Use homelab_list_containers to see available containers.`
              }]
            };
          }
          targetHost = result.host;
        }

        await containerAction(params.container_id, params.action, targetHost);

        return {
          content: [{
            type: "text",
            text: `✓ Successfully performed '${params.action}' on container '${params.container_id}' (host: ${targetHost.name})`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error performing ${params.action}: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_get_logs =====
  server.registerTool(
    "homelab_get_logs",
    {
      title: "Get Container Logs",
      description: `Retrieve logs from a Docker container with filtering options.

Args:
  - container_id (string): Container ID or name
  - host (string, optional): Host where container is running (auto-detected if omitted)
  - lines (number): Number of log lines to retrieve (default: 100, max: 1000)
  - since (string, optional): Show logs since timestamp (e.g., '2024-01-01T00:00:00Z' or '1h' for relative)
  - until (string, optional): Show logs until timestamp
  - grep (string, optional): Filter logs containing this string (case-insensitive)
  - stream ('all' | 'stdout' | 'stderr'): Which output stream (default: 'all')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Log entries with timestamps and stream info.

Examples:
  - "Show last 50 lines from nginx" -> { container_id: "nginx", lines: 50 }
  - "Get errors from plex in last hour" -> { container_id: "plex", since: "1h", grep: "error" }`,
      inputSchema: GetLogsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetLogsInput) => {
      try {
        let targetHost: HostConfig;

        if (params.host) {
          const found = hosts.find(h => h.name === params.host);
          if (!found) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Host '${params.host}' not found.`
              }]
            };
          }
          targetHost = found;
        } else {
          const result = await findContainerHost(params.container_id, hosts);
          if (!result) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Container '${params.container_id}' not found.`
              }]
            };
          }
          targetHost = result.host;
        }

        let logs = await getContainerLogs(params.container_id, targetHost, {
          lines: params.lines,
          since: params.since,
          until: params.until,
          stream: params.stream
        });

        // Apply grep filter if specified
        if (params.grep) {
          const grepLower = params.grep.toLowerCase();
          logs = logs.filter(l => l.message.toLowerCase().includes(grepLower));
        }

        const output = {
          container: params.container_id,
          host: targetHost.name,
          count: logs.length,
          logs
        };

        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatLogsMarkdown(logs, params.container_id, targetHost.name);

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting logs: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_container_stats =====
  server.registerTool(
    "homelab_container_stats",
    {
      title: "Container Stats",
      description: `Get resource usage statistics for containers (CPU, memory, network, I/O).

Args:
  - container_id (string, optional): Container ID or name (omit for all running containers)
  - host (string, optional): Host to get stats from
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Stats including CPU%, memory usage/limit/%, network RX/TX, block I/O.

Examples:
  - "Get stats for plex" -> { container_id: "plex" }
  - "Show all container stats on unraid" -> { host: "unraid" }`,
      inputSchema: ContainerStatsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: ContainerStatsInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.container_id) {
          // Single container stats
          let targetHost: HostConfig;
          if (params.host) {
            targetHost = targetHosts[0];
          } else {
            const result = await findContainerHost(params.container_id, hosts);
            if (!result) {
              return {
                isError: true,
                content: [{
                  type: "text",
                  text: `Error: Container '${params.container_id}' not found.`
                }]
              };
            }
            targetHost = result.host;
          }

          const stats = await getContainerStats(params.container_id, targetHost);
          const output = { ...stats, host: targetHost.name };

          const text = params.response_format === ResponseFormat.JSON
            ? JSON.stringify(output, null, 2)
            : formatStatsMarkdown([stats], targetHost.name);

          return {
            content: [{ type: "text", text }],
            structuredContent: output
          };
        } else {
          // All running containers stats
          const allStats: Array<{ stats: Awaited<ReturnType<typeof getContainerStats>>; host: string }> = [];

          for (const host of targetHosts) {
            try {
              const containers = await listContainers([host], { state: "running" });
              for (const c of containers.slice(0, 20)) { // Limit to avoid timeout
                try {
                  const stats = await getContainerStats(c.id, host);
                  allStats.push({ stats, host: host.name });
                } catch {
                  // Skip containers that fail
                }
              }
            } catch {
              // Skip unreachable hosts
            }
          }

          const output = { stats: allStats.map(s => ({ ...s.stats, host: s.host })) };
          const text = params.response_format === ResponseFormat.JSON
            ? JSON.stringify(output, null, 2)
            : formatMultiStatsMarkdown(allStats);

          return {
            content: [{ type: "text", text: truncateIfNeeded(text) }],
            structuredContent: output
          };
        }
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting stats: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_inspect_container =====
  server.registerTool(
    "homelab_inspect_container",
    {
      title: "Inspect Container",
      description: `Get detailed configuration and state information for a container.

Args:
  - container_id (string): Container ID or name
  - host (string, optional): Host where container is running (auto-detected if omitted)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Detailed container info including config, network settings, mounts, env vars, etc.

Examples:
  - "Inspect plex container" -> { container_id: "plex" }
  - "Get nginx config on proxmox" -> { container_id: "nginx", host: "proxmox" }`,
      inputSchema: InspectContainerSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: InspectContainerInput) => {
      try {
        let targetHost: HostConfig;

        if (params.host) {
          const found = hosts.find(h => h.name === params.host);
          if (!found) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Host '${params.host}' not found.`
              }]
            };
          }
          targetHost = found;
        } else {
          const result = await findContainerHost(params.container_id, hosts);
          if (!result) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Error: Container '${params.container_id}' not found.`
              }]
            };
          }
          targetHost = result.host;
        }

        const info = await inspectContainer(params.container_id, targetHost);
        const output = { ...info, _host: targetHost.name };

        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatInspectMarkdown(info, targetHost.name);

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error inspecting container: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_host_status =====
  server.registerTool(
    "homelab_host_status",
    {
      title: "Host Status",
      description: `Get status overview of homelab hosts showing connection status and container counts.

Args:
  - host (string, optional): Specific host to check (omit for all hosts)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Host connectivity status, total container count, and running container count.

Examples:
  - "Check all hosts" -> {}
  - "Is unraid online?" -> { host: "unraid" }`,
      inputSchema: HostStatusSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: HostStatusInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found. Available hosts: ${hosts.map(h => h.name).join(", ")}`
            }]
          };
        }

        const status = await getHostStatus(targetHosts);
        const output = { hosts: status };

        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatHostStatusMarkdown(status);

        return {
          content: [{ type: "text", text }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error checking host status: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_search_containers =====
  server.registerTool(
    "homelab_search_containers",
    {
      title: "Search Containers",
      description: `Search for containers by name, image, or labels across all hosts.

Args:
  - query (string): Search query to match against container names, images, and labels
  - host (string, optional): Filter by specific host
  - limit (number): Max results (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Matching containers with relevance info.

Examples:
  - "Find all media services" -> { query: "media" }
  - "Search for arr containers" -> { query: "arr" }`,
      inputSchema: SearchContainersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: SearchContainersInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        const allContainers = await listContainers(targetHosts, {});
        const query = params.query.toLowerCase();

        const matches = allContainers.filter(c => {
          const searchText = [
            c.name,
            c.image,
            ...Object.keys(c.labels),
            ...Object.values(c.labels)
          ].join(" ").toLowerCase();
          return searchText.includes(query);
        });

        const total = matches.length;
        const paginated = matches.slice(params.offset, params.offset + params.limit);
        const hasMore = total > params.offset + params.limit;

        const output = {
          query: params.query,
          total,
          count: paginated.length,
          offset: params.offset,
          containers: paginated,
          has_more: hasMore,
          ...(hasMore ? { next_offset: params.offset + params.limit } : {})
        };

        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatSearchResultsMarkdown(paginated, params.query, total);

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error searching containers: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_docker_info =====
  server.registerTool(
    "homelab_docker_info",
    {
      title: "Docker System Info",
      description: `Get Docker system information including version, resources, and container counts.

Args:
  - host (string, optional): Host to get info from (omit for all hosts)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Docker version, API version, OS, architecture, CPUs, memory, storage driver, container/image counts.

Examples:
  - "Get Docker info for all hosts" -> {}
  - "Show Docker version on tootie" -> { host: "tootie" }`,
      inputSchema: DockerInfoSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: DockerInfoInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found.`
            }]
          };
        }

        const results: Array<{ host: string; info: Awaited<ReturnType<typeof getDockerInfo>> }> = [];

        for (const host of targetHosts) {
          try {
            const info = await getDockerInfo(host);
            results.push({ host: host.name, info });
          } catch (error) {
            results.push({
              host: host.name,
              info: {
                dockerVersion: "error",
                apiVersion: "error",
                os: error instanceof Error ? error.message : "Connection failed",
                arch: "",
                kernelVersion: "",
                cpus: 0,
                memoryBytes: 0,
                storageDriver: "",
                rootDir: "",
                containersTotal: 0,
                containersRunning: 0,
                containersPaused: 0,
                containersStopped: 0,
                images: 0
              }
            });
          }
        }

        const output = { hosts: results };
        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatDockerInfoMarkdown(results);

        return {
          content: [{ type: "text", text }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting Docker info: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_docker_df =====
  server.registerTool(
    "homelab_docker_df",
    {
      title: "Docker Disk Usage",
      description: `Get Docker disk usage (images, containers, volumes, build cache).

Args:
  - host (string, optional): Host to get disk usage from (omit for all hosts)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Disk usage breakdown by type with total and reclaimable space.

Examples:
  - "Show Docker disk usage" -> {}
  - "How much space can I reclaim on tootie?" -> { host: "tootie" }`,
      inputSchema: DockerDiskUsageSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: DockerDiskUsageInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found.`
            }]
          };
        }

        const results: Array<{ host: string; usage: Awaited<ReturnType<typeof getDockerDiskUsage>> }> = [];

        for (const host of targetHosts) {
          try {
            const usage = await getDockerDiskUsage(host);
            results.push({ host: host.name, usage });
          } catch {
            // Skip failed hosts
          }
        }

        const output = { hosts: results };
        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatDockerDfMarkdown(results);

        return {
          content: [{ type: "text", text }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting disk usage: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_prune =====
  server.registerTool(
    "homelab_prune",
    {
      title: "Prune Docker Resources",
      description: `Remove unused Docker resources (containers, images, volumes, networks, build cache).

Args:
  - host (string, optional): Host to prune (omit for all hosts)
  - target ('containers' | 'images' | 'volumes' | 'networks' | 'buildcache' | 'all'): What to prune
  - force (boolean): Must be true to confirm destructive operation

Returns:
  Space reclaimed and items deleted for each resource type.

Examples:
  - "Prune unused images on tootie" -> { host: "tootie", target: "images", force: true }
  - "Clean up everything on all hosts" -> { target: "all", force: true }`,
      inputSchema: PruneSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: PruneInput) => {
      try {
        if (!params.force) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "⚠️ This is a destructive operation. Set force=true to confirm."
            }]
          };
        }

        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found.`
            }]
          };
        }

        const allResults: Array<{ host: string; results: Awaited<ReturnType<typeof pruneDocker>> }> = [];

        for (const host of targetHosts) {
          try {
            const results = await pruneDocker(host, params.target);
            allResults.push({ host: host.name, results });
          } catch (error) {
            allResults.push({
              host: host.name,
              results: [{
                type: params.target,
                spaceReclaimed: 0,
                itemsDeleted: 0,
                details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
              }]
            });
          }
        }

        const output = { hosts: allResults };
        const text = formatPruneMarkdown(allResults);

        return {
          content: [{ type: "text", text }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error pruning: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );

  // ===== homelab_host_resources =====
  server.registerTool(
    "homelab_host_resources",
    {
      title: "Host Resource Usage",
      description: `Get host system resources (CPU, memory, disk) via SSH.

Requires passwordless SSH key authentication to be configured.

Args:
  - host (string, optional): Host to get resources from (omit for all hosts)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  CPU usage, memory usage, disk usage, load average, uptime.

Examples:
  - "Show resource usage for all hosts" -> {}
  - "How much RAM is tootie using?" -> { host: "tootie" }`,
      inputSchema: HostResourcesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: HostResourcesInput) => {
      try {
        const targetHosts = params.host
          ? hosts.filter(h => h.name === params.host)
          : hosts;

        if (params.host && targetHosts.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Host '${params.host}' not found.`
            }]
          };
        }

        const results: Array<{ host: string; resources: Awaited<ReturnType<typeof getHostResources>> | null; error?: string }> = [];

        for (const host of targetHosts) {
          // Skip local socket connections - can't SSH to those
          if (host.host.startsWith("/")) {
            results.push({
              host: host.name,
              resources: null,
              error: "Local socket - SSH not available"
            });
            continue;
          }

          try {
            const resources = await getHostResources(host);
            results.push({ host: host.name, resources });
          } catch (error) {
            results.push({
              host: host.name,
              resources: null,
              error: error instanceof Error ? error.message : "SSH failed"
            });
          }
        }

        const output = { hosts: results };
        const text = params.response_format === ResponseFormat.JSON
          ? JSON.stringify(output, null, 2)
          : formatHostResourcesMarkdown(results);

        return {
          content: [{ type: "text", text }],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting host resources: ${error instanceof Error ? error.message : "Unknown error"}`
          }]
        };
      }
    }
  );
}

// ===== Formatting Helpers =====

function truncateIfNeeded(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT - 100) + 
    "\n\n... [Output truncated. Use pagination or filters to reduce results.]";
}

function formatContainersMarkdown(
  containers: ContainerInfo[], 
  total: number, 
  offset: number, 
  hasMore: boolean
): string {
  if (containers.length === 0) {
    return "No containers found matching the specified criteria.";
  }

  const lines = [`## Containers (${offset + 1}-${offset + containers.length} of ${total})`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    const ports = c.ports.filter(p => p.hostPort).map(p => `${p.hostPort}→${p.containerPort}`).join(", ");
    
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
    const ts = log.timestamp.slice(11, 19); // HH:MM:SS
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
  if (allStats.length === 0) {
    return "No running containers found.";
  }

  const lines = ["## Container Resource Usage", ""];
  lines.push("| Container | Host | CPU% | Memory | Mem% |");
  lines.push("|-----------|------|------|--------|------|");

  for (const { stats, host } of allStats) {
    lines.push(`| ${stats.containerName} | ${host} | ${stats.cpuPercent.toFixed(1)}% | ${formatBytes(stats.memoryUsage)} | ${stats.memoryPercent.toFixed(1)}% |`);
  }

  return lines.join("\n");
}

function formatInspectMarkdown(info: Awaited<ReturnType<typeof inspectContainer>>, host: string): string {
  const config = info.Config;
  const state = info.State;
  const network = info.NetworkSettings;
  const mounts = info.Mounts || [];

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

  if (config.Env && config.Env.length > 0) {
    lines.push("### Environment Variables");
    for (const env of config.Env.slice(0, 20)) {
      // Mask sensitive values
      const [key] = env.split("=");
      const isSensitive = /password|secret|key|token|api/i.test(key);
      lines.push(`- ${isSensitive ? `${key}=****` : env}`);
    }
    if (config.Env.length > 20) {
      lines.push(`- ... and ${config.Env.length - 20} more`);
    }
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
  const lines = ["## Homelab Host Status", ""];
  lines.push("| Host | Status | Containers | Running |");
  lines.push("|------|--------|------------|---------|");

  for (const h of status) {
    const statusEmoji = h.connected ? "🟢" : "🔴";
    const statusText = h.connected ? "Online" : `Offline (${h.error || "Unknown"})`;
    lines.push(`| ${h.name} | ${statusEmoji} ${statusText} | ${h.containerCount} | ${h.runningCount} |`);
  }

  return lines.join("\n");
}

function formatSearchResultsMarkdown(containers: ContainerInfo[], query: string, total: number): string {
  if (containers.length === 0) {
    return `No containers found matching '${query}'.`;
  }

  const lines = [`## Search Results for '${query}' (${total} matches)`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    lines.push(`${stateEmoji} **${c.name}** (${c.hostName})`);
    lines.push(`   Image: ${c.image} | State: ${c.state}`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatDockerInfoMarkdown(
  results: Array<{ host: string; info: Awaited<ReturnType<typeof getDockerInfo>> }>
): string {
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

function formatDockerDfMarkdown(
  results: Array<{ host: string; usage: Awaited<ReturnType<typeof getDockerDiskUsage>> }>
): string {
  const lines = ["## Docker Disk Usage", ""];

  for (const { host, usage } of results) {
    lines.push(`### ${host}`);
    lines.push("");
    lines.push("| Type | Count | Size | Reclaimable |");
    lines.push("|------|-------|------|-------------|");
    lines.push(`| Images | ${usage.images.total} (${usage.images.active} active) | ${formatBytes(usage.images.size)} | ${formatBytes(usage.images.reclaimable)} |`);
    lines.push(`| Containers | ${usage.containers.total} (${usage.containers.running} running) | ${formatBytes(usage.containers.size)} | ${formatBytes(usage.containers.reclaimable)} |`);
    lines.push(`| Volumes | ${usage.volumes.total} (${usage.volumes.active} active) | ${formatBytes(usage.volumes.size)} | ${formatBytes(usage.volumes.reclaimable)} |`);
    lines.push(`| Build Cache | ${usage.buildCache.total} | ${formatBytes(usage.buildCache.size)} | ${formatBytes(usage.buildCache.reclaimable)} |`);
    lines.push(`| **Total** | | **${formatBytes(usage.totalSize)}** | **${formatBytes(usage.totalReclaimable)}** |`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatPruneMarkdown(
  allResults: Array<{ host: string; results: Array<{ type: string; spaceReclaimed: number; itemsDeleted: number; details?: string[] }> }>
): string {
  const lines = ["## Prune Results", ""];

  let totalReclaimed = 0;
  let totalDeleted = 0;

  for (const { host, results } of allResults) {
    lines.push(`### ${host}`);
    lines.push("");
    lines.push("| Type | Items Deleted | Space Reclaimed |");
    lines.push("|------|---------------|-----------------|");

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

function formatHostResourcesMarkdown(
  results: Array<{ host: string; resources: Awaited<ReturnType<typeof getHostResources>> | null; error?: string }>
): string {
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
      lines.push("");
      lines.push("**Disks:**");
      for (const d of resources.disk) {
        lines.push(`- ${d.mount}: ${d.usedGB}G / ${d.totalGB}G (${d.usagePercent}%)`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
