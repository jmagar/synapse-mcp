// src/tools/handlers/scout-zfs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleZfsAction } from './scout-zfs.js';
import type { ServiceContainer } from '../../services/container.js';
import type { ISSHService } from '../../services/interfaces.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { ResponseFormat } from '../../types.js';

// Mock loadHostConfigs
vi.mock('../../services/docker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/docker.js')>();
  return {
    ...actual,
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
    ])
  };
});

describe('Scout ZFS Handler', () => {
  let mockSSHService: Partial<ISSHService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn()
    };

    mockContainer = {
      getSSHService: vi.fn().mockReturnValue(mockSSHService)
    };
  });

  describe('pools subaction', () => {
    it('should list ZFS pools', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME   SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT\n' +
        'tank   10T   5.5T   4.5T        -         -    25%    55%  1.00x    ONLINE  -\n' +
        'rpool  500G  100G   400G        -         -    10%    20%  1.00x    ONLINE  -'
      );

      const result = await handleZfsAction({
        action: 'zfs',
        subaction: 'pools',
        host: 'tootie'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'zpool',
        expect.arrayContaining(['list'])
      );
      expect(result).toContain('tank');
      expect(result).toContain('rpool');
      expect(result).toContain('ONLINE');
    });

    it('should filter by pool name', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME   SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT\n' +
        'tank   10T   5.5T   4.5T        -         -    25%    55%  1.00x    ONLINE  -'
      );

      await handleZfsAction({
        action: 'zfs',
        subaction: 'pools',
        host: 'tootie',
        pool: 'tank'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'zpool',
        expect.arrayContaining(['list', 'tank'])
      );
    });

    it('should return JSON format when requested', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME   SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT\n' +
        'tank   10T   5.5T   4.5T        -         -    25%    55%  1.00x    ONLINE  -'
      );

      const result = await handleZfsAction({
        action: 'zfs',
        subaction: 'pools',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.host).toBe('tootie');
      expect(parsed.output).toContain('tank');
    });
  });

  describe('datasets subaction', () => {
    it('should list ZFS datasets', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME                        USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank                        5.5T  4.5T       192K  /tank\n' +
        'tank/data                   2.0T  4.5T       2.0T  /tank/data\n' +
        'tank/media                  3.5T  4.5T       3.5T  /tank/media'
      );

      const result = await handleZfsAction({
        action: 'zfs',
        subaction: 'datasets',
        host: 'tootie'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'zfs',
        expect.arrayContaining(['list'])
      );
      expect(result).toContain('tank');
      expect(result).toContain('tank/data');
    });

    it('should filter by pool', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME        USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank/data   2.0T  4.5T       2.0T  /tank/data'
      );

      await handleZfsAction({
        action: 'zfs',
        subaction: 'datasets',
        host: 'tootie',
        pool: 'tank'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'zfs',
        expect.arrayContaining(['list', '-r', 'tank'])
      );
    });

    it('should filter by type', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME         USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank/vol1    10G    10G        10G  -'
      );

      await handleZfsAction({
        action: 'zfs',
        subaction: 'datasets',
        host: 'tootie',
        type: 'volume'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'zfs',
        expect.arrayContaining(['-t', 'volume'])
      );
    });

    it('should list recursively when specified', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME              USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank/data         2.0T  4.5T       2.0T  /tank/data\n' +
        'tank/data/backup  500G  4.5T       500G  /tank/data/backup'
      );

      await handleZfsAction({
        action: 'zfs',
        subaction: 'datasets',
        host: 'tootie',
        pool: 'tank/data',
        recursive: true
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'zfs',
        expect.arrayContaining(['-r'])
      );
    });
  });

  describe('snapshots subaction', () => {
    it('should list ZFS snapshots', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME                          USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank/data@daily-2024-01-15     10G      -       2.0T  -\n' +
        'tank/data@daily-2024-01-16     15G      -       2.0T  -'
      );

      const result = await handleZfsAction({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'tootie'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'zfs',
        expect.arrayContaining(['list', '-t', 'snapshot'])
      );
      expect(result).toContain('@daily-2024-01-15');
      expect(result).toContain('@daily-2024-01-16');
    });

    it('should filter by dataset', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME                          USED  AVAIL     REFER  MOUNTPOINT\n' +
        'tank/data@daily-2024-01-15     10G      -       2.0T  -'
      );

      await handleZfsAction({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'tootie',
        dataset: 'tank/data'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'zfs',
        expect.arrayContaining(['list', '-t', 'snapshot', '-r', 'tank/data'])
      );
    });

    it('should limit number of snapshots', async () => {
      const snapshotLines = Array.from({ length: 100 }, (_, i) =>
        `tank/data@snap-${i}     10G      -       2.0T  -`
      ).join('\n');

      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'NAME                          USED  AVAIL     REFER  MOUNTPOINT\n' + snapshotLines
      );

      const result = await handleZfsAction({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'tootie',
        limit: 10
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      // Should only show first 10 snapshots
      expect(result).toContain('snap-0');
      expect(result).not.toContain('snap-50');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleZfsAction({
          action: 'logs',
          subaction: 'syslog'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid action for zfs handler');
    });

    it('should throw on unknown host', async () => {
      // Re-mock to return empty hosts array
      vi.mocked(await import('../../services/docker.js')).loadHostConfigs.mockReturnValue([]);

      await expect(
        handleZfsAction({
          action: 'zfs',
          subaction: 'pools',
          host: 'unknown-host'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });

    it('should handle SSH command failure', async () => {
      // Reset the mock to return hosts again (previous test cleared it)
      vi.mocked(await import('../../services/docker.js')).loadHostConfigs.mockReturnValue([
        { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
      ]);

      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('zpool: command not found'));

      await expect(
        handleZfsAction({
          action: 'zfs',
          subaction: 'pools',
          host: 'tootie'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('zpool: command not found');
    });
  });
});
