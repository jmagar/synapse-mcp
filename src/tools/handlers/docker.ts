// src/tools/handlers/docker.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';
import {
  formatDockerInfoMarkdown,
  formatDockerDfMarkdown,
  formatPruneMarkdown,
  formatImagesMarkdown
} from '../../formatters/index.js';

/**
 * Handle all docker subactions
 *
 * Subactions: info, df, prune, images, pull, build, rmi, networks, volumes
 */
export async function handleDockerAction(
  input: FluxInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'docker') {
    throw new Error(`Invalid action for docker handler: ${input.action}`);
  }

  const dockerService = container.getDockerService();
  const hosts = loadHostConfigs();
  const format = input.response_format ?? ResponseFormat.MARKDOWN;

  // Use type assertion to access subaction-specific fields
  const inp = input as Record<string, unknown>;

  // Find the target host (some docker subactions may query all hosts if not specified)
  const hostName = inp.host as string | undefined;
  const hostConfig = hostName ? hosts.find(h => h.name === hostName) : undefined;

  // For single-host operations, require the host
  if (hostName && !hostConfig) {
    throw new Error(`Host not found: ${hostName}`);
  }

  switch (inp.subaction) {
    case 'info': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:info');
      }
      const info = await dockerService.getDockerInfo(hostConfig);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(info, null, 2);
      }

      return formatDockerInfoMarkdown([{ host: hostConfig.name, info }]);
    }

    case 'df': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:df');
      }
      const usage = await dockerService.getDockerDiskUsage(hostConfig);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(usage, null, 2);
      }

      return formatDockerDfMarkdown([{ host: hostConfig.name, usage }]);
    }

    case 'prune': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:prune');
      }

      // Require force flag for prune operations
      if (!inp.force) {
        throw new Error('Prune requires force=true to prevent accidental data loss');
      }

      const target = inp.prune_target as "containers" | "images" | "volumes" | "networks" | "buildcache" | "all";
      const results = await dockerService.pruneDocker(hostConfig, target);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, results }, null, 2);
      }

      return formatPruneMarkdown([{ host: hostConfig.name, results }]);
    }

    case 'images': {
      // Can query all hosts or specific host
      const targetHosts = hostConfig ? [hostConfig] : hosts;

      const options: { danglingOnly?: boolean } = {};
      if (inp.dangling_only) {
        options.danglingOnly = true;
      }

      const images = await dockerService.listImages(targetHosts, options);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(images, null, 2);
      }

      // Apply pagination
      const offset = (inp.offset as number) ?? 0;
      const limit = (inp.limit as number) ?? 50;
      const total = images.length;
      const paginatedImages = images.slice(offset, offset + limit);

      return formatImagesMarkdown(paginatedImages, total, offset);
    }

    case 'pull': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:pull');
      }

      const imageName = inp.image as string;
      const result = await dockerService.pullImage(imageName, hostConfig);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, image: imageName, ...result }, null, 2);
      }

      return `Image '${imageName}' pull completed on ${hostConfig.name}: ${result.status}`;
    }

    case 'build': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:build');
      }

      const options = {
        context: inp.context as string,
        tag: inp.tag as string,
        dockerfile: inp.dockerfile as string | undefined,
        noCache: inp.no_cache as boolean | undefined
      };

      const result = await dockerService.buildImage(hostConfig, options);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, ...options, ...result }, null, 2);
      }

      return `Image '${options.tag}' build completed on ${hostConfig.name}: ${result.status}`;
    }

    case 'rmi': {
      if (!hostConfig) {
        throw new Error('Host is required for docker:rmi');
      }

      const imageName = inp.image as string;
      const force = inp.force as boolean;
      const result = await dockerService.removeImage(imageName, hostConfig, { force });

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, image: imageName, ...result }, null, 2);
      }

      return `Image '${imageName}' removed from ${hostConfig.name}: ${result.status}`;
    }

    case 'networks': {
      // listNetworks method not yet implemented in IDockerService
      throw new Error('docker:networks subaction not yet implemented');
    }

    case 'volumes': {
      // listVolumes method not yet implemented in IDockerService
      throw new Error('docker:volumes subaction not yet implemented');
    }

    default:
      // This should never be reached due to Zod validation
      throw new Error(`Unknown subaction: ${inp.subaction}`);
  }
}
