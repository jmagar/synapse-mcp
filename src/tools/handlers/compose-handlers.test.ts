// src/tools/handlers/compose-handlers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleComposeUp,
  handleComposeDown,
  handleComposeRestart,
  handleComposeLogs,
  handleComposeBuild,
  handleComposePull,
  handleComposeRecreate
} from './compose-handlers.js';
import type { ServiceContainer } from '../../services/container.js';
import type { ComposeService } from '../../services/compose.js';
import type { ComposeDiscovery } from '../../services/compose-discovery.js';
import type { HostResolver } from '../../services/host-resolver.js';
import type { HostConfig } from '../../types.js';
import type {
  ComposeUpInput,
  ComposeDownInput,
  ComposeRestartInput,
  ComposeLogsInput,
  ComposeBuildInput,
  ComposePullInput,
  ComposeRecreateInput
} from '../../schemas/flux/compose.js';

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

describe('Compose Handlers with Discovery', () => {
  let mockComposeService: Partial<ComposeService>;
  let mockDiscovery: Partial<ComposeDiscovery>;
  let mockContainer: Partial<ServiceContainer>;
  let mockHosts: HostConfig[];

  beforeEach(() => {
    mockComposeService = {
      composeUp: vi.fn().mockResolvedValue('Started'),
      composeDown: vi.fn().mockResolvedValue('Stopped'),
      composeRestart: vi.fn().mockResolvedValue('Restarted'),
      composeLogs: vi.fn().mockResolvedValue('log output'),
      composeBuild: vi.fn().mockResolvedValue('Built'),
      composePull: vi.fn().mockResolvedValue('Pulled'),
      composeRecreate: vi.fn().mockResolvedValue('Recreated')
    };

    mockDiscovery = {
      cache: {
        removeProject: vi.fn()
      } as any
    };

    mockContainer = {
      getComposeServiceWithDiscovery: vi.fn().mockReturnValue(mockComposeService),
      getComposeDiscovery: vi.fn().mockReturnValue(mockDiscovery)
    };

    mockHosts = [
      { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
    ];
  });

  describe('handleComposeUp', () => {
    it('should start a project with explicit host', async () => {
      const input: ComposeUpInput = {
        action: 'compose',
        subaction: 'up',
        action_subaction: 'compose:up',
        project: 'plex',
        host: 'tootie',
        detach: true
      };

      const result = await handleComposeUp(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeUp).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        true
      );
      expect(result).toContain('plex');
      expect(result).toContain('tootie');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeUpInput = {
        action: 'compose',
        subaction: 'up',
        action_subaction: 'compose:up',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('/stale/path/compose.yaml: No such file or directory');
      (mockComposeService.composeUp as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposeUp(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow(fileNotFoundError);

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposeDown', () => {
    it('should stop a project', async () => {
      const input: ComposeDownInput = {
        action: 'compose',
        subaction: 'down',
        action_subaction: 'compose:down',
        project: 'plex',
        host: 'tootie',
        remove_volumes: false
      };

      const result = await handleComposeDown(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeDown).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        false
      );
      expect(result).toContain('plex');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeDownInput = {
        action: 'compose',
        subaction: 'down',
        action_subaction: 'compose:down',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('compose.yaml does not exist');
      (mockComposeService.composeDown as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposeDown(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposeRestart', () => {
    it('should restart a project', async () => {
      const input: ComposeRestartInput = {
        action: 'compose',
        subaction: 'restart',
        action_subaction: 'compose:restart',
        project: 'plex',
        host: 'tootie'
      };

      const result = await handleComposeRestart(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeRestart).toHaveBeenCalledWith(mockHosts[0], 'plex');
      expect(result).toContain('plex');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeRestartInput = {
        action: 'compose',
        subaction: 'restart',
        action_subaction: 'compose:restart',
        project: 'plex',
        host: 'tootie'
      };

      const enoentError = { code: 'ENOENT', message: 'File not found' };
      (mockComposeService.composeRestart as ReturnType<typeof vi.fn>).mockRejectedValue(enoentError);

      await expect(
        handleComposeRestart(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposeLogs', () => {
    it('should fetch logs for a project', async () => {
      const input: ComposeLogsInput = {
        action: 'compose',
        subaction: 'logs',
        action_subaction: 'compose:logs',
        project: 'plex',
        host: 'tootie',
        lines: 100
      };

      const result = await handleComposeLogs(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeLogs).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        { tail: 100 }
      );
      expect(result).toContain('log output');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeLogsInput = {
        action: 'compose',
        subaction: 'logs',
        action_subaction: 'compose:logs',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('cannot find compose file');
      (mockComposeService.composeLogs as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposeLogs(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposeBuild', () => {
    it('should build a project', async () => {
      const input: ComposeBuildInput = {
        action: 'compose',
        subaction: 'build',
        action_subaction: 'compose:build',
        project: 'plex',
        host: 'tootie',
        no_cache: true
      };

      const result = await handleComposeBuild(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeBuild).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        { noCache: true }
      );
      expect(result).toContain('plex');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeBuildInput = {
        action: 'compose',
        subaction: 'build',
        action_subaction: 'compose:build',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('/path/compose.yaml: No such file or directory');
      (mockComposeService.composeBuild as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposeBuild(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposePull', () => {
    it('should pull images for a project', async () => {
      const input: ComposePullInput = {
        action: 'compose',
        subaction: 'pull',
        action_subaction: 'compose:pull',
        project: 'plex',
        host: 'tootie',
        service: 'web'
      };

      const result = await handleComposePull(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composePull).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        { service: 'web' }
      );
      expect(result).toContain('plex');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposePullInput = {
        action: 'compose',
        subaction: 'pull',
        action_subaction: 'compose:pull',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('compose.yaml does not exist');
      (mockComposeService.composePull as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposePull(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });

  describe('handleComposeRecreate', () => {
    it('should recreate a project', async () => {
      const input: ComposeRecreateInput = {
        action: 'compose',
        subaction: 'recreate',
        action_subaction: 'compose:recreate',
        project: 'plex',
        host: 'tootie',
        service: 'web'
      };

      const result = await handleComposeRecreate(input, mockHosts, mockContainer as ServiceContainer);

      expect(mockComposeService.composeRecreate).toHaveBeenCalledWith(
        mockHosts[0],
        'plex',
        { service: 'web' }
      );
      expect(result).toContain('plex');
    });

    it('should invalidate cache on file-not-found error', async () => {
      const input: ComposeRecreateInput = {
        action: 'compose',
        subaction: 'recreate',
        action_subaction: 'compose:recreate',
        project: 'plex',
        host: 'tootie'
      };

      const fileNotFoundError = new Error('cannot find compose file');
      (mockComposeService.composeRecreate as ReturnType<typeof vi.fn>).mockRejectedValue(fileNotFoundError);

      await expect(
        handleComposeRecreate(input, mockHosts, mockContainer as ServiceContainer)
      ).rejects.toThrow();

      expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('tootie', 'plex');
    });
  });
});
