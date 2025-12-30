// src/tools/handlers/docker-pagination.test.ts
/**
 * Tests for multi-host pagination sorting consistency
 *
 * When querying multiple hosts, results must be sorted by hostName
 * BEFORE pagination to ensure consistent, predictable pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDockerAction } from './docker.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';

// Mock loadHostConfigs to return multiple hosts
vi.mock('../../services/docker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/docker.js')>();
  return {
    ...actual,
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: 'hostA', host: 'hostA', protocol: 'http', port: 2375 },
      { name: 'hostB', host: 'hostB', protocol: 'http', port: 2375 },
      { name: 'hostC', host: 'hostC', protocol: 'http', port: 2375 }
    ])
  };
});

describe('Multi-Host Pagination Sorting', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockDockerService = {
      listImages: vi.fn(),
      listNetworks: vi.fn(),
      listVolumes: vi.fn()
    };

    mockContainer = {
      getDockerService: vi.fn().mockReturnValue(mockDockerService)
    };
  });

  describe('images subaction', () => {
    it('should sort images by hostName before pagination', async () => {
      // Simulate multi-host results in non-alphabetical order (as Promise.allSettled might return)
      const mockImages = [
        { id: 'img-c1', tags: ['nginx:latest'], size: 100000000, hostName: 'hostC', containers: 1, created: '2024-01-01' },
        { id: 'img-a1', tags: ['redis:7'], size: 50000000, hostName: 'hostA', containers: 1, created: '2024-01-02' },
        { id: 'img-b1', tags: ['postgres:15'], size: 200000000, hostName: 'hostB', containers: 1, created: '2024-01-03' },
        { id: 'img-c2', tags: ['alpine:latest'], size: 5000000, hostName: 'hostC', containers: 0, created: '2024-01-04' },
        { id: 'img-a2', tags: ['node:18'], size: 150000000, hostName: 'hostA', containers: 2, created: '2024-01-05' }
      ];

      (mockDockerService.listImages as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'images',
        action_subaction: 'docker:images',
        offset: 0,
        limit: 3
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      // After sorting by hostName, first 3 should be from hostA (2) and hostB (1)
      expect(result).toContain('redis:7');  // hostA
      expect(result).toContain('node:18');  // hostA
      expect(result).toContain('postgres:15'); // hostB

      // Should NOT contain images from hostC (they're sorted after hostB)
      expect(result).not.toContain('nginx:latest');
      expect(result).not.toContain('alpine:latest');
    });
  });

  describe('networks subaction', () => {
    it('should sort networks by hostName before pagination', async () => {
      const mockNetworks = [
        { id: 'net-c1', name: 'bridge', driver: 'bridge', scope: 'local', hostName: 'hostC', created: '2024-01-01', internal: false, attachable: false, ingress: false },
        { id: 'net-a1', name: 'custom_net', driver: 'bridge', scope: 'local', hostName: 'hostA', created: '2024-01-02', internal: false, attachable: true, ingress: false },
        { id: 'net-b1', name: 'overlay_net', driver: 'overlay', scope: 'swarm', hostName: 'hostB', created: '2024-01-03', internal: false, attachable: true, ingress: false }
      ];

      (mockDockerService.listNetworks as ReturnType<typeof vi.fn>).mockResolvedValue(mockNetworks);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'networks',
        action_subaction: 'docker:networks',
        offset: 0,
        limit: 2
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      // After sorting by hostName, first 2 should be from hostA and hostB
      expect(result).toContain('custom_net'); // hostA
      expect(result).toContain('overlay_net'); // hostB
      expect(result).not.toContain('net-c1'); // hostC network ID (should be excluded)
    });
  });

  describe('volumes subaction', () => {
    it('should sort volumes by hostName before pagination', async () => {
      const mockVolumes = [
        { name: 'vol-c1', driver: 'local', scope: 'local', mountpoint: '/var/lib/docker/volumes/vol-c1/_data', hostName: 'hostC', createdAt: '2024-01-01' },
        { name: 'vol-a1', driver: 'local', scope: 'local', mountpoint: '/var/lib/docker/volumes/vol-a1/_data', hostName: 'hostA', createdAt: '2024-01-02' },
        { name: 'vol-b1', driver: 'local', scope: 'local', mountpoint: '/var/lib/docker/volumes/vol-b1/_data', hostName: 'hostB', createdAt: '2024-01-03' }
      ];

      (mockDockerService.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue(mockVolumes);

      const result = await handleDockerAction({
        action: 'docker',
        subaction: 'volumes',
        action_subaction: 'docker:volumes',
        offset: 0,
        limit: 2
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      // After sorting by hostName, first 2 should be from hostA and hostB
      expect(result).toContain('vol-a1'); // hostA
      expect(result).toContain('vol-b1'); // hostB
      expect(result).not.toContain('vol-c1'); // Should not show hostC volume
    });
  });
});
