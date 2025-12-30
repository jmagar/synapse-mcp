// src/tools/handlers/compose.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import type {
  ComposeActionInput,
  ComposeListInput,
  ComposeStatusInput,
  ComposeUpInput,
  ComposeDownInput,
  ComposeRestartInput,
  ComposeLogsInput,
  ComposeBuildInput,
  ComposePullInput,
  ComposeRecreateInput
} from '../../schemas/flux/compose.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';
import {
  formatComposeListMarkdown,
  formatComposeStatusMarkdown
} from '../../formatters/index.js';

/**
 * Handle all compose subactions
 *
 * Subactions: list, status, up, down, restart, logs, build, pull, recreate
 */
export async function handleComposeAction(
  input: FluxInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'compose') {
    throw new Error(`Invalid action for compose handler: ${input.action}`);
  }

  const composeService = container.getComposeService();
  const hosts = loadHostConfigs();
  const format = input.response_format ?? ResponseFormat.MARKDOWN;

  // Cast to the compose action union type - validated by Zod
  const inp = input as ComposeActionInput;

  // Find the target host
  const hostConfig = hosts.find(h => h.name === inp.host);
  if (!hostConfig) {
    throw new Error(`Host not found: ${inp.host}`);
  }

  switch (inp.subaction) {
    case 'list': {
      const listInput = inp as ComposeListInput;
      let projects = await composeService.listComposeProjects(hostConfig);

      // Apply name filter if specified
      if (listInput.name_filter) {
        projects = projects.filter(p =>
          p.name.toLowerCase().includes((listInput.name_filter as string).toLowerCase())
        );
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(projects, null, 2);
      }

      // Apply pagination
      const offset = listInput.offset ?? 0;
      const limit = listInput.limit ?? 50;
      const total = projects.length;
      const paginatedProjects = projects.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      return formatComposeListMarkdown(paginatedProjects, hostConfig.name, total, offset, hasMore);
    }

    case 'status': {
      const statusInput = inp as ComposeStatusInput;
      const project = await composeService.getComposeStatus(hostConfig, statusInput.project);

      // Apply service filter if specified
      let services = project.services;
      if (statusInput.service_filter) {
        services = services.filter(s =>
          s.name.toLowerCase().includes((statusInput.service_filter as string).toLowerCase())
        );
        project.services = services;
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(project, null, 2);
      }

      // Apply pagination to services
      const offset = statusInput.offset ?? 0;
      const limit = statusInput.limit ?? 50;
      const totalServices = services.length;
      project.services = services.slice(offset, offset + limit);
      const hasMore = offset + limit < totalServices;

      return formatComposeStatusMarkdown(project, totalServices, offset, hasMore);
    }

    case 'up': {
      const upInput = inp as ComposeUpInput;
      await composeService.composeUp(hostConfig, upInput.project, upInput.detach ?? true);
      return `Project '${upInput.project}' started successfully on ${hostConfig.name}`;
    }

    case 'down': {
      const downInput = inp as ComposeDownInput;
      if (downInput.remove_volumes && !downInput.force) {
        throw new Error('Compose down with remove_volumes requires force=true to prevent accidental data loss');
      }
      await composeService.composeDown(hostConfig, downInput.project, downInput.remove_volumes ?? false);
      return `Project '${downInput.project}' stopped successfully on ${hostConfig.name}`;
    }

    case 'restart': {
      const restartInput = inp as ComposeRestartInput;
      await composeService.composeRestart(hostConfig, restartInput.project);
      return `Project '${restartInput.project}' restarted successfully on ${hostConfig.name}`;
    }

    case 'logs': {
      const logsInput = inp as ComposeLogsInput;
      const options: {
        tail?: number;
        since?: string;
        until?: string;
        services?: string[];
      } = {};

      if (logsInput.lines !== undefined) {
        options.tail = logsInput.lines;
      }
      if (logsInput.since) {
        options.since = logsInput.since;
      }
      if (logsInput.until) {
        options.until = logsInput.until;
      }
      if (logsInput.service) {
        options.services = [logsInput.service];
      }

      let logs = await composeService.composeLogs(hostConfig, logsInput.project, options);

      // Apply grep filter if specified
      if (logsInput.grep) {
        const lines = logs.split('\n');
        const filtered = lines.filter(line => line.includes(logsInput.grep as string));
        logs = filtered.join('\n');
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ project: logsInput.project, host: hostConfig.name, logs }, null, 2);
      }

      return `## Logs: ${logsInput.project} (${hostConfig.name})\n\n\`\`\`\n${logs}\n\`\`\``;
    }

    case 'build': {
      const buildInput = inp as ComposeBuildInput;
      const options: {
        service?: string;
        noCache?: boolean;
        pull?: boolean;
      } = {};

      if (buildInput.service) {
        options.service = buildInput.service;
      }
      if (buildInput.no_cache) {
        options.noCache = buildInput.no_cache;
      }

      await composeService.composeBuild(hostConfig, buildInput.project, options);
      return `Project '${buildInput.project}' build completed on ${hostConfig.name}`;
    }

    case 'pull': {
      const pullInput = inp as ComposePullInput;
      const options: {
        service?: string;
        ignorePullFailures?: boolean;
        quiet?: boolean;
      } = {};

      if (pullInput.service) {
        options.service = pullInput.service;
      }

      await composeService.composePull(hostConfig, pullInput.project, options);
      return `Project '${pullInput.project}' pull completed on ${hostConfig.name}`;
    }

    case 'recreate': {
      const recreateInput = inp as ComposeRecreateInput;
      const options: {
        service?: string;
        forceRecreate?: boolean;
        noDeps?: boolean;
      } = {};

      if (recreateInput.service) {
        options.service = recreateInput.service;
      }

      await composeService.composeRecreate(hostConfig, recreateInput.project, options);
      return `Project '${recreateInput.project}' recreated on ${hostConfig.name}`;
    }

    default: {
      // This should never be reached due to Zod validation
      const exhaustiveCheck: never = inp;
      throw new Error(`Unknown subaction: ${(exhaustiveCheck as ComposeActionInput).subaction}`);
    }
  }
}
