// src/tools/handlers/container.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleContainerAction } from './container.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';

describe('Container Handler', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    mockDockerService = {
      listContainers: vi.fn().mockResolvedValue([]),
      containerAction: vi.fn().mockResolvedValue(undefined),
      getContainerLogs: vi.fn().mockResolvedValue([]),
      getContainerStats: vi.fn().mockResolvedValue({}),
      inspectContainer: vi.fn().mockResolvedValue({}),
      findContainerHost: vi.fn().mockResolvedValue(null),
      pullImage: vi.fn().mockResolvedValue({ status: 'success' }),
      recreateContainer: vi.fn().mockResolvedValue({ status: 'success', containerId: 'new123' })
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
