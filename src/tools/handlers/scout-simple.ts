// src/tools/handlers/scout-simple.ts
import type { ServiceContainer } from '../../services/container.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { loadHostConfigs } from '../../services/docker.js';
import type { HostConfig } from '../../types.js';
import { ResponseFormat } from '../../types.js';
import { DEFAULT_COMMAND_TIMEOUT, DEFAULT_MAX_FILE_SIZE, MAX_COMMAND_TIMEOUT } from '../../constants.js';
import { escapeShellArg } from '../../utils/path-security.js';

// Simple actions that this handler can process
const SIMPLE_ACTIONS = ['nodes', 'peek', 'exec', 'find', 'delta', 'emit', 'beam', 'ps', 'df'];

/**
 * Valid sort options for 'ps' command.
 * SECURITY NOTE: These values are passed directly to `ps --sort -${sort}`.
 * The Zod schema (scoutPsSchema) validates against z.enum(['cpu', 'mem', 'pid', 'time']),
 * but we maintain this const array as defense-in-depth in case the enum is extended
 * with values that could be interpreted differently by the shell or ps command.
 * Any new sort options MUST be alphanumeric and safe for shell arguments.
 */
const VALID_PS_SORTS = ['cpu', 'mem', 'pid', 'time'] as const;
type ValidPsSort = typeof VALID_PS_SORTS[number];

/**
 * Parse target string in format 'hostname:/path'
 */
