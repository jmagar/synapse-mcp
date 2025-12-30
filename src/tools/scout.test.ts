// src/tools/scout.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScoutTool } from './scout.js';
import type { ServiceContainer } from '../services/container.js';
import { DEFAULT_DOCKER_SOCKET } from '../constants.js';
import * as dockerService from '../services/docker.js';

describe('Scout Tool Handler', () => {
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    mockContainer = {
      getSSHService: vi.fn(),
      getFileService: vi.fn(),
      getDockerService: vi.fn(),
      getComposeService: vi.fn()
    } as unknown as ServiceContainer;
  });

  describe('help system', () => {
    it('should handle help action and return markdown by default', async () => {
      const result = await handleScoutTool(
        { action: 'help' },
        mockContainer
      );
      // Should contain simple actions
      expect(result).toContain('nodes');
      expect(result).toContain('peek');
      expect(result).toContain('exec');
      // Should contain nested actions with subactions
      expect(result).toContain('zfs:pools');
      expect(result).toContain('logs:syslog');
    });

    it('should handle help with topic filter for simple action', async () => {
      const result = await handleScoutTool(
        { action: 'help', topic: 'nodes' },
        mockContainer
      );
      expect(result).toContain('nodes');
      expect(result).not.toContain('peek');
      expect(result).not.toContain('zfs');
    });

    it('should handle help with topic filter for nested action', async () => {
      const result = await handleScoutTool(
        { action: 'help', topic: 'zfs:pools' },
        mockContainer
      );
      expect(result).toContain('zfs:pools');
      expect(result).not.toContain('zfs:datasets');
    });

    it('should handle help with json format', async () => {
      const result = await handleScoutTool(
        { action: 'help', format: 'json' },
        mockContainer
      );
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      // Should have both simple and nested actions
      const actions = parsed.map((e: { action: string }) => e.action);
      expect(actions).toContain('nodes');
      expect(actions).toContain('zfs:pools');
    });

    it('should return empty help for non-existent topic', async () => {
      const result = await handleScoutTool(
        { action: 'help', topic: 'nonexistent' },
        mockContainer
      );
      expect(result).toContain('No help available');
    });
  });

  describe('routing', () => {
    it('should route nodes action to simple handler', async () => {
      // nodes action just lists configured hosts
      const loadHostConfigsSpy = vi.spyOn(dockerService, 'loadHostConfigs').mockReturnValue([
        {
          name: 'local',
          host: 'localhost',
          protocol: 'http',
          port: 2375,
          dockerSocketPath: DEFAULT_DOCKER_SOCKET
        }
      ]);

      try {
        const result = await handleScoutTool(
          { action: 'nodes' },
          mockContainer
        );
        // Should return the host list (from loadHostConfigs mock)
        expect(result).toContain('local');
        expect(result).toContain('localhost');
      } finally {
        loadHostConfigsSpy.mockRestore();
      }
    });

    it('should route peek action to simple handler', async () => {
      const mockFileService = {
        readFile: vi.fn().mockResolvedValue({ content: 'test', size: 4, truncated: false })
      };
      (mockContainer.getFileService as ReturnType<typeof vi.fn>).mockReturnValue(mockFileService);

      const loadHostConfigsSpy = vi.spyOn(dockerService, 'loadHostConfigs').mockReturnValue([
        {
          name: 'tootie',
          host: 'tootie',
          protocol: 'http',
          port: 2375,
          dockerSocketPath: DEFAULT_DOCKER_SOCKET
        }
      ]);

      try {
        const result = await handleScoutTool(
          { action: 'peek', target: 'tootie:/etc/hosts' },
          mockContainer
        );

        expect(mockFileService.readFile).toHaveBeenCalled();
        expect(result).toBeDefined();
      } finally {
        loadHostConfigsSpy.mockRestore();
      }
    });

    it('should route zfs action to zfs handler', async () => {
      const mockSSHService = {
        executeSSHCommand: vi.fn().mockResolvedValue('NAME   SIZE  ALLOC   FREE\ntank   10T   5T   5T')
      };
      (mockContainer.getSSHService as ReturnType<typeof vi.fn>).mockReturnValue(mockSSHService);

      const loadHostConfigsSpy = vi.spyOn(dockerService, 'loadHostConfigs').mockReturnValue([
        {
          name: 'tootie',
          host: 'tootie',
          protocol: 'http',
          port: 2375,
          dockerSocketPath: DEFAULT_DOCKER_SOCKET
        }
      ]);

      try {
        const result = await handleScoutTool(
          { action: 'zfs', subaction: 'pools', host: 'tootie' },
          mockContainer
        );

        expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
        expect(result).toBeDefined();
      } finally {
        loadHostConfigsSpy.mockRestore();
      }
    });

    it('should route logs action to logs handler', async () => {
      const mockSSHService = {
        executeSSHCommand: vi.fn().mockResolvedValue('Dec 15 10:00:00 tootie systemd[1]: Started service')
      };
      (mockContainer.getSSHService as ReturnType<typeof vi.fn>).mockReturnValue(mockSSHService);

      const loadHostConfigsSpy = vi.spyOn(dockerService, 'loadHostConfigs').mockReturnValue([
        {
          name: 'tootie',
          host: 'tootie',
          protocol: 'http',
          port: 2375,
          dockerSocketPath: DEFAULT_DOCKER_SOCKET
        }
      ]);

      try {
        const result = await handleScoutTool(
          { action: 'logs', subaction: 'syslog', host: 'tootie', lines: 100 },
          mockContainer
        );

        expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
        expect(result).toBeDefined();
      } finally {
        loadHostConfigsSpy.mockRestore();
      }
    });
  });

  describe('validation', () => {
    it('should reject invalid action', async () => {
      await expect(handleScoutTool(
        { action: 'invalid' },
        mockContainer
      )).rejects.toThrow(/Scout input validation failed:.*invalid_union/i);
    });

    it('should reject invalid target format for peek', async () => {
      await expect(handleScoutTool(
        { action: 'peek', target: 'invalid' },
        mockContainer
      )).rejects.toThrow(/Scout input validation failed:.*Must be 'hostname:\/path' format/);
    });
  });
});
