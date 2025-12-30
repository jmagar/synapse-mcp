// src/tools/handlers/scout-zfs.ts
import type { ServiceContainer } from '../../services/container.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { scoutZfsSchema } from '../../schemas/scout/zfs.js';
import { loadHostConfigs } from '../../services/docker.js';
import { ResponseFormat } from '../../types.js';

/**
 * Handle all Scout ZFS subactions
 *
 * Subactions: pools, datasets, snapshots
 */
export async function handleZfsAction(
  input: ScoutInput,
  container: ServiceContainer
): Promise<string> {
  if (input.action !== 'zfs') {
    throw new Error(`Invalid action for zfs handler: ${input.action}`);
  }

  const sshService = container.getSSHService();
  const hosts = loadHostConfigs();
  // Validate pool/dataset inputs at the handler boundary before SSH execution.
  const parsed = scoutZfsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Scout ZFS input validation failed: ${JSON.stringify(parsed.error.issues)}`);
  }
  const validated = parsed.data;
  const format = validated.response_format ?? ResponseFormat.MARKDOWN;

  // Find the target host
  const hostName = validated.host;
  const hostConfig = hosts.find(h => h.name === hostName);
  if (!hostConfig) {
    throw new Error(`Host not found: ${hostName}`);
  }

  switch (validated.subaction) {
    case 'pools': {
      const { pool } = validated;

      // Build zpool list command
      const args = ['list'];
      if (pool) {
        args.push(pool);
      }

      const output = await sshService.executeSSHCommand(hostConfig, 'zpool', args);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostName, subaction: 'pools', output: output.trim() }, null, 2);
      }

      return `## ZFS Pools - ${hostName}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'datasets': {
      const { pool, type, recursive } = validated;

      // Build zfs list command
      const args = ['list'];

      if (type) {
        args.push('-t', type);
      }

      if (recursive || pool) {
        args.push('-r');
      }

      if (pool) {
        args.push(pool);
      }

      const output = await sshService.executeSSHCommand(hostConfig, 'zfs', args);

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostName, subaction: 'datasets', output: output.trim() }, null, 2);
      }

      return `## ZFS Datasets - ${hostName}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    case 'snapshots': {
      const { pool, dataset, limit } = validated;

      // Build zfs list command for snapshots
      const args = ['list', '-t', 'snapshot'];

      // If dataset is specified, list recursively under that dataset
      if (dataset) {
        args.push('-r', dataset);
      } else if (pool) {
        args.push('-r', pool);
      }

      let output = await sshService.executeSSHCommand(hostConfig, 'zfs', args);

      // Apply limit if specified
      if (limit !== undefined) {
        const lines = output.split('\n');
        const header = lines[0] || '';
        const snapshotLines = lines.slice(1, limit + 1);
        output = [header, ...snapshotLines].join('\n');
      }

      if (format === ResponseFormat.JSON) {
        return JSON.stringify({ host: hostName, subaction: 'snapshots', output: output.trim() }, null, 2);
      }

      return `## ZFS Snapshots - ${hostName}\n\n\`\`\`\n${output.trim()}\n\`\`\``;
    }

    default:
      throw new Error('Unknown subaction');
  }
}