function parseTarget(target: string): { host: string; path: string } {
  const colonIndex = target.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid target format: ${target}. Expected hostname:/path`);
  }
  return {
    host: target.slice(0, colonIndex),
    path: target.slice(colonIndex + 1)
  };
}

/**
 * Handle all Scout simple actions (9 actions without subactions)
 *
 * Actions: nodes, peek, exec, find, delta, emit, beam, ps, df
 */
export async function handleScoutSimpleAction(
  input: ScoutInput,
  container: ServiceContainer
): Promise<string> {
  // Type guard: help action should not reach this handler
  if (input.action === 'help') {
    throw new Error('Help action should be handled by the main scout handler');
  }

  if (!SIMPLE_ACTIONS.includes(input.action)) {
    throw new Error(`Not a simple action: ${input.action}`);
  }

  const sshService = container.getSSHService();
  const fileService = container.getFileService();
  const hosts = loadHostConfigs();
  const format = input.response_format ?? ResponseFormat.MARKDOWN;

  // Helper to find host config by name
  const findHost = (name: string): HostConfig => {
    const hostConfig = hosts.find(h => h.name === name);
    if (!hostConfig) {
      throw new Error(`Host not found: ${name}`);
    }
    return hostConfig;
  };

  switch (input.action) {
    case 'nodes': {
      // List all configured SSH hosts
      const hostList = hosts.map(h => ({
        name: h.name,
        host: h.host,
        protocol: h.protocol,
        port: h.port
      }));

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(hostList, null, 2);
      }

      const lines = ['## Configured Hosts', ''];
      for (const h of hostList) {
        lines.push(`- **${h.name}**: ${h.host} (${h.protocol}:${h.port})`);
      }
      return lines.join('\n');
    }

    case 'peek': {
      const inp = input as { target: string; tree?: boolean; depth?: number };
      const { host: hostName, path } = parseTarget(inp.target);
      const hostConfig = findHost(hostName);

      if (inp.tree) {
        // Show directory tree
        const treeOutput = await fileService.treeDirectory(hostConfig, path, inp.depth ?? 3);

        if (format === ResponseFormat.JSON) {
          return JSON.stringify({ host: hostName, path, tree: treeOutput }, null, 2);
        }

        return `## Tree - ${hostName}:${path}\n\n\`\`\`\n${treeOutput}\n\`\`\``;
      }

      // Try reading as file first
      try {
        const result = await fileService.readFile(hostConfig, path, DEFAULT_MAX_FILE_SIZE);

        if (format === ResponseFormat.JSON) {
          return JSON.stringify({
            host: hostName,
            path,
            content: result.content,
            size: result.size,
            truncated: result.truncated
          }, null, 2);
        }

        const truncNote = result.truncated ? `\n\n*Truncated (showing ${result.size} bytes)*` : '';
        return `## ${hostName}:${path}\n\n\`\`\`\n${result.content}\n\`\`\`${truncNote}`;
      } catch (err) {
        // If file read fails, try listing as directory
        if (err instanceof Error && err.message.toLowerCase().includes('directory')) {
          const listing = await fileService.listDirectory(hostConfig, path, false);

          if (format === ResponseFormat.JSON) {
            return JSON.stringify({ host: hostName, path, listing }, null, 2);
          }

          return `## Directory - ${hostName}:${path}\n\n\`\`\`\n${listing}\n\`\`\``;
        }
        throw err;
      }
    }

    case 'exec': {
      const inp = input as { target: string; command: string; timeout: number };
      const { host: hostName, path } = parseTarget(inp.target);
      const hostConfig = findHost(hostName);

      const result = await fileService.executeCommand(hostConfig, path, inp.command, inp.timeout);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: hostName,
          path,
          command: inp.command,
          stdout: result.stdout,
          exitCode: result.exitCode
        }, null, 2);
      }

      const exitNote = result.exitCode !== 0 ? `\n\n*Exit code: ${result.exitCode}*` : '';
      return `## Command Output - ${hostName}:${path}\n\n\`\`\`\n${result.stdout}\n\`\`\`${exitNote}`;
    }

    case 'find': {
      const inp = input as { target: string; pattern: string; depth?: number; limit?: number };
      const { host: hostName, path } = parseTarget(inp.target);
      const hostConfig = findHost(hostName);

      const results = await fileService.findFiles(hostConfig, path, inp.pattern, {
        maxDepth: inp.depth,
        limit: inp.limit
      });

      if (format === ResponseFormat.JSON) {
        const files = results.trim().split('\n').filter(Boolean);
        return JSON.stringify({ host: hostName, path, pattern: inp.pattern, files }, null, 2);
      }

      return `## Find Results - ${hostName}:${path}\n\nPattern: \`${inp.pattern}\`\n\n\`\`\`\n${results}\n\`\`\``;
    }

    case 'delta': {
      const inp = input as { source: string; target?: string; content?: string };

      // Source is always a remote file
      const { host: sourceHostName, path: sourcePath } = parseTarget(inp.source);
      const sourceHost = findHost(sourceHostName);

      if (inp.content !== undefined) {
        // Compare file against provided content
        const fileResult = await fileService.readFile(sourceHost, sourcePath, DEFAULT_MAX_FILE_SIZE);

        if (fileResult.content === inp.content) {
          if (format === ResponseFormat.JSON) {
            return JSON.stringify({ identical: true, source: inp.source }, null, 2);
          }
          return `Files are identical`;
        }

        if (format === ResponseFormat.JSON) {
          return JSON.stringify({
            identical: false,
            source: inp.source,
            sourceContent: fileResult.content,
            providedContent: inp.content
          }, null, 2);
        }

        return `## File Comparison\n\nFiles differ between ${inp.source} and provided content`;
      }

      if (inp.target) {
        // Compare two remote files
        const { host: targetHostName, path: targetPath } = parseTarget(inp.target);
        const targetHost = findHost(targetHostName);

        const diff = await fileService.diffFiles(sourceHost, sourcePath, targetHost, targetPath, 3);

        if (format === ResponseFormat.JSON) {
          return JSON.stringify({
            source: inp.source,
            target: inp.target,
            diff
          }, null, 2);
        }

        if (!diff || diff.trim() === '') {
          return `Files are identical`;
        }

        return `## Diff\n\n\`\`\`diff\n${diff}\n\`\`\``;
      }

      throw new Error('delta requires either target or content parameter');
    }

    case 'emit': {
      const inp = input as { targets: string[]; command?: string; timeout?: unknown };

      if (!inp.command) {
        throw new Error('emit requires a command parameter');
      }

      const command = inp.command;
      const timeoutValue = Number(inp.timeout);
      const timeout = Number.isFinite(timeoutValue) && timeoutValue > 0 && timeoutValue <= MAX_COMMAND_TIMEOUT
        ? timeoutValue
        : DEFAULT_COMMAND_TIMEOUT;

      // Execute command on all targets in parallel
      const results = await Promise.all(
        inp.targets.map(async (target) => {
          const { host: hostName, path } = parseTarget(target);
          const hostConfig = findHost(hostName);

          try {
            const result = await fileService.executeCommand(hostConfig, path, command, timeout);
            return { host: hostName, path, stdout: result.stdout, exitCode: result.exitCode, error: undefined };
          } catch (err) {
            return { host: hostName, path, stdout: '', exitCode: -1, error: err instanceof Error ? err.message : 'Unknown error' };
          }
        })
      );

      if (format === ResponseFormat.JSON) {
        return JSON.stringify(results, null, 2);
      }

      const lines = ['## Multi-Host Command Results', '', `Command: \`${inp.command}\``, ''];
      for (const r of results) {
        lines.push(`### ${r.host}:${r.path}`);
        if (r.error) {
          lines.push(`\n**Error:** ${r.error}\n`);
        } else {
          lines.push(`\n\`\`\`\n${r.stdout}\n\`\`\`\n`);
          if (r.exitCode !== 0) {
            lines.push(`*Exit code: ${r.exitCode}*\n`);
          }
        }
      }
      return lines.join('\n');
    }

    case 'beam': {
      const inp = input as { source: string; destination: string };

      const { host: sourceHostName, path: sourcePath } = parseTarget(inp.source);
      const { host: destHostName, path: destPath } = parseTarget(inp.destination);

      const sourceHost = findHost(sourceHostName);
      const destHost = findHost(destHostName);

      const result = await fileService.transferFile(sourceHost, sourcePath, destHost, destPath);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          source: inp.source,
          destination: inp.destination,
          bytesTransferred: result.bytesTransferred,
          warning: result.warning
        }, null, 2);
      }

      const warningNote = result.warning ? `\n\n**Warning:** ${result.warning}` : '';
      return `## File Transfer Complete\n\n- **From:** ${inp.source}\n- **To:** ${inp.destination}\n- **Bytes:** ${result.bytesTransferred}${warningNote}`;
    }

    case 'ps': {
      const inp = input as { host: string; grep?: string; user?: string; sort?: ValidPsSort; limit?: number };
      const hostConfig = findHost(inp.host);

      // Build ps command with options
      // SECURITY: Defense-in-depth validation - sort is already validated by Zod enum in scoutPsSchema,
      // but we verify here to guard against schema changes that might introduce unsafe values.
      const sortValue = inp.sort || 'cpu';
      if (!VALID_PS_SORTS.includes(sortValue)) {
        throw new Error(`Invalid sort option: ${sortValue}. Must be one of: ${VALID_PS_SORTS.join(', ')}`);
      }
      const args = ['aux', '--sort', `-${sortValue}`];

      let output = await sshService.executeSSHCommand(hostConfig, 'ps', args);

      // Apply filters
      const grepFilter = inp.grep;
      const userFilter = inp.user;
      const lines = output.split('\n');
      const header = lines[0] || '';
      let filtered = lines.slice(1);

      if (userFilter) {
        filtered = filtered.filter(line => line.startsWith(userFilter));
      }
      if (grepFilter) {
        filtered = filtered.filter(line => line.includes(grepFilter));
      }
      if (inp.limit) {
        filtered = filtered.slice(0, inp.limit);
      }

      output = [header, ...filtered].join('\n');

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: inp.host, processes: output }, null, 2);
      }

      return `## Processes - ${inp.host}\n\n\`\`\`\n${output}\n\`\`\``;
    }

    case 'df': {
      const inp = input as { host: string; path?: string; human_readable?: boolean };
      const hostConfig = findHost(inp.host);

      const args: string[] = [];
      if (inp.human_readable !== false) {
        args.push('-h');
      }
      if (inp.path) {
        // SECURITY: Path is already validated by safePathSchema in scoutDfSchema,
        // but we escape it here as defense-in-depth against any schema bypass.
        args.push(escapeShellArg(inp.path));
      }

      const output = await sshService.executeSSHCommand(hostConfig, 'df', args);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: inp.host, diskUsage: output }, null, 2);
      }

      return `## Disk Usage - ${inp.host}\n\n\`\`\`\n${output}\n\`\`\``;
    }

    default:
      throw new Error(`Unknown action: ${input.action}`);
  }
}
