// src/tools/handlers/compose-handlers.ts
import type { ServiceContainer } from '../../services/container.js';
import type { HostConfig } from '../../types.js';
import type {
  ComposeUpInput,
  ComposeDownInput,
  ComposeRestartInput,
  ComposeLogsInput,
  ComposeBuildInput,
  ComposePullInput,
  ComposeRecreateInput
} from '../../schemas/flux/compose.js';
import { HostResolver } from '../../services/host-resolver.js';
import { withCacheInvalidation } from './compose-utils.js';

/**
 * Format compose operation result as markdown
 */
function formatComposeResult(
  operation: string,
  hostName: string,
  projectName: string,
  result?: string
): string {
  const action = operation.charAt(0).toUpperCase() + operation.slice(1);
  return `Project '${projectName}' ${operation} completed on ${hostName}${result ? `\n${result}` : ''}`;
}

/**
 * Handle compose up operation with cache invalidation
 */
export async function handleComposeUp(
  input: ComposeUpInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      await container.getComposeServiceWithDiscovery().composeUp(
        host,
        input.project,
        input.detach ?? true
      );
      return formatComposeResult('started', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeUp'
  );
}

/**
 * Handle compose down operation with cache invalidation
 */
export async function handleComposeDown(
  input: ComposeDownInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  // Validate force requirement for remove_volumes
  if (input.remove_volumes && !input.force) {
    throw new Error('Compose down with remove_volumes requires force=true to prevent accidental data loss');
  }

  return withCacheInvalidation(
    async () => {
      await container.getComposeServiceWithDiscovery().composeDown(
        host,
        input.project,
        input.remove_volumes ?? false
      );
      return formatComposeResult('stopped', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeDown'
  );
}

/**
 * Handle compose restart operation with cache invalidation
 */
export async function handleComposeRestart(
  input: ComposeRestartInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      await container.getComposeServiceWithDiscovery().composeRestart(host, input.project);
      return formatComposeResult('restarted', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeRestart'
  );
}

/**
 * Handle compose logs operation with cache invalidation
 */
export async function handleComposeLogs(
  input: ComposeLogsInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      const options: {
        tail?: number;
        since?: string;
        until?: string;
        services?: string[];
      } = {};

      if (input.lines !== undefined) {
        options.tail = input.lines;
      }
      if (input.since) {
        options.since = input.since;
      }
      if (input.until) {
        options.until = input.until;
      }
      if (input.service) {
        options.services = [input.service];
      }

      let logs = await container.getComposeServiceWithDiscovery().composeLogs(
        host,
        input.project,
        options
      );

      // Apply grep filter if specified
      if (input.grep) {
        const lines = logs.split('\n');
        const filtered = lines.filter(line => line.includes(input.grep!));
        logs = filtered.join('\n');
      }

      return `## Logs: ${input.project} (${host.name})\n\n\`\`\`\n${logs}\n\`\`\``;
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeLogs'
  );
}

/**
 * Handle compose build operation with cache invalidation
 */
export async function handleComposeBuild(
  input: ComposeBuildInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      const options: {
        service?: string;
        noCache?: boolean;
        pull?: boolean;
      } = {};

      if (input.service) {
        options.service = input.service;
      }
      if (input.no_cache) {
        options.noCache = input.no_cache;
      }

      await container.getComposeServiceWithDiscovery().composeBuild(
        host,
        input.project,
        options
      );
      return formatComposeResult('build', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeBuild'
  );
}

/**
 * Handle compose pull operation with cache invalidation
 */
export async function handleComposePull(
  input: ComposePullInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      const options: {
        service?: string;
        ignorePullFailures?: boolean;
        quiet?: boolean;
      } = {};

      if (input.service) {
        options.service = input.service;
      }

      await container.getComposeServiceWithDiscovery().composePull(
        host,
        input.project,
        options
      );
      return formatComposeResult('pull', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposePull'
  );
}

/**
 * Handle compose recreate operation with cache invalidation
 */
export async function handleComposeRecreate(
  input: ComposeRecreateInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<string> {
  const resolver = new HostResolver(container.getComposeDiscovery(), hosts);
  const host = await resolver.resolveHost(input.project, input.host);

  return withCacheInvalidation(
    async () => {
      const options: {
        service?: string;
        forceRecreate?: boolean;
        noDeps?: boolean;
      } = {};

      if (input.service) {
        options.service = input.service;
      }

      await container.getComposeServiceWithDiscovery().composeRecreate(
        host,
        input.project,
        options
      );
      return formatComposeResult('recreated', host.name, input.project);
    },
    input.project,
    host.name,
    container.getComposeDiscovery(),
    'handleComposeRecreate'
  );
}
