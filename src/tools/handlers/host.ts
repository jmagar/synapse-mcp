// src/tools/handlers/host.ts
import type { ServiceContainer } from '../../services/container.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import type { HostConfig } from '../../types.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';
import { formatHostStatusMarkdown, formatHostResourcesMarkdown } from '../../formatters/index.js';
import { escapeShellArg, validateSSHArg, validateSystemdServiceName, isLocalHost } from '../../utils/index.js';
import { logError } from '../../utils/errors.js';

/**
 * Execute command on local or remote host based on configuration
 * Routes to LocalExecutor for localhost, SSH for remote hosts
 */
async function executeCommand(
  host: HostConfig,
  command: string,
  args: string[],
  container: ServiceContainer
): Promise<string> {
  if (isLocalHost(host)) {
    const localExecutor = container.getLocalExecutor();
    return await localExecutor.executeLocalCommand(command, args);
  } else {
    const sshService = container.getSSHService();
    return await sshService.executeSSHCommand(host, command, args);
  }
}

/**
 * Handle all host subactions
 *
 * Subactions: status, resources, info, uptime, services, network, mounts
 */
export async function handleHostAction(
  input: FluxInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'host') {
    throw new Error(`Invalid action for host handler: ${input.action}`);
  }

  const hostName = getHostName(input);
  const dockerService = container.getDockerService();
  const sshService = container.getSSHService();
  const hosts = loadHostConfigs();
  const format = input.response_format ?? ResponseFormat.MARKDOWN;

  // Find the target host (can query all hosts if not specified for some actions)
  const hostConfig = hostName ? hosts.find(h => h.name === hostName) : undefined;

  // For most operations, require the host
  if (hostName && !hostConfig) {
    throw new Error(`Host not found: ${hostName}`);
  }

  switch (input.subaction) {
    case 'status': {
      // For status, we can check all hosts or specific host
      const targetHosts = hostConfig ? [hostConfig] : hosts;
      const statusResults = await Promise.all(
        targetHosts.map(async (h) => {
          try {
            const info = await dockerService.getDockerInfo(h);
            const containers = await dockerService.listContainers([h]);
            const runningCount = containers.filter(c => c.state === 'running').length;
            return {
              name: h.name,
              connected: true,
              containerCount: containers.length,
              runningCount,
              dockerVersion: info.dockerVersion,
              error: undefined
            };
          } catch (err) {
            logError(err, {
              operation: 'handleHostAction:status',
              metadata: { host: h.name, action: 'status' }
            });
            return {
              name: h.name,
              connected: false,
              containerCount: 0,
              runningCount: 0,
              dockerVersion: undefined,
              error: err instanceof Error ? err.message : 'Unknown error'
            };
          }
        })
      );

      if (format === ResponseFormat.JSON) {
        // Return single object for single host, array for multiple
        if (hostConfig) {
          return JSON.stringify(statusResults[0], null, 2);
        }
        return JSON.stringify(statusResults, null, 2);
      }

      return formatHostStatusMarkdown(statusResults);
    }

    case 'resources': {
      // Resources requires SSH, must have a specific host
      const targetHosts = hostConfig ? [hostConfig] : hosts;
      const resourceResults = await Promise.all(
        targetHosts.map(async (h) => {
          try {
            const resources = await sshService.getHostResources(h);
            return { host: h.name, resources, error: undefined };
          } catch (err) {
            logError(err, {
              operation: 'handleHostAction:resources',
              metadata: { host: h.name, action: 'resources' }
            });
            return {
              host: h.name,
              resources: null,
              error: err instanceof Error ? err.message : 'Unknown error'
            };
          }
        })
      );

      if (format === ResponseFormat.JSON) {
        if (hostConfig) {
          return JSON.stringify(resourceResults[0], null, 2);
        }
        return JSON.stringify(resourceResults, null, 2);
      }

      return formatHostResourcesMarkdown(resourceResults);
    }

    case 'info': {
      if (!hostConfig) {
        throw new Error('Host is required for host:info');
      }

      const output = await executeCommand(hostConfig, 'uname', ['-a'], container);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, info: output.trim() }, null, 2);
      }

      return `## System Info - ${hostConfig.name}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'uptime': {
      if (!hostConfig) {
        throw new Error('Host is required for host:uptime');
      }

      const output = await executeCommand(hostConfig, 'uptime', [], container);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, uptime: output.trim() }, null, 2);
      }

      return `## Uptime - ${hostConfig.name}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'services': {
      if (!hostConfig) {
        throw new Error('Host is required for host:services');
      }

      const state = getOptionalString(input.state, 'state');
      const service = getOptionalString(input.service, 'service');

      // SECURITY: Validate user-provided parameters to prevent command injection
      // The SSH service joins args with spaces and executes as shell command,
      // so we must reject shell metacharacters like ; | & ` $ etc.
      if (state && state !== 'all') {
        validateSSHArg(state, 'state');
      }
      if (service) {
        validateSystemdServiceName(service);
      }

      // Build systemctl command based on options
      const args = ['list-units', '--type=service', '--no-pager'];
      if (state && state !== 'all') {
        const safeState = escapeShellArg(state);
        args.push(`--state=${safeState}`);
      }
      if (service) {
        const safeService = escapeShellArg(service);
        args.push(safeService);
      }

      const output = await executeCommand(hostConfig, 'systemctl', args, container);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, services: output.trim() }, null, 2);
      }

      return `## Systemd Services - ${hostConfig.name}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'network': {
      if (!hostConfig) {
        throw new Error('Host is required for host:network');
      }

      // Use ip addr or ifconfig
      let output: string;
      try {
        output = await executeCommand(hostConfig, 'ip', ['addr', 'show'], container);
      } catch {
        // Fallback to ifconfig if ip command not available
        output = await executeCommand(hostConfig, 'ifconfig', ['-a'], container);
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, network: output.trim() }, null, 2);
      }

      return `## Network Interfaces - ${hostConfig.name}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'mounts': {
      if (!hostConfig) {
        throw new Error('Host is required for host:mounts');
      }

      const output = await executeCommand(hostConfig, 'df', ['-h'], container);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostConfig.name, mounts: output.trim() }, null, 2);
      }

      return `## Mounted Filesystems - ${hostConfig.name}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    default:
      // This should never be reached due to Zod validation
      throw new Error(`Unknown subaction: ${input.subaction}`);
  }
}

function getHostName(input: FluxInput): string | undefined {
  if (!('host' in input)) {
    return undefined;
  }
  const hostValue = input.host;
  if (hostValue === undefined) {
    return undefined;
  }
  if (typeof hostValue === 'string') {
    return hostValue;
  }
  throw new Error('Invalid host: expected string');
}

function getOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`Invalid ${fieldName}: expected string`);
}
