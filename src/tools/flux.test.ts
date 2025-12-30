// src/tools/flux.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFluxTool } from './flux.js';
import type { ServiceContainer } from '../services/container.js';

// Mock loadHostConfigs to provide test host
vi.mock('../services/docker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/docker.js')>();
  return {
    ...actual,
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
    ])
  };
});

const createMockContainer = (
  overrides: Partial<ServiceContainer> = {}
): ServiceContainer => {
  const baseContainer = {
    getDockerService: vi.fn(() => ({})),
    setDockerService: vi.fn(),
    getSSHConnectionPool: vi.fn(() => ({})),
    setSSHConnectionPool: vi.fn(),
    getSSHService: vi.fn(() => ({})),
    setSSHService: vi.fn(),
    getComposeService: vi.fn(() => ({})),
    setComposeService: vi.fn(),
    getFileService: vi.fn(() => ({})),
    setFileService: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined)
  };

  return { ...baseContainer, ...overrides } as ServiceContainer;
};

describe('Flux Tool Handler', () => {
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    mockContainer = createMockContainer();
  });

  describe('help system', () => {
    it('should handle help action and return markdown by default', async () => {
      const result = await handleFluxTool(
        { action: 'help' },
        mockContainer
      );
      // Should contain action:subaction format
      expect(result).toContain('container:list');
      expect(result).toContain('compose:up');
      expect(result).toContain('docker:info');
      expect(result).toContain('host:status');
    });

    it('should handle help with topic filter', async () => {
      const result = await handleFluxTool(
        { action: 'help', topic: 'container:list' },
        mockContainer
      );
      expect(result).toContain('container:list');
      expect(result).not.toContain('container:start');
      expect(result).not.toContain('compose:up');
    });

    it('should handle help with json format', async () => {
      const result = await handleFluxTool(
        { action: 'help', format: 'json' },
        mockContainer
      );
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty('action');
      expect(parsed[0]).toHaveProperty('parameters');
    });

    it('should return empty help for non-existent topic', async () => {
      const result = await handleFluxTool(
        { action: 'help', topic: 'nonexistent:action' },
        mockContainer
      );
      expect(result).toContain('No help available');
    });
  });

  describe('routing', () => {
    it('should route container action to container handler', async () => {
      const mockDockerService = {
        listContainers: vi.fn().mockResolvedValue([])
      };
      (mockContainer.getDockerService as ReturnType<typeof vi.fn>).mockReturnValue(mockDockerService);

      const result = await handleFluxTool(
        { action: 'container', subaction: 'list' },
        mockContainer
      );

      expect(mockDockerService.listContainers).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should route compose action to compose handler', async () => {
      const mockComposeService = {
        listComposeProjects: vi.fn().mockResolvedValue([])
      };
      (mockContainer.getComposeService as ReturnType<typeof vi.fn>).mockReturnValue(mockComposeService);

      const result = await handleFluxTool(
        { action: 'compose', subaction: 'list', host: 'tootie' },
        mockContainer
      );

      expect(mockComposeService.listComposeProjects).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should route docker action to docker handler', async () => {
      const mockDockerService = {
        getDockerInfo: vi.fn().mockResolvedValue({
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
        })
      };
      (mockContainer.getDockerService as ReturnType<typeof vi.fn>).mockReturnValue(mockDockerService);

      const result = await handleFluxTool(
        { action: 'docker', subaction: 'info', host: 'tootie' },
        mockContainer
      );

      expect(mockDockerService.getDockerInfo).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should route host action to host handler', async () => {
      const mockDockerService = {
        getDockerInfo: vi.fn().mockResolvedValue({
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
        }),
        listContainers: vi.fn().mockResolvedValue([])
      };
      (mockContainer.getDockerService as ReturnType<typeof vi.fn>).mockReturnValue(mockDockerService);

      const result = await handleFluxTool(
        { action: 'host', subaction: 'status', host: 'tootie' },
        mockContainer
      );

      expect(mockDockerService.getDockerInfo).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should reject invalid action', async () => {
      await expect(handleFluxTool(
        { action: 'invalid', subaction: 'test' },
        mockContainer
      )).rejects.toThrow();
    });

    it('should reject invalid subaction', async () => {
      await expect(handleFluxTool(
        { action: 'container', subaction: 'invalid' },
        mockContainer
      )).rejects.toThrow();
    });
  });
});
