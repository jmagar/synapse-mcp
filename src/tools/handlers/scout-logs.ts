// src/tools/handlers/scout-logs.ts
import type { ServiceContainer } from '../../services/container.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';

/**
 * Handle all logs subactions
 *
 * Subactions: syslog, journal, dmesg, auth
 */
export async function handleLogsAction(
  input: ScoutInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'logs') {
    throw new Error(`Invalid action for logs handler: ${input.action}`);
  }

  const sshService = container.getSSHService();
  const hosts = loadHostConfigs();
  const format = (input as Record<string, unknown>).response_format ?? ResponseFormat.MARKDOWN;

  // Use type assertion to access subaction-specific fields
  const inp = input as Record<string, unknown>;

  // Find the target host
  const hostName = inp.host as string;
  const hostConfig = hosts.find(h => h.name === hostName);

  if (!hostConfig) {
    throw new Error(`Host not found: ${hostName}`);
  }

  const lines = (inp.lines as number) ?? 100;
  const grep = inp.grep as string | undefined;

  switch (inp.subaction) {
    case 'syslog': {
      const args = ['-n', String(lines), '/var/log/syslog'];
      const command = 'tail';

      let output: string;
      if (grep) {
        // Use tail piped to grep
        output = await sshService.executeSSHCommand(
          hostConfig,
          `tail -n ${lines} /var/log/syslog | grep '${grep}'`,
          []
        );
      } else {
        output = await sshService.executeSSHCommand(hostConfig, command, args);
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: hostConfig.name,
          subaction: 'syslog',
          lines,
          grep,
          output: output.trim()
        }, null, 2);
      }

      return output.trim();
    }

    case 'journal': {
      const args = ['-n', String(lines), '--no-pager'];

      // Add unit filter
      const unit = inp.unit as string | undefined;
      if (unit) {
        args.push('-u', unit);
      }

      // Add time range filters
      const since = inp.since as string | undefined;
      const until = inp.until as string | undefined;
      if (since) {
        args.push('--since', since);
      }
      if (until) {
        args.push('--until', until);
      }

      // Add priority filter
      const priority = inp.priority as string | undefined;
      if (priority) {
        args.push('-p', priority);
      }

      const output = await sshService.executeSSHCommand(hostConfig, 'journalctl', args);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: hostConfig.name,
          subaction: 'journal',
          lines,
          unit,
          since,
          until,
          priority,
          output: output.trim()
        }, null, 2);
      }

      return output.trim();
    }

    case 'dmesg': {
      let output: string;
      if (grep) {
        // Use dmesg piped to grep with tail
        output = await sshService.executeSSHCommand(
          hostConfig,
          `dmesg --color=never | grep '${grep}' | tail -n ${lines}`,
          []
        );
      } else {
        // Execute dmesg with args, pipe output to tail
        const dmesgOutput = await sshService.executeSSHCommand(
          hostConfig,
          'dmesg',
          ['--color=never']
        );
        // Apply tail locally (limit lines)
        const outputLines = dmesgOutput.trim().split('\n');
        output = outputLines.slice(-lines).join('\n');
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: hostConfig.name,
          subaction: 'dmesg',
          lines,
          grep,
          output: output.trim()
        }, null, 2);
      }

      return output.trim();
    }

    case 'auth': {
      const args = ['-n', String(lines), '/var/log/auth.log'];
      const command = 'tail';

      let output: string;
      if (grep) {
        // Use tail piped to grep
        output = await sshService.executeSSHCommand(
          hostConfig,
          `tail -n ${lines} /var/log/auth.log | grep '${grep}'`,
          []
        );
      } else {
        output = await sshService.executeSSHCommand(hostConfig, command, args);
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({
          host: hostConfig.name,
          subaction: 'auth',
          lines,
          grep,
          output: output.trim()
        }, null, 2);
      }

      return output.trim();
    }

    default:
      // This should never be reached due to Zod validation
      throw new Error(`Unknown subaction: ${inp.subaction}`);
  }
}
