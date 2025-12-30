// src/tools/handlers/container-port-binding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleContainerAction } from './container.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IDockerService } from '../../services/interfaces.js';
import type { FluxInput } from '../../schemas/flux/index.js';
import type Dockerode from 'dockerode';

/**
 * Factory helper to create mock container inspection objects
 * Reduces duplication across port binding test cases
 */
function createMockInspection(
  ports: Dockerode.ContainerInspectInfo['NetworkSettings']['Ports']
): Dockerode.ContainerInspectInfo {
  return {
    Id: 'abc123',
    Name: '/nginx',
    RestartCount: 0,
    Created: '2024-01-01T00:00:00Z',
    State: {
      Status: 'running',
      Running: true,
      StartedAt: '2024-01-01T00:01:00Z'
    } as Dockerode.ContainerInspectInfo['State'],
    Config: {
      Image: 'nginx:latest',
      Cmd: ['nginx'],
      WorkingDir: '/',
      Env: [],
      Labels: {}
    } as Dockerode.ContainerInspectInfo['Config'],
    Mounts: [],
    NetworkSettings: {
      Ports: ports,
      Networks: {}
    } as Dockerode.ContainerInspectInfo['NetworkSettings']
  } as Dockerode.ContainerInspectInfo;
}

describe('Container Handler - Port Binding Edge Cases', () => {
  let mockDockerService: Partial<IDockerService>;
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    mockDockerService = {
      findContainerHost: vi.fn().mockResolvedValue({
        host: { name: 'tootie' },
        container: { Id: 'abc123' }
      }),
      inspectContainer: vi.fn()
    };
    mockContainer = {
      getDockerService: () => mockDockerService
    } as unknown as ServiceContainer;
  });

  describe('inspect summary mode - port binding filtering', () => {
    it('should show ports with valid bindings', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }]
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      expect(result).toContain('0.0.0.0:8080 → 80/tcp');
    });

    it('should handle ports with null bindings array', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': null // Exposed but not bound
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      // Should not crash and should not show the port since it's not bound
      expect(result).not.toContain('80/tcp');
    });

    it('should handle ports with empty bindings array', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': []
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      // Empty array means exposed but not bound - should not show
      expect(result).not.toContain('80/tcp');
    });

    it('should handle ports with mix of null and valid bindings in array', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': [
            null, // Invalid binding
            { HostIp: '0.0.0.0', HostPort: '8080' }, // Valid binding
            null // Another invalid
          ]
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      // CRITICAL: Should this show the port with the valid binding, or hide it entirely?
      // Current implementation with .every() hides it entirely
      // Expected behavior: Should show the valid binding
      expect(result).toContain('0.0.0.0:8080 → 80/tcp');
    });

    it('should handle ports with multiple valid bindings', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': [
            { HostIp: '0.0.0.0', HostPort: '8080' },
            { HostIp: '127.0.0.1', HostPort: '8080' }
          ]
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      // Should show the first valid binding
      expect(result).toContain('0.0.0.0:8080 → 80/tcp');
    });

    it('should handle ports with all null bindings in array', async () => {
      mockDockerService.inspectContainer.mockResolvedValue(
        createMockInspection({
          '80/tcp': [null, null, null]
        })
      );

      const result = await handleContainerAction({
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'nginx',
        summary: true
      } as FluxInput, mockContainer);

      // All null bindings means no valid bindings - should not show
      expect(result).not.toContain('80/tcp');
    });
  });
});
