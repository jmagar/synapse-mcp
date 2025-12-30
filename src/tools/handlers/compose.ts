// src/tools/handlers/compose.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
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

  // Use type assertion to access subaction-specific fields
  const inp = input as any;

  // Find the target host
  const hostConfig = hosts.find(h => h.name === inp.host);
  if (!hostConfig) {
    throw new Error(`Host not found: ${inp.host}`);
  }

  switch (inp.subaction) {
    case 'list': {
      let projects = await composeService.listComposeProjects(hostConfig);

      // Apply name filter if specified
      if (inp.name_filter) {
        projects = projects.filter(p =>
          p.name.toLowerCase().includes(inp.name_filter.toLowerCase())
        );
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(projects, null, 2);
      }

      // Apply pagination
      const offset = inp.offset ?? 0;
      const limit = inp.limit ?? 50;
      const total = projects.length;
      const paginatedProjects = projects.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      return formatComposeListMarkdown(paginatedProjects, hostConfig.name, total, offset, hasMore);
    }

    case 'status': {
      const project = await composeService.getComposeStatus(hostConfig, inp.project);

      // Apply service filter if specified
      let services = project.services;
      if (inp.service_filter) {
        services = services.filter(s =>
          s.name.toLowerCase().includes(inp.service_filter.toLowerCase())
        );
        project.services = services;
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(project, null, 2);
      }

      // Apply pagination to services
      const offset = inp.offset ?? 0;
      const limit = inp.limit ?? 50;
      const totalServices = services.length;
      project.services = services.slice(offset, offset + limit);
      const hasMore = offset + limit < totalServices;

      return formatComposeStatusMarkdown(project, totalServices, offset, hasMore);
    }

    case 'up': {
      await composeService.composeUp(hostConfig, inp.project, inp.detach ?? true);
      return `Project '${inp.project}' started successfully on ${hostConfig.name}`;
    }

    case 'down': {
      await composeService.composeDown(hostConfig, inp.project, inp.remove_volumes ?? false);
      return `Project '${inp.project}' stopped successfully on ${hostConfig.name}`;
    }

    case 'restart': {
      await composeService.composeRestart(hostConfig, inp.project);
      return `Project '${inp.project}' restarted successfully on ${hostConfig.name}`;
    }

    case 'logs': {
      const options: {
        tail?: number;
        since?: string;
        until?: string;
        services?: string[];
      } = {};

      if (inp.lines !== undefined) {
        options.tail = inp.lines;
      }
      if (inp.since) {
        options.since = inp.since;
      }
      if (inp.until) {
        options.until = inp.until;
      }
      if (inp.service) {
        options.services = [inp.service];
      }

      let logs = await composeService.composeLogs(hostConfig, inp.project, options);

      // Apply grep filter if specified
      if (inp.grep) {
        const lines = logs.split('\n');
        const filtered = lines.filter(line => line.includes(inp.grep));
        logs = filtered.join('\n');
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ project: inp.project, host: hostConfig.name, logs }, null, 2);
      }

      return `## Logs: ${inp.project} (${hostConfig.name})\n\n\`\`\`\n${logs}\n\`\`\``;
    }

    case 'build': {
      const options: {
        service?: string;
        noCache?: boolean;
        pull?: boolean;
      } = {};

      if (inp.service) {
        options.service = inp.service;
      }
      if (inp.no_cache) {
        options.noCache = inp.no_cache;
      }

      await composeService.composeBuild(hostConfig, inp.project, options);
      return `Project '${inp.project}' build completed on ${hostConfig.name}`;
    }

    case 'pull': {
      const options: {
        service?: string;
        ignorePullFailures?: boolean;
        quiet?: boolean;
      } = {};

      if (inp.service) {
        options.service = inp.service;
      }

      await composeService.composePull(hostConfig, inp.project, options);
      return `Project '${inp.project}' pull completed on ${hostConfig.name}`;
    }

    case 'recreate': {
      const options: {
        service?: string;
        forceRecreate?: boolean;
        noDeps?: boolean;
      } = {};

      if (inp.service) {
        options.service = inp.service;
      }

      await composeService.composeRecreate(hostConfig, inp.project, options);
      return `Project '${inp.project}' recreated on ${hostConfig.name}`;
    }

    default:
      // This should never be reached due to Zod validation
      throw new Error(`Unknown subaction: ${inp.subaction}`);
  }
}
