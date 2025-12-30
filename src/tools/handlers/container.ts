// src/tools/handlers/container.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import type {
  ContainerActionInput,
  ContainerListInput,
  ContainerLogsInput,
  ContainerStatsInput,
  ContainerInspectInput,
  ContainerSearchInput,
  ContainerPullInput,
  ContainerRecreateInput,
  ContainerExecInput,
  ContainerTopInput
} from '../../schemas/flux/container.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat, type ContainerStats } from '../../types.js';
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
 * Type guards for discriminated union narrowing
 * These replace unsafe `as` casts with proper type narrowing
 */
function isContainerListInput(input: ContainerActionInput): input is ContainerListInput {
  return input.subaction === 'list';
}

function isContainerLogsInput(input: ContainerActionInput): input is ContainerLogsInput {
  return input.subaction === 'logs';
}

function isContainerStatsInput(input: ContainerActionInput): input is ContainerStatsInput {
  return input.subaction === 'stats';
}

function isContainerInspectInput(input: ContainerActionInput): input is ContainerInspectInput {
  return input.subaction === 'inspect';
}

function isContainerSearchInput(input: ContainerActionInput): input is ContainerSearchInput {
  return input.subaction === 'search';
}

function isContainerPullInput(input: ContainerActionInput): input is ContainerPullInput {
  return input.subaction === 'pull';
}

function isContainerRecreateInput(input: ContainerActionInput): input is ContainerRecreateInput {
  return input.subaction === 'recreate';
}

function isContainerExecInput(input: ContainerActionInput): input is ContainerExecInput {
  return input.subaction === 'exec';
}

function isContainerTopInput(input: ContainerActionInput): input is ContainerTopInput {
  return input.subaction === 'top';
}

/**
 * Type guard to check if input has container_id field
 */
function hasContainerId(input: ContainerActionInput): input is ContainerActionInput & { container_id: string } {
  return 'container_id' in input && typeof input.container_id === 'string';
}

const resolveNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

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

  // Type assertion validated by Zod - input is guaranteed to be ContainerActionInput
  const inp = input as ContainerActionInput;

  switch (inp.subaction) {
    case 'list': {
      if (!isContainerListInput(inp)) {
        throw new Error('Type guard failed for list subaction');
      }
      // Map schema state values to service state values
      // Schema uses 'exited'/'restarting' but service uses 'stopped'
      const stateMap: Record<string, 'running' | 'stopped' | 'paused' | undefined> = {
        all: undefined,
        running: 'running',
        exited: 'stopped',
        paused: 'paused',
        restarting: 'running' // restarting containers are treated as running
      };
      const containers = await dockerService.listContainers(hosts, {
        state: stateMap[inp.state] ?? undefined,
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
      if (!hasContainerId(inp)) {
        throw new Error('container_id is required');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      await dockerService.containerAction(inp.container_id, inp.subaction, found.host);
      return `Container ${inp.container_id} ${inp.subaction}ed successfully`;
    }

    case 'resume': {
      if (!hasContainerId(inp)) {
        throw new Error('container_id is required');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      // Resume maps to unpause in Docker API
      await dockerService.containerAction(inp.container_id, 'unpause', found.host);
      return `Container ${inp.container_id} resumed successfully`;
    }

    case 'logs': {
      if (!isContainerLogsInput(inp)) {
        throw new Error('Type guard failed for logs subaction');
      }
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
        ? logs.filter((log) => log.message.includes(inp.grep as string))
        : logs;

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(filteredLogs, null, 2);
      }
      return formatLogsMarkdown(filteredLogs, inp.container_id, found.host.name);
    }

    case 'stats': {
      if (!isContainerStatsInput(inp)) {
        throw new Error('Type guard failed for stats subaction');
      }
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

      const allStats = (await Promise.all(statsPromises)).filter(
        (s): s is { stats: ContainerStats; host: string } => s !== null
      );

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(allStats, null, 2);
      }

      // Use formatMultiStatsMarkdown for multiple containers
      return formatMultiStatsMarkdown(allStats);
    }

    case 'inspect': {
      if (!isContainerInspectInput(inp)) {
        throw new Error('Type guard failed for inspect subaction');
      }
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
        // Type for port bindings from Docker API
        type PortBinding = { HostIp: string; HostPort: string } | undefined;
        type PortBindings = PortBinding[] | null;

        const summary = {
          id: inspection.Id.slice(0, 12),
          name: inspection.Name.replace(/^\//, ''),
          image: inspection.Config.Image,
          state: inspection.State.Status,
          created: inspection.Created,
          started: inspection.State.StartedAt,
          restartCount: inspection.RestartCount,
          ports: Object.entries(inspection.NetworkSettings.Ports || {})
            .filter((entry): entry is [string, PortBinding[]] => {
              const bindings = entry[1];
              return Array.isArray(bindings) && bindings.length > 0;
            })
            .map(([containerPort, bindings]) => {
              const binding = bindings[0];
              return binding
                ? `${binding.HostIp || '0.0.0.0'}:${binding.HostPort} → ${containerPort}`
                : containerPort;
            }),
          mounts: (inspection.Mounts || []).map((m) => ({
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

      // Docker.ContainerInspectInfo is compatible with ContainerInspectInfo
      return formatInspectMarkdown(inspection, found.host.name);
    }

    case 'search': {
      if (!isContainerSearchInput(inp)) {
        throw new Error('Type guard failed for search subaction');
      }
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
      if (!isContainerPullInput(inp)) {
        throw new Error('Type guard failed for pull subaction');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      const inputImage = resolveNonEmptyString(inp.image);
      let image = resolveNonEmptyString(found.container?.Image);

      if (!image) {
        try {
          const inspection = await dockerService.inspectContainer(inp.container_id, found.host);
          image = resolveNonEmptyString(inspection?.Config?.Image);
        } catch (error) {
          if (!inputImage) {
            throw error;
          }
        }
      }

      image = image ?? inputImage;

      if (!image) {
        throw new Error(`Cannot determine image for container: ${inp.container_id}`);
      }
      const result = await dockerService.pullImage(image, found.host);
      return `Pulled image ${image}: ${result.status}`;
    }

    case 'recreate': {
      if (!isContainerRecreateInput(inp)) {
        throw new Error('Type guard failed for recreate subaction');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }
      const result = await dockerService.recreateContainer(inp.container_id, found.host, {
        pull: inp.pull
      });
      return `Container recreated: ${result.containerId} (${result.status})`;
    }

    case 'exec': {
      if (!isContainerExecInput(inp)) {
        throw new Error('Type guard failed for exec subaction');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }

      const result = await dockerService.execContainer(inp.container_id, found.host, {
        command: inp.command,
        user: inp.user,
        workdir: inp.workdir
      });

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: found.host.name,
          container: inp.container_id,
          ...result
        }, null, 2);
      }

      const stderrBlock = result.stderr
        ? `\n\n**stderr**\n\n\`\`\`\n${result.stderr}\n\`\`\``
        : '';

      return `## Exec - ${inp.container_id} (${found.host.name})\n\n` +
        `**exitCode:** ${result.exitCode}\n\n` +
        `**stdout**\n\n\`\`\`\n${result.stdout}\n\`\`\`` +
        stderrBlock;
    }

    case 'top': {
      if (!isContainerTopInput(inp)) {
        throw new Error('Type guard failed for top subaction');
      }
      const found = await dockerService.findContainerHost(inp.container_id, hosts);
      if (!found) {
        throw new Error(`Container not found: ${inp.container_id}`);
      }

      const result = await dockerService.getContainerProcesses(inp.container_id, found.host);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: found.host.name,
          container: inp.container_id,
          ...result
        }, null, 2);
      }

      const header = result.titles.join(' ');
      const rows = result.processes.map((row) => row.join(' '));
      const output = [header, ...rows].join('\n').trim();

      return `## Processes - ${inp.container_id} (${found.host.name})\n\n\`\`\`\n${output}\n\`\`\``;
    }

    default: {
      // This should never be reached due to Zod validation
      // Type assertion needed here to get the subaction for error message
      // since the switch is exhaustive, this is only for runtime safety
      const exhaustiveCheck: never = inp;
      throw new Error(`Unknown subaction: ${(exhaustiveCheck as ContainerActionInput).subaction}`);
    }
  }
}
