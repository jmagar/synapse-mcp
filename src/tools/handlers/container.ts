// src/tools/handlers/container.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';
import {
  formatContainersMarkdown,
  formatLogsMarkdown,
  formatStatsMarkdown,
  formatMultiStatsMarkdown,
  formatInspectMarkdown,
  formatSearchResultsMarkdown,
  formatInspectSummaryMarkdown
} from '../../formatters/index.js';
import { logError } from '../../utils/errors.js';

/**
 * Handle all container subactions
 */
export async function handleContainerAction(
  input: FluxInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'container') {
    throw new Error(`Invalid action for container handler: ${input.action}`);
  }

  const dockerService = container.getDockerService();
  const hosts = loadHostConfigs();
  const format = input.response_format ?? ResponseFormat.MARKDOWN;

  // Use type assertion for accessing subaction-specific fields validated by Zod
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inp = input as any;

  switch (input.subaction) {
    case 'list': {
      const containers = await dockerService.listContainers(hosts, {
        state: inp.state === 'all' ? undefined : inp.state,
        nameFilter: inp.name_filter,
        imageFilter: inp.image_filter,
        labelFilter: inp.label_filter
      });

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(containers, null, 2);
      }

      // Apply pagination
      const offset = inp.offset ?? 0;
      const limit = inp.limit ?? 50;
      const total = containers.length;
      const paginatedContainers = containers.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      return formatContainersMarkdown(paginatedContainers, total, offset, hasMore);
    }

    case 'start':
    case 'stop':
    case 'restart':
    case 'pause': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      await dockerService.containerAction(inp.container_id, inp.subaction, found.host);
      return `Container ${inp.container_id} ${inp.subaction}ed successfully`;
    }

    case 'resume': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      // Resume maps to unpause in Docker API
      await dockerService.containerAction(inp.container_id, 'unpause', found.host);
      return `Container ${inp.container_id} resumed successfully`;
    }

    case 'logs': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }

      const logs = await dockerService.getContainerLogs(inp.container_id, found.host, {
        lines: inp.lines,
        since: inp.since,
        until: inp.until,
        stream: inp.stream === 'both' ? 'all' : inp.stream
      });

      // Apply grep filter if specified
      const filteredLogs = inp.grep
        ? logs.filter((log: { message: string }) => log.message.includes(inp.grep))
        : logs;

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(filteredLogs, null, 2);
      }
      return formatLogsMarkdown(filteredLogs, inp.container_id, found.host.name);
    }

    case 'stats': {
      // If container_id is provided, get stats for specific container
      if (inp.container_id) {
        const found = await dockerService.findContainerHost(inp.container_id, hosts);
        if (!found) {
          throw new Error(`Container not found: ${inp.container_id}`);
        }
        const stats = await dockerService.getContainerStats(inp.container_id, found.host);

        if (format === ResponseFormat.JSON) {
          return JSON.stringify(stats, null, 2);
        }
        return formatStatsMarkdown([stats], found.host.name);
      }

      // Otherwise, get stats for all running containers
      const allContainers = await dockerService.listContainers(hosts, { state: 'running' });
      const statsPromises = allContainers.map(async (c) => {
        try {
          const found = await dockerService.findContainerHost(c.id, hosts);
          if (!found) return null;
          const stats = await dockerService.getContainerStats(c.id, found.host);
          return { stats, host: found.host.name };
        } catch (error) {
          logError(error, { operation: `getContainerStats:${c.id}` });
          return null;
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allStats = (await Promise.all(statsPromises)).filter((s): s is { stats: any; host: string } => s !== null);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(allStats, null, 2);
      }

      // Use formatMultiStatsMarkdown for multiple containers
      return formatMultiStatsMarkdown(allStats);
    }

    case 'inspect': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      const inspection = await dockerService.inspectContainer(inp.container_id, found.host);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(inspection, null, 2);
      }

      // If summary mode, use summary formatter
      if (inp.summary) {
        const summary = {
          id: inspection.Id.slice(0, 12),
          name: inspection.Name.replace(/^\//, ''),
          image: inspection.Config.Image,
          state: inspection.State.Status,
          created: inspection.Created,
          started: inspection.State.StartedAt,
          restartCount: inspection.RestartCount,
          ports: Object.entries(inspection.NetworkSettings.Ports || {})
            .filter(([, bindings]) => bindings && bindings.length > 0)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([containerPort, bindings]: [string, any]) => {
              const binding = bindings?.[0];
              return binding
                ? `${binding.HostIp || '0.0.0.0'}:${binding.HostPort} → ${containerPort}`
                : containerPort;
            }),
          mounts: (inspection.Mounts || []).map((m: { Source: string; Destination: string; Type: string }) => ({
            src: m.Source,
            dst: m.Destination,
            type: m.Type
          })),
          networks: Object.keys(inspection.NetworkSettings.Networks || {}),
          env_count: inspection.Config.Env?.length || 0,
          labels_count: Object.keys(inspection.Config.Labels || {}).length,
          host: found.host.name
        };
        return formatInspectSummaryMarkdown(summary);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return formatInspectMarkdown(inspection as any, found.host.name);
    }

    case 'search': {
      const containers = await dockerService.listContainers(hosts, {
        nameFilter: inp.query
      });

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(containers, null, 2);
      }

      // Apply pagination
      const offset = inp.offset ?? 0;
      const limit = inp.limit ?? 50;
      const total = containers.length;
      const paginatedContainers = containers.slice(offset, offset + limit);

      return formatSearchResultsMarkdown(paginatedContainers, inp.query, total);
    }

    case 'pull': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      const image = found.container.Image || inp.container_id;
      const result = await dockerService.pullImage(image, found.host);
      return `Pulled image ${image}: ${result.status}`;
    }

    case 'recreate': {
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      const result = await dockerService.recreateContainer(inp.container_id, found.host, {
        pull: inp.pull
      });
      return `Container recreated: ${result.containerId} (${result.status})`;
    }

    // NOTE: 'exec' and 'top' subactions are NOT in the schema yet
    // because handlers are not implemented. When implementing:
    // 1. Add exec: execContainer method to IDockerService
    // 2. Add top: getContainerProcesses method to IDockerService
    // 3. Re-add containerExecSchema and containerTopSchema to flux/index.ts

    default:
      // This should never be reached due to Zod validation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unknown subaction: ${(input as any).subaction}`);
  }
}
