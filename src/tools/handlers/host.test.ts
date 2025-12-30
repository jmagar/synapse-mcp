// src/tools/handlers/host.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHostAction } from './host.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService, ISSHService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';
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

describe('Host Handler', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockSSHService: Partial<ISSHService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockDockerService = {
      listContainers: vi.fn(),
      getDockerInfo: vi.fn()
    };

    mockSSHService = {
      getHostResources: vi.fn(),
      executeSSHCommand: vi.fn()
    };

    mockContainer = {
      getDockerService: vi.fn().mockReturnValue(mockDockerService),
      getSSHService: vi.fn().mockReturnValue(mockSSHService)
    };
  });

  describe('status subaction', () => {
    it('should check docker connectivity', async () => {
      const mockInfo = {
        dockerVersion: '24.0.0',
        apiVersion: '1.43',
        os: 'linux',
        arch: 'x86_64',
        kernelVersion: '6.1.0',
        cpus: 8,
        memoryBytes: 16000000000,
        storageDriver: 'overlay2',
        rootDir: '/var/lib/docker',
        containersRunning: 5,
        containersTotal: 10,
        images: 25
      };
      (mockDockerService.getDockerInfo as ReturnType<typeof vi.fn>).mockResolvedValue(mockInfo);
      (mockDockerService.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '1', state: 'running' },
        { id: '2', state: 'running' },
        { id: '3', state: 'stopped' }
      ]);

      const result = await handleHostAction({
        action: 'host',
        subaction: 'status',
        action_subaction: 'host:status',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.getDockerInfo).toHaveBeenCalled();
      expect(result).toContain('tootie');
      expect(result).toContain('Online');
    });

    it('should return offline status when docker is unreachable', async () => {
      (mockDockerService.getDockerInfo as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('Connection refused'));

      const result = await handleHostAction({
        action: 'host',
        subaction: 'status',
        action_subaction: 'host:status',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(result).toContain('Offline');
      expect(result).toContain('Connection refused');
    });

    it('should return JSON format when requested', async () => {
      const mockInfo = {
        dockerVersion: '24.0.0',
        apiVersion: '1.43',
        os: 'linux',
        arch: 'x86_64',
        kernelVersion: '6.1.0',
        cpus: 8,
        memoryBytes: 16000000000,
        storageDriver: 'overlay2',
        rootDir: '/var/lib/docker',
        containersRunning: 5,
        containersTotal: 10,
        images: 25
      };
      (mockDockerService.getDockerInfo as ReturnType<typeof vi.fn>).mockResolvedValue(mockInfo);
      (mockDockerService.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await handleHostAction({
        action: 'host',
        subaction: 'status',
        action_subaction: 'host:status',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('name');
      expect(parsed.connected).toBe(true);
    });
  });

  describe('resources subaction', () => {
    it('should get host resources', async () => {
      const mockResources = {
        hostname: 'tootie.local',
        uptime: '15 days, 3:42:10',
        loadAverage: [1.5, 1.2, 0.9] as [number, number, number],
        cpu: { cores: 8, usagePercent: 45.2 },
        memory: { totalMB: 32768, usedMB: 16384, freeMB: 16384, usagePercent: 50 },
        disk: [{ filesystem: '/dev/sda1', mount: '/', totalGB: 500, usedGB: 250, availGB: 250, usagePercent: 50 }]
      };
      (mockSSHService.getHostResources as ReturnType<typeof vi.fn>).mockResolvedValue(mockResources);

      const result = await handleHostAction({
        action: 'host',
        subaction: 'resources',
        action_subaction: 'host:resources',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.getHostResources).toHaveBeenCalled();
      expect(result).toContain('45.2');
      expect(result).toContain('16384');
    });

    it('should return JSON format for resources', async () => {
      const mockResources = {
        hostname: 'tootie.local',
        uptime: '15 days, 3:42:10',
        loadAverage: [1.5, 1.2, 0.9] as [number, number, number],
        cpu: { cores: 8, usagePercent: 45.2 },
        memory: { totalMB: 32768, usedMB: 16384, freeMB: 16384, usagePercent: 50 },
        disk: []
      };
      (mockSSHService.getHostResources as ReturnType<typeof vi.fn>).mockResolvedValue(mockResources);

      const result = await handleHostAction({
        action: 'host',
        subaction: 'resources',
        action_subaction: 'host:resources',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.host).toBe('tootie');
      expect(parsed.resources.cpu.usagePercent).toBe(45.2);
    });
  });

  describe('info subaction', () => {
    it('should get system info via SSH', async () => {
      // Mock uname -a command
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Linux tootie 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 (2024-05-03) x86_64 GNU/Linux'
      );

      const result = await handleHostAction({
        action: 'host',
        subaction: 'info',
        action_subaction: 'host:info',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('Linux');
      expect(result).toContain('6.1.0');
    });
  });

  describe('uptime subaction', () => {
    it('should get system uptime via SSH', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        ' 15:42:10 up 15 days,  3:42,  2 users,  load average: 1.50, 1.20, 0.90'
      );

      const result = await handleHostAction({
        action: 'host',
        subaction: 'uptime',
        action_subaction: 'host:uptime',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('15 days');
    });
  });

  describe('services subaction', () => {
    it('should get systemd services via SSH', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'docker.service            loaded active running Docker Application Container Engine\n' +
        'nginx.service             loaded active running A high performance web server'
      );

      const result = await handleHostAction({
        action: 'host',
        subaction: 'services',
        action_subaction: 'host:services',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('docker.service');
      expect(result).toContain('nginx.service');
    });

    it('should filter by service state', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'failed.service            loaded failed failed Some failed service'
      );

      await handleHostAction({
        action: 'host',
        subaction: 'services',
        action_subaction: 'host:services',
        host: 'tootie',
        state: 'failed'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      // Check that the state filter is passed to the command
      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'systemctl',
        expect.arrayContaining(['--state=failed'])
      );
    });

    it('should accept valid service name', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'nginx.service             loaded active running A high performance web server'
      );

      await handleHostAction({
        action: 'host',
        subaction: 'services',
        action_subaction: 'host:services',
        host: 'tootie',
        service: 'nginx'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'systemctl',
        expect.arrayContaining(['nginx'])
      );
    });

    it('should reject service name with command injection attempt', async () => {
      await expect(
        handleHostAction({
          action: 'host',
          subaction: 'services',
          action_subaction: 'host:services',
          host: 'tootie',
          service: 'nginx; cat /etc/passwd'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid service name');
    });

    it('should reject service name with shell metacharacters', async () => {
      await expect(
        handleHostAction({
          action: 'host',
          subaction: 'services',
          action_subaction: 'host:services',
          host: 'tootie',
          service: 'nginx|rm -rf /'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid service name');
    });

    it('should reject state with command injection attempt', async () => {
      await expect(
        handleHostAction({
          action: 'host',
          subaction: 'services',
          action_subaction: 'host:services',
          host: 'tootie',
          state: 'running; whoami'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid state value');
    });
  });

  describe('network subaction', () => {
    it('should get network interfaces via SSH', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n' +
        '        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255'
      );

      const result = await handleHostAction({
        action: 'host',
        subaction: 'network',
        action_subaction: 'host:network',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('eth0');
      expect(result).toContain('192.168.1.100');
    });
  });

  describe('mounts subaction', () => {
    it('should get mounted filesystems via SSH', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Filesystem      Size  Used Avail Use% Mounted on\n' +
        '/dev/sda1       500G  250G  250G  50% /'
      );

      const result = await handleHostAction({
        action: 'host',
        subaction: 'mounts',
        action_subaction: 'host:mounts',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('/dev/sda1');
      expect(result).toContain('500G');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleHostAction({
          action: 'container',
          subaction: 'list'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid action for host handler');
    });

    it('should throw on unknown host', async () => {
      // Re-mock to return empty hosts array
      vi.mocked(await import('../../services/docker.js')).loadHostConfigs.mockReturnValue([]);

      await expect(
        handleHostAction({
          action: 'host',
          subaction: 'status',
          action_subaction: 'host:status',
          host: 'unknown-host'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });
  });
});
