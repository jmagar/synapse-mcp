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
  ComposeRecreateInput,
  ComposeRefreshInput
} from '../../schemas/flux/compose.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';
import type { HostConfig } from '../../types.js';
import {
  formatComposeListMarkdown,
  formatComposeStatusMarkdown
} from '../../formatters/index.js';
import {
  handleComposeUp,
  handleComposeDown,
  handleComposeRestart,
  handleComposeLogs,
  handleComposeBuild,
  handleComposePull,
  handleComposeRecreate,
  handleComposeRefresh
} from './compose-handlers.js';
import { HostResolver } from '../../services/host-resolver.js';

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

  switch (inp.subaction) {
    case 'list': {
      const listInput = inp as ComposeListInput;

      // If no host specified, aggregate from ALL hosts
      if (!listInput.host) {
        const allProjects = await Promise.all(
          hosts.map(async (h) => {
            try {
              const projects = await composeService.listComposeProjects(h);
              return projects.map(p => ({ ...p, host: h.name }));
            } catch (error) {
              console.error(`Failed to list projects on ${h.name}:`, error);
              return [];
            }
          })
        );

        let projects = allProjects.flat();

        // Apply name filter
        if (listInput.name_filter) {
          const nameFilter = listInput.name_filter;
          projects = projects.filter(p =>
            p.name.toLowerCase().includes(nameFilter.toLowerCase())
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

        return formatComposeListMarkdown(paginatedProjects, 'all-hosts', total, offset, hasMore);
      }

      // Single host mode (existing logic)
      const hostConfig = hosts.find(h => h.name === listInput.host);
      if (!hostConfig) {
        throw new Error(`Host not found: ${listInput.host}`);
      }

      let projects = await composeService.listComposeProjects(hostConfig);

      // Apply name filter if specified
      if (listInput.name_filter) {
        const nameFilter = listInput.name_filter;
        projects = projects.filter(p =>
          p.name.toLowerCase().includes(nameFilter.toLowerCase())
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

      let hostConfig: HostConfig;

      // Use HostResolver for auto-discovery if no host specified
      if (!statusInput.host) {
        const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
        hostConfig = await resolver.resolveHost(statusInput.project, undefined);
      } else {
        const found = hosts.find(h => h.name === statusInput.host);
        if (!found) {
          throw new Error(`Host not found: ${statusInput.host}`);
        }
        hostConfig = found;
      }

      const project = await composeService.getComposeStatus(hostConfig, statusInput.project);

      // Apply service filter if specified
      let services = project.services;
      if (statusInput.service_filter) {
        const serviceFilter = statusInput.service_filter;
        services = services.filter(s =>
          s.name.toLowerCase().includes(serviceFilter.toLowerCase())
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
      return handleComposeUp(upInput, hosts, container);
    }

    case 'down': {
      const downInput = inp as ComposeDownInput;
      return handleComposeDown(downInput, hosts, container);
    }

    case 'restart': {
      const restartInput = inp as ComposeRestartInput;
      return handleComposeRestart(restartInput, hosts, container);
    }

    case 'logs': {
      const logsInput = inp as ComposeLogsInput;
      return handleComposeLogs(logsInput, hosts, container);
    }

    case 'build': {
      const buildInput = inp as ComposeBuildInput;
      return handleComposeBuild(buildInput, hosts, container);
    }

    case 'pull': {
      const pullInput = inp as ComposePullInput;
      return handleComposePull(pullInput, hosts, container);
    }

    case 'recreate': {
      const recreateInput = inp as ComposeRecreateInput;
      return handleComposeRecreate(recreateInput, hosts, container);
    }

    case 'refresh': {
      const refreshInput = inp as ComposeRefreshInput;
      return handleComposeRefresh(refreshInput, hosts, container);
    }

    default: {
      // This should never be reached due to Zod validation
      const exhaustiveCheck: never = inp;
      throw new Error(`Unknown subaction: ${(exhaustiveCheck as ComposeActionInput).subaction}`);
    }
  }
}
