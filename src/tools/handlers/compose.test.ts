// src/tools/handlers/compose.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleComposeAction } from './compose.js';
import type { ServiceContainer } from '../../services/container.js';
import type { IComposeService } from '../../services/interfaces.js';
import type { ComposeProject } from '../../services/compose.js';
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

describe('Compose Handler', () => {
  let mockComposeService: Partial<IComposeService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockComposeService = {
      listComposeProjects: vi.fn(),
      getComposeStatus: vi.fn(),
      composeUp: vi.fn(),
      composeDown: vi.fn(),
      composeRestart: vi.fn(),
      composeLogs: vi.fn(),
      composeBuild: vi.fn(),
      composePull: vi.fn(),
      composeRecreate: vi.fn()
    };

    mockContainer = {
      getComposeService: vi.fn().mockReturnValue(mockComposeService)
    };
  });

  describe('list subaction', () => {
    it('should list compose projects', async () => {
      const mockProjects: ComposeProject[] = [
        { name: 'plex', status: 'running', configFiles: ['/config/docker-compose.yml'], services: [] },
        { name: 'jellyfin', status: 'partial', configFiles: ['/config/docker-compose.yml'], services: [] }
      ];
      (mockComposeService.listComposeProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockProjects);

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'list',
        action_subaction: 'compose:list',
        host: 'tootie'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.listComposeProjects).toHaveBeenCalled();
      expect(result).toContain('plex');
      expect(result).toContain('jellyfin');
    });

    it('should return JSON format when requested', async () => {
      const mockProjects: ComposeProject[] = [
        { name: 'plex', status: 'running', configFiles: [], services: [] }
      ];
      (mockComposeService.listComposeProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockProjects);

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'list',
        action_subaction: 'compose:list',
        host: 'tootie',
        response_format: ResponseFormat.JSON
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('plex');
    });

    it('should apply name filter', async () => {
      const mockProjects: ComposeProject[] = [
        { name: 'plex', status: 'running', configFiles: [], services: [] },
        { name: 'jellyfin', status: 'running', configFiles: [], services: [] }
      ];
      (mockComposeService.listComposeProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockProjects);

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'list',
        action_subaction: 'compose:list',
        host: 'tootie',
        name_filter: 'plex'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(result).toContain('plex');
      expect(result).not.toContain('jellyfin');
    });
  });

  describe('status subaction', () => {
    it('should get project status', async () => {
      const mockProject: ComposeProject = {
        name: 'plex',
        status: 'running',
        configFiles: ['/config/docker-compose.yml'],
        services: [
          { name: 'plex', status: 'running', health: 'healthy' }
        ]
      };
      (mockComposeService.getComposeStatus as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'status',
        action_subaction: 'compose:status',
        host: 'tootie',
        project: 'plex'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.getComposeStatus).toHaveBeenCalled();
      expect(result).toContain('plex');
      expect(result).toContain('running');
    });
  });

  describe('up subaction', () => {
    it('should start project with detach', async () => {
      (mockComposeService.composeUp as ReturnType<typeof vi.fn>).mockResolvedValue('Started');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'up',
        action_subaction: 'compose:up',
        host: 'tootie',
        project: 'plex',
        detach: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeUp).toHaveBeenCalled();
      expect(result).toContain('plex');
      expect(result).toContain('started');
    });
  });

  describe('down subaction', () => {
    it('should stop project', async () => {
      (mockComposeService.composeDown as ReturnType<typeof vi.fn>).mockResolvedValue('Stopped');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'down',
        action_subaction: 'compose:down',
        host: 'tootie',
        project: 'plex',
        remove_volumes: false
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeDown).toHaveBeenCalled();
      expect(result).toContain('plex');
      expect(result).toContain('stopped');
    });

    it('should stop project with volume removal', async () => {
      (mockComposeService.composeDown as ReturnType<typeof vi.fn>).mockResolvedValue('Stopped with volumes');

      await handleComposeAction({
        action: 'compose',
        subaction: 'down',
        action_subaction: 'compose:down',
        host: 'tootie',
        project: 'plex',
        force: true,
        remove_volumes: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeDown).toHaveBeenCalledWith(
        expect.anything(),
        'plex',
        true
      );
    });

    it('should require force when removing volumes', async () => {
      await expect(
        handleComposeAction({
          action: 'compose',
          subaction: 'down',
          action_subaction: 'compose:down',
          host: 'tootie',
          project: 'plex',
          remove_volumes: true
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Compose down with remove_volumes requires force=true to prevent accidental data loss');

      expect(mockComposeService.composeDown).not.toHaveBeenCalled();
    });
  });

  describe('restart subaction', () => {
    it('should restart project', async () => {
      (mockComposeService.composeRestart as ReturnType<typeof vi.fn>).mockResolvedValue('Restarted');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'restart',
        action_subaction: 'compose:restart',
        host: 'tootie',
        project: 'plex'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeRestart).toHaveBeenCalled();
      expect(result).toContain('plex');
      expect(result).toContain('restarted');
    });
  });

  describe('logs subaction', () => {
    it('should get project logs', async () => {
      (mockComposeService.composeLogs as ReturnType<typeof vi.fn>).mockResolvedValue('Log line 1\nLog line 2');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'logs',
        action_subaction: 'compose:logs',
        host: 'tootie',
        project: 'plex',
        lines: 100
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeLogs).toHaveBeenCalled();
      expect(result).toContain('Log line 1');
    });

    it('should get logs for specific service', async () => {
      (mockComposeService.composeLogs as ReturnType<typeof vi.fn>).mockResolvedValue('Service log');

      await handleComposeAction({
        action: 'compose',
        subaction: 'logs',
        action_subaction: 'compose:logs',
        host: 'tootie',
        project: 'plex',
        service: 'plex-server'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeLogs).toHaveBeenCalledWith(
        expect.anything(),
        'plex',
        expect.objectContaining({
          services: ['plex-server']
        })
      );
    });

    it('should filter logs by grep pattern', async () => {
      (mockComposeService.composeLogs as ReturnType<typeof vi.fn>).mockResolvedValue('Error: something failed\nInfo: normal log\nError: another failure');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'logs',
        action_subaction: 'compose:logs',
        host: 'tootie',
        project: 'plex',
        grep: 'Error'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      // Verify matching lines are included
      expect(result).toContain('Error');
      // Verify non-matching lines are excluded
      expect(result).not.toContain('Info: normal log');
    });
  });

  describe('build subaction', () => {
    it('should build project images', async () => {
      (mockComposeService.composeBuild as ReturnType<typeof vi.fn>).mockResolvedValue('Build complete');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'build',
        action_subaction: 'compose:build',
        host: 'tootie',
        project: 'plex',
        no_cache: false
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeBuild).toHaveBeenCalled();
      expect(result).toContain('build');
    });

    it('should build with no-cache option', async () => {
      (mockComposeService.composeBuild as ReturnType<typeof vi.fn>).mockResolvedValue('Build complete');

      await handleComposeAction({
        action: 'compose',
        subaction: 'build',
        action_subaction: 'compose:build',
        host: 'tootie',
        project: 'plex',
        no_cache: true
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeBuild).toHaveBeenCalledWith(
        expect.anything(),
        'plex',
        expect.objectContaining({
          noCache: true
        })
      );
    });
  });

  describe('pull subaction', () => {
    it('should pull project images', async () => {
      (mockComposeService.composePull as ReturnType<typeof vi.fn>).mockResolvedValue('Pull complete');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'pull',
        action_subaction: 'compose:pull',
        host: 'tootie',
        project: 'plex'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composePull).toHaveBeenCalled();
      expect(result).toContain('pull');
    });

    it('should pull specific service', async () => {
      (mockComposeService.composePull as ReturnType<typeof vi.fn>).mockResolvedValue('Pull complete');

      await handleComposeAction({
        action: 'compose',
        subaction: 'pull',
        action_subaction: 'compose:pull',
        host: 'tootie',
        project: 'plex',
        service: 'plex-server'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composePull).toHaveBeenCalledWith(
        expect.anything(),
        'plex',
        expect.objectContaining({
          service: 'plex-server'
        })
      );
    });
  });

  describe('recreate subaction', () => {
    it('should recreate project containers', async () => {
      (mockComposeService.composeRecreate as ReturnType<typeof vi.fn>).mockResolvedValue('Recreated');

      const result = await handleComposeAction({
        action: 'compose',
        subaction: 'recreate',
        action_subaction: 'compose:recreate',
        host: 'tootie',
        project: 'plex'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeRecreate).toHaveBeenCalled();
      expect(result).toContain('recreat');
    });

    it('should recreate specific service', async () => {
      (mockComposeService.composeRecreate as ReturnType<typeof vi.fn>).mockResolvedValue('Recreated');

      await handleComposeAction({
        action: 'compose',
        subaction: 'recreate',
        action_subaction: 'compose:recreate',
        host: 'tootie',
        project: 'plex',
        service: 'plex-server'
      } as unknown as FluxInput, mockContainer as ServiceContainer);

      expect(mockComposeService.composeRecreate).toHaveBeenCalledWith(
        expect.anything(),
        'plex',
        expect.objectContaining({
          service: 'plex-server'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleComposeAction({
          action: 'container',
          subaction: 'list'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid action for compose handler');
    });

    it('should throw on unknown host', async () => {
      // Use mockReturnValueOnce to avoid polluting other tests
      vi.mocked(await import('../../services/docker.js')).loadHostConfigs.mockReturnValueOnce([]);

      await expect(
        handleComposeAction({
          action: 'compose',
          subaction: 'list',
          action_subaction: 'compose:list',
          host: 'unknown-host'
        } as unknown as FluxInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });
  });
});
