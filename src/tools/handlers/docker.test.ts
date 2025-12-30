// src/tools/handlers/docker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDockerAction } from './docker.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import { ResponseFormat } from '../../types.js';
import { loadHostConfigs } from '../../services/docker.js';

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

describe('Docker Handler', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockDockerService = {
      getDockerInfo: vi.fn(),
      getDockerDiskUsage: vi.fn(),
      pruneDocker: vi.fn(),
      listImages: vi.fn(),
      listNetworks: vi.fn(),
      listVolumes: vi.fn(),
      pullImage: vi.fn(),
      buildImage: vi.fn(),
      removeImage: vi.fn()
    };

    mockContainer = {
      getDockerService: vi.fn().mockReturnValue(mockDockerService)
    };
  });

  describe('info subaction', () => {
    it('should get docker system info', async () => {
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

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'info',
        action_subaction: 'docker:info',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.getDockerInfo).toHaveBeenCalled();
      expect(result).toContain('24.0.0');
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

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'info',
        action_subaction: 'docker:info',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.dockerVersion).toBe('24.0.0');
    });
  });

  describe('df subaction', () => {
    it('should get docker disk usage', async () => {
      const mockUsage = {
        images: { total: 10, active: 5, size: 5000000000, reclaimable: 2000000000 },
        containers: { total: 5, running: 3, size: 1000000000, reclaimable: 500000000 },
        volumes: { total: 3, active: 2, size: 500000000, reclaimable: 100000000 },
        buildCache: { total: 10, size: 200000000, reclaimable: 100000000 },
        totalSize: 6700000000,
        totalReclaimable: 2700000000
      };
      (mockDockerService.getDockerDiskUsage as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsage);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'df',
        action_subaction: 'docker:df',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.getDockerDiskUsage).toHaveBeenCalled();
      expect(result).toContain('Images');
    });
  });

  describe('prune subaction', () => {
    it('should prune containers', async () => {
      const mockResults = [
        { type: 'containers', spaceReclaimed: 500000000, itemsDeleted: 3 }
      ];
      (mockDockerService.pruneDocker as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'prune',
        action_subaction: 'docker:prune',
        host: 'tootie',
        prune_target: 'containers',
        force: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.pruneDocker).toHaveBeenCalledWith(
        expect.anything(),
        'containers'
      );
      expect(result).toContain('Prune');
    });

    it('should require force flag for prune', async () => {
      await expect(handleDockerAction({
        action: 'docker',
        subaction: 'prune',
        action_subaction: 'docker:prune',
        host: 'tootie',
        prune_target: 'all',
        force: false
      } as unknown as FluxInput, mockContainer as ServiceContainer)).rejects.toThrow('force');
    });
  });

  describe('images subaction', () => {
    it('should list images', async () => {
      const mockImages = [
        { id: 'sha256:abc', tags: ['nginx:latest'], size: 100000000, hostName: 'tootie', containers: 1, created: '2024-01-01' }
      ];
      (mockDockerService.listImages as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'images',
        action_subaction: 'docker:images',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.listImages).toHaveBeenCalled();
      expect(result).toContain('nginx');
    });

    it('should filter dangling images', async () => {
      const mockImages = [
        { id: 'sha256:abc', tags: [], size: 100000000, hostName: 'tootie', containers: 0, created: '2024-01-01' }
      ];
      (mockDockerService.listImages as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      await handleDockerAction({
        action: 'docker',
        subaction: 'images',
        action_subaction: 'docker:images',
        host: 'tootie',
        dangling_only: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.listImages).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          danglingOnly: true
        })
      );
    });
  });

  describe('pull subaction', () => {
    it('should pull an image', async () => {
      (mockDockerService.pullImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Downloaded' });

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'pull',
        action_subaction: 'docker:pull',
        host: 'tootie',
        image: 'nginx:latest'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.pullImage).toHaveBeenCalledWith(
        'nginx:latest',
        expect.anything()
      );
      expect(result).toContain('nginx:latest');
      expect(result).toContain('pull');
    });
  });

  describe('build subaction', () => {
    it('should build an image', async () => {
      (mockDockerService.buildImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Built' });

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'build',
        action_subaction: 'docker:build',
        host: 'tootie',
        context: '/path/to/context',
        tag: 'myimage:latest',
        no_cache: false
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.buildImage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          context: '/path/to/context',
          tag: 'myimage:latest'
        })
      );
      expect(result).toContain('myimage:latest');
    });

    it('should build with no-cache option', async () => {
      (mockDockerService.buildImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Built' });

      await handleDockerAction({
        action: 'docker',
        subaction: 'build',
        action_subaction: 'docker:build',
        host: 'tootie',
        context: '/path/to/context',
        tag: 'myimage:latest',
        no_cache: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.buildImage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          noCache: true
        })
      );
    });
  });

  describe('rmi subaction', () => {
    it('should remove an image', async () => {
      (mockDockerService.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Removed' });

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'rmi',
        action_subaction: 'docker:rmi',
        host: 'tootie',
        image: 'nginx:latest',
        force: false
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.removeImage).toHaveBeenCalledWith(
        'nginx:latest',
        expect.anything(),
        { force: false }
      );
      expect(result).toContain('nginx:latest');
      expect(result).toContain('removed');
    });

    it('should force remove an image', async () => {
      (mockDockerService.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Removed' });

      await handleDockerAction({
        action: 'docker',
        subaction: 'rmi',
        action_subaction: 'docker:rmi',
        host: 'tootie',
        image: 'nginx:latest',
        force: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.removeImage).toHaveBeenCalledWith(
        'nginx:latest',
        expect.anything(),
        { force: true }
      );
    });

    it('should default force to false when not provided', async () => {
      (mockDockerService.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'Removed' });

      await handleDockerAction({
        action: 'docker',
        subaction: 'rmi',
        action_subaction: 'docker:rmi',
        host: 'tootie',
        image: 'nginx:latest'
        // force intentionally omitted
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.removeImage).toHaveBeenCalledWith(
        'nginx:latest',
        expect.anything(),
        { force: false }
      );
    });
  });

  describe('networks subaction', () => {
    it('should list docker networks', async () => {
      (mockDockerService.listNetworks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'net-1', name: 'bridge', driver: 'bridge', scope: 'local', hostName: 'tootie' }
      ]);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'networks',
        action_subaction: 'docker:networks',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.listNetworks).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'tootie' })])
      );
      expect(result).toContain('bridge');
    });

    it('should return JSON format for networks', async () => {
      (mockDockerService.listNetworks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'net-1', name: 'bridge', driver: 'bridge', scope: 'local', hostName: 'tootie' }
      ]);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'networks',
        action_subaction: 'docker:networks',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('bridge');
    });
  });

  describe('volumes subaction', () => {
    it('should list docker volumes', async () => {
      (mockDockerService.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'plex_data', driver: 'local', scope: 'local', hostName: 'tootie' }
      ]);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'volumes',
        action_subaction: 'docker:volumes',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockDockerService.listVolumes).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'tootie' })])
      );
      expect(result).toContain('plex_data');
    });

    it('should return JSON format for volumes', async () => {
      (mockDockerService.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'plex_data', driver: 'local', scope: 'local', hostName: 'tootie' }
      ]);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'volumes',
        action_subaction: 'docker:volumes',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('plex_data');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleDockerAction({
          action: 'container',
          subaction: 'list'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid action for docker handler');
    });

    it('should throw on unknown host', async () => {
      // Re-mock to return empty hosts array
      vi.mocked(loadHostConfigs).mockReturnValue([]);

      await expect(
        handleDockerAction({
          action: 'docker',
          subaction: 'info',
          action_subaction: 'docker:info',
          host: 'unknown-host'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });
  });
});
