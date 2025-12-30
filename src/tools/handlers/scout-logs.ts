// src/tools/handlers/scout-logs.ts
import type { ServiceContainer } from '../../services/container.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { scoutLogsSchema } from '../../schemas/scout/logs.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';

/**
 * Format logs response based on response format
 */
function formatLogsResponse(
  format: ResponseFormat,
  data: {
    host: string;
    subaction: string;
    [key: string]: unknown;
  },
  output: string
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(
      {
        ...data,
        output: output.trim()
      },
      null,
      2
    );
  }

  return output.trim();
}

/**
 * Handle all logs subactions
 *
 * Subactions: syslog, journal, dmesg, auth
 *
 * SECURITY: Grep patterns are validated by shellGrepSchema in the Zod schema
 * to prevent command injection. Shell metacharacters and patterns > 200 chars
 * are rejected at the schema level before reaching this handler.
 */
export async function handleLogsAction(
  input: ScoutInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'logs') {
    throw new Error(`Invalid action for logs handler: ${input.action}`);
  }

  // Validate and parse with the specific logs schema
  const parseResult = scoutLogsSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(`Invalid logs input: ${JSON.stringify(parseResult.error.issues)}`);
  }

  const validatedInput = parseResult.data;
  const sshService = container.getSSHService();
  const hosts = loadHostConfigs();
  const format = validatedInput.response_format ?? ResponseFormat.MARKDOWN;

  // Find the target host
  const hostConfig = hosts.find(h => h.name === validatedInput.host);

  if (!hostConfig) {
    throw new Error(`Host not found: ${validatedInput.host}`);
  }

  const lines = validatedInput.lines;
  const grep = validatedInput.grep;

  switch (validatedInput.subaction) {
    case 'syslog': {
      const args = ['-n', String(lines), '/var/log/syslog'];
      const command = 'tail';

      let output: string;
      if (grep) {
        // SECURITY: grep pattern validated by shellGrepSchema
        // Use tail piped to grep
        output = await sshService.executeSSHCommand(
          hostConfig,
          `tail -n ${lines} /var/log/syslog | grep '${grep}'`,
          []
        );
      } else {
        output = await sshService.executeSSHCommand(hostConfig, command, args);
      }

      return formatLogsResponse(
        format,
        {
          host: hostConfig.name,
          subaction: 'syslog',
          lines,
          grep
        },
        output
      );
    }

    case 'journal': {
      const args = ['-n', String(lines), '--no-pager'];

      // Add unit filter
      if (validatedInput.unit) {
        args.push('-u', validatedInput.unit);
      }

      // Add time range filters
      if (validatedInput.since) {
        args.push('--since', validatedInput.since);
      }
      if (validatedInput.until) {
        args.push('--until', validatedInput.until);
      }

      // Add priority filter
      if (validatedInput.priority) {
        args.push('-p', validatedInput.priority);
      }

      let output = await sshService.executeSSHCommand(hostConfig, 'journalctl', args);

      // Apply local grep filtering if provided
      if (grep) {
        const outputLines = output.split('\n');
        output = outputLines.filter(line => line.includes(grep)).join('\n');
      }

      return formatLogsResponse(
        format,
        {
          host: hostConfig.name,
          subaction: 'journal',
          lines,
          unit: validatedInput.unit,
          since: validatedInput.since,
          until: validatedInput.until,
          priority: validatedInput.priority,
          grep
        },
        output
      );
    }

    case 'dmesg': {
      let output: string;
      if (grep) {
        // SECURITY: grep pattern validated by shellGrepSchema
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

      return formatLogsResponse(
        format,
        {
          host: hostConfig.name,
          subaction: 'dmesg',
          lines,
          grep
        },
        output
      );
    }

    case 'auth': {
      const args = ['-n', String(lines), '/var/log/auth.log'];
      const command = 'tail';

      let output: string;
      if (grep) {
        // SECURITY: grep pattern validated by shellGrepSchema
        // Use tail piped to grep
        output = await sshService.executeSSHCommand(
          hostConfig,
          `tail -n ${lines} /var/log/auth.log | grep '${grep}'`,
          []
        );
      } else {
        output = await sshService.executeSSHCommand(hostConfig, command, args);
      }

      return formatLogsResponse(
        format,
        {
          host: hostConfig.name,
          subaction: 'auth',
          lines,
          grep
        },
        output
      );
    }

    default: {
      // This should never be reached due to Zod validation
      const exhaustiveCheck: never = validatedInput;
      throw new Error(`Unknown subaction: ${(exhaustiveCheck as { subaction: string }).subaction}`);
    }
  }
}
