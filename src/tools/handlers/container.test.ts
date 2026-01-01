// src/tools/handlers/container.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleContainerAction } from './container.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import { ResponseFormat } from '../../types.js';
import { logError } from '../../utils/errors.js';
import * as dockerModule from '../../services/docker.js';

vi.mock('../../utils/errors.js', () => ({
  logError: vi.fn()
}));

describe('Container Handler', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    vi.mocked(logError).mockClear();
    mockDockerService = {
      listContainers: vi.fn().mockResolvedValue([]),
      containerAction: vi.fn().mockResolvedValue(undefined),
      getContainerLogs: vi.fn().mockResolvedValue([]),
      getContainerStats: vi.fn().mockResolvedValue({}),
      inspectContainer: vi.fn().mockResolvedValue({}),
      findContainerHost: vi.fn().mockResolvedValue(null),
      pullImage: vi.fn().mockResolvedValue({ status: 'success' }),
      recreateContainer: vi.fn().mockResolvedValue({ status: 'success', containerId: 'new123' }),
      execContainer: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
      getContainerProcesses: vi.fn().mockResolvedValue({ titles: [], processes: [] })
    };
    mockContainer = {
      getDockerService: () => mockDockerService
    } as unknown as ServiceContainer;
  });

  describe('list subaction', () => {
    it('should list containers with default options', async () => {
      mockDockerService.listContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          state: 'running',
          hostName: 'tootie',
          image: 'nginx:latest',
          status: 'Up 2 hours',
          created: '2024-01-01T00:00:00Z',
          ports: [],
          labels: {}
        }
      ]);

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'list',
        action_subaction: 'container:list'
      } as FluxInput, mockContainer);

      expect(mockDockerService.listContainers).toHaveBeenCalled();
      expect(result).toContain('nginx');
    });

    it('should filter by state', async () => {
      await handleContainerAction({
        action: 'container',
        subaction: 'list',
        action_subaction: 'container:list',
        state: 'running'
      } as FluxInput, mockContainer);

      expect(mockDockerService.listContainers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ state: 'running' })
      );
    });
  });

  describe('lifecycle actions', () => {
    it('should start container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'start',
        action_subaction: 'container:start',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.containerAction).toHaveBeenCalledWith(
        'nginx', 'start', expect.anything()
      );
    });

    it('should stop container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'stop',
        action_subaction: 'container:stop',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.containerAction).toHaveBeenCalledWith(
        'nginx', 'stop', expect.anything()
      );
    });

    it('should restart container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'restart',
        action_subaction: 'container:restart',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.containerAction).toHaveBeenCalledWith(
        'nginx', 'restart', expect.anything()
      );
    });

    it('should pause container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'pause',
        action_subaction: 'container:pause',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.containerAction).toHaveBeenCalledWith(
        'nginx', 'pause', expect.anything()
      );
    });

    it('should resume container (maps to unpause)', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'resume',
        action_subaction: 'container:resume',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.containerAction).toHaveBeenCalledWith(
        'nginx', 'unpause', expect.anything()
      );
    });
  });

  describe('logs subaction', () => {
    it('should get container logs', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.getContainerLogs.mockResolvedValue([
        { timestamp: '2024-01-01T00:00:00Z', stream: 'stdout', message: 'Hello' }
      ]);

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'logs',
        action_subaction: 'container:logs',
        container_id: 'nginx',
        lines: 100
      } as FluxInput, mockContainer);

      expect(mockDockerService.getContainerLogs).toHaveBeenCalled();
      expect(result).toContain('Hello');
    });
  });

  describe('stats subaction', () => {
    it('should get container stats', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.getContainerStats.mockResolvedValue({
        containerId: 'abc123',
        containerName: 'nginx',
        cpuPercent: 5.5,
        memoryPercent: 10.2
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'stats',
        action_subaction: 'container:stats',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.getContainerStats).toHaveBeenCalled();
      expect(result).toContain('5.5');
    });

    it('should get stats for all running containers without redundant host lookups', async () => {
      // Mock loadHostConfigs to return test hosts
      const testHosts = [
        { name: 'host1', host: 'localhost', protocol: 'http' as const },
        { name: 'host2', host: 'localhost', protocol: 'http' as const }
      ];
      vi.spyOn(dockerModule, 'loadHostConfigs').mockReturnValue(testHosts as any);

      // Setup: 3 containers from different hosts
      mockDockerService.listContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          created: '2024-01-01T00:00:00Z',
          ports: [],
          labels: {},
          hostName: 'host1'
        },
        {
          id: 'def456',
          name: 'postgres',
          image: 'postgres:15',
          state: 'running',
          status: 'Up 1 hour',
          created: '2024-01-01T01:00:00Z',
          ports: [],
          labels: {},
          hostName: 'host2'
        },
        {
          id: 'ghi789',
          name: 'redis',
          image: 'redis:7',
          state: 'running',
          status: 'Up 30 minutes',
          created: '2024-01-01T01:30:00Z',
          ports: [],
          labels: {},
          hostName: 'host1'
        }
      ]);

      // Mock getContainerStats to return different names based on container ID
      mockDockerService.getContainerStats.mockImplementation(async (containerId: string) => {
        const nameMap: Record<string, string> = {
          'abc123': 'nginx',
          'def456': 'postgres',
          'ghi789': 'redis'
        };
        return {
          containerId,
          containerName: nameMap[containerId] || 'unknown',
          cpuPercent: 5.5,
          memoryPercent: 10.2,
          memoryUsage: 100,
          memoryLimit: 1000,
          networkRx: 1000,
          networkTx: 2000,
          blockRead: 3000,
          blockWrite: 4000
        };
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'stats',
        action_subaction: 'container:stats'
      } as FluxInput, mockContainer);

      // Should NOT call findContainerHost since hostName is already available
      expect(mockDockerService.findContainerHost).not.toHaveBeenCalled();
      // Should call getContainerStats 3 times (once per container)
      expect(mockDockerService.getContainerStats).toHaveBeenCalledTimes(3);
      expect(result).toContain('nginx');
      expect(result).toContain('postgres');
      expect(result).toContain('redis');

      // Cleanup
      vi.restoreAllMocks();
    });

    it('should handle missing host gracefully and log error', async () => {
      // Mock loadHostConfigs to return test hosts
      const testHosts = [
        { name: 'host1', host: 'localhost', protocol: 'http' as const },
        { name: 'host2', host: 'localhost', protocol: 'http' as const }
      ];
      vi.spyOn(dockerModule, 'loadHostConfigs').mockReturnValue(testHosts as any);

      // Container with hostName that doesn't exist in hosts array
      mockDockerService.listContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          created: '2024-01-01T00:00:00Z',
          ports: [],
          labels: {},
          hostName: 'nonexistent-host'
        }
      ]);

      mockDockerService.getContainerStats.mockResolvedValue({
        containerId: 'abc123',
        containerName: 'nginx',
        cpuPercent: 5.5,
        memoryPercent: 10.2,
        memoryUsage: 100,
        memoryLimit: 1000,
        networkRx: 1000,
        networkTx: 2000,
        blockRead: 3000,
        blockWrite: 4000
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'stats',
        action_subaction: 'container:stats'
      } as FluxInput, mockContainer);

      // Should NOT call getContainerStats since host was not found
      expect(mockDockerService.getContainerStats).not.toHaveBeenCalled();
      // Should log error with context
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Host not found for container: abc123' }),
        expect.objectContaining({
          operation: 'getContainerStats:abc123',
          metadata: { hostName: 'nonexistent-host' }
        })
      );
      // Result should indicate no running containers found since no valid stats were retrieved
      expect(result).toBe('No running containers found.');

      // Cleanup
      vi.restoreAllMocks();
    });
  });

  describe('inspect subaction', () => {
    it('should inspect container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.inspectContainer.mockResolvedValue({
        Id: 'abc123',
        Name: '/nginx',
        RestartCount: 0,
        Created: '2024-01-01T00:00:00Z',
        State: {
          Status: 'running',
          Running: true,
          StartedAt: '2024-01-01T00:01:00Z'
        },
        Config: {
          Image: 'nginx:latest',
          Cmd: ['nginx', '-g', 'daemon off;'],
          WorkingDir: '/usr/share/nginx/html',
          Env: ['PATH=/usr/local/bin'],
          Labels: {}
        },
        Mounts: [],
        NetworkSettings: {
          Ports: {},
          Networks: { bridge: {} }
        }
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.inspectContainer).toHaveBeenCalled();
      expect(result).toContain('nginx');
    });
  });

  describe('search subaction', () => {
    it('should search containers', async () => {
      mockDockerService.listContainers.mockResolvedValue([
        { id: 'abc', name: 'nginx-web', hostName: 'tootie' },
        { id: 'def', name: 'nginx-proxy', hostName: 'tootie' }
      ]);

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'search',
        action_subaction: 'container:search',
        query: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.listContainers).toHaveBeenCalled();
      expect(result).toContain('nginx');
    });
  });

  describe('pull subaction', () => {
    it('should pull container image', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123', Image: 'nginx:latest' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.pullImage).toHaveBeenCalled();
    });

    it('should use inspected image when container image is missing', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.inspectContainer.mockResolvedValue({
        Config: { Image: 'nginx:stable' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123'
      } as FluxInput, mockContainer);

      expect(mockDockerService.inspectContainer).toHaveBeenCalledWith('abc123', expect.anything());
      expect(mockDockerService.pullImage).toHaveBeenCalledWith('nginx:stable', expect.anything());
    });

    it('should use input image when container image cannot be resolved', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.inspectContainer.mockResolvedValue({
        Config: {}
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123',
        image: 'redis:latest'
      } as FluxInput, mockContainer);

      expect(mockDockerService.pullImage).toHaveBeenCalledWith('redis:latest', expect.anything());
    });

    it('should log error and use input image when inspection fails but inputImage is provided', async () => {
      const inspectionError = new Error('Failed to inspect container');
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.inspectContainer.mockRejectedValue(inspectionError);

      await handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123',
        image: 'redis:latest'
      } as FluxInput, mockContainer);

      expect(logError).toHaveBeenCalledWith(
        inspectionError,
        expect.objectContaining({
          operation: 'inspectContainer:abc123',
          metadata: expect.objectContaining({
            host: 'tootie',
            context: 'Falling back to inputImage for pull operation'
          })
        })
      );
      expect(mockDockerService.pullImage).toHaveBeenCalledWith('redis:latest', expect.anything());
    });

    it('should throw when input image is empty and container image is missing', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.inspectContainer.mockResolvedValue({
        Config: {}
      });

      await expect(handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123',
        image: '   '
      } as FluxInput, mockContainer)).rejects.toThrow('Cannot determine image for container: abc123');
    });

    it('should throw error when container has no Image property', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await expect(handleContainerAction({
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123'
      } as FluxInput, mockContainer)).rejects.toThrow('Cannot determine image for container: abc123');
    });
  });

  describe('recreate subaction', () => {
    it('should recreate container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });

      await handleContainerAction({
        action: 'container',
        subaction: 'recreate',
        action_subaction: 'container:recreate',
        container_id: 'nginx',
        pull: true
      } as FluxInput, mockContainer);

      expect(mockDockerService.recreateContainer).toHaveBeenCalledWith(
        'nginx', expect.anything(), expect.objectContaining({ pull: true })
      );
    });
  });

  describe('exec subaction', () => {
    it('should execute command inside container', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.execContainer.mockResolvedValue({
        stdout: 'nginx: configuration file /etc/nginx/nginx.conf test is successful',
        stderr: '',
        exitCode: 0
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'exec',
        action_subaction: 'container:exec',
        container_id: 'nginx',
        command: 'nginx -t'
      } as FluxInput, mockContainer);

      expect(mockDockerService.execContainer).toHaveBeenCalledWith(
        'nginx',
        expect.anything(),
        expect.objectContaining({ command: 'nginx -t' })
      );
      expect(result).toContain('nginx.conf');
    });

    it('should return JSON format for exec', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.execContainer.mockResolvedValue({
        stdout: 'hello',
        stderr: '',
        exitCode: 0
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'exec',
        action_subaction: 'container:exec',
        container_id: 'nginx',
        command: 'echo hello',
        response_format: ResponseFormat.JSON
      } as FluxInput, mockContainer);

      const parsed = JSON.parse(result);
      expect(parsed.stdout).toBe('hello');
      expect(parsed.exitCode).toBe(0);
    });
  });

  describe('top subaction', () => {
    it('should list container processes', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.getContainerProcesses.mockResolvedValue({
        titles: ['PID', 'USER', 'CMD'],
        processes: [
          ['1', 'root', 'nginx'],
          ['7', 'nginx', 'worker']
        ]
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'top',
        action_subaction: 'container:top',
        container_id: 'nginx'
      } as FluxInput, mockContainer);

      expect(mockDockerService.getContainerProcesses).toHaveBeenCalledWith(
        'nginx',
        expect.anything()
      );
      expect(result).toContain('PID');
      expect(result).toContain('nginx');
      expect(result).toContain('worker');
    });

    it('should return JSON format for top', async () => {
      mockDockerService.findContainerHost.mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      });
      mockDockerService.getContainerProcesses.mockResolvedValue({
        titles: ['PID', 'CMD'],
        processes: [['1', 'nginx']]
      });

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'top',
        action_subaction: 'container:top',
        container_id: 'nginx',
        response_format: ResponseFormat.JSON
      } as FluxInput, mockContainer);

      const parsed = JSON.parse(result);
      expect(parsed.titles).toEqual(['PID', 'CMD']);
      expect(parsed.processes).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw for container not found', async () => {
      mockDockerService.findContainerHost.mockResolvedValue(null);

      await expect(handleContainerAction({
        action: 'container',
        subaction: 'start',
        action_subaction: 'container:start',
        container_id: 'nonexistent'
      } as FluxInput, mockContainer)).rejects.toThrow('Container not found');
    });

    it('should throw for unknown subaction', async () => {
      await expect(handleContainerAction({
        action: 'container',
        subaction: 'invalid' as unknown as 'list',
        action_subaction: 'container:invalid'
      } as FluxInput, mockContainer)).rejects.toThrow('Unknown subaction');
    });
  });
});
