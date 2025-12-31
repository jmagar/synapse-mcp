// src/services/compose-discovery.integration.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComposeDiscovery } from './compose-discovery.js';
import { ComposeProjectCache } from './compose-cache.js';
import { ComposeScanner } from './compose-scanner.js';
import { HostResolver } from './host-resolver.js';
import type { HostConfig, ComposeProject } from '../types.js';
import type { IComposeProjectLister } from './interfaces.js';
import { mkdir, rm } from 'fs/promises';

/**
 * Integration tests for the complete compose auto-discovery system.
 * These tests verify end-to-end workflows from handler to cache,
 * using real service instances (but mocking SSH/Docker operations).
 */
describe('Compose Discovery Integration', () => {
  const testCacheDir = '.cache/test-compose-projects';
  let discovery: ComposeDiscovery;
  let cache: ComposeProjectCache;
  let mockProjectLister: IComposeProjectLister;
  let mockScanner: ComposeScanner;
  let testHost: HostConfig;
  let multipleHosts: HostConfig[];

  beforeEach(async () => {
    // Clean up test cache directory
    await rm(testCacheDir, { recursive: true, force: true });
    await mkdir(testCacheDir, { recursive: true });

    // Create real service instances
    cache = new ComposeProjectCache(testCacheDir, 1000); // 1 second TTL for testing

    // Mock project lister (simulates ComposeService)
    mockProjectLister = {
      listComposeProjects: vi.fn()
    };

    // Mock scanner (simulates filesystem operations)
    mockScanner = {
      findComposeFiles: vi.fn(),
      extractProjectName: vi.fn(),
      parseComposeName: vi.fn()
    } as any;

    discovery = new ComposeDiscovery(mockProjectLister, cache, mockScanner);

    testHost = {
      name: 'test-host',
      host: 'localhost',
      protocol: 'local',
      composeSearchPaths: ['/tmp/test-stacks']
    };

    multipleHosts = [
      { name: 'host1', host: '192.168.1.10', protocol: 'ssh' },
      { name: 'host2', host: '192.168.1.20', protocol: 'ssh' },
      { name: 'host3', host: '192.168.1.30', protocol: 'ssh' }
    ];
  });

  afterEach(async () => {
    // Cleanup test cache
    await rm(testCacheDir, { recursive: true, force: true });
  });

  describe('Multi-layer discovery flow', () => {
    it('should try cache first, then docker-ls, then filesystem', async () => {
      // Setup: Cache miss, docker-ls success
      const mockProjects: ComposeProject[] = [{
        name: 'plex',
        status: 'running',
        configFiles: ['/compose/plex/docker-compose.yaml'],
        services: []
      }];

      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue(mockProjects);

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'plex');

      // Verify
      expect(result).toBe('/compose/plex/docker-compose.yaml');

      // Cache was checked first
      const cachedProject = await cache.getProject(testHost.name, 'plex');
      expect(cachedProject).toBeDefined();
      expect(cachedProject?.discoveredFrom).toBe('docker-ls');

      // Docker ls was called
      expect(mockProjectLister.listComposeProjects).toHaveBeenCalledOnce();

      // Filesystem scan was NOT needed
      expect(mockScanner.findComposeFiles).not.toHaveBeenCalled();
    });

    it('should fallback to filesystem scan when docker-ls fails', async () => {
      // Setup: Cache miss, docker-ls returns nothing, filesystem scan succeeds
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([
        '/tmp/test-stacks/jellyfin/compose.yaml'
      ]);
      vi.mocked(mockScanner.extractProjectName).mockReturnValue('jellyfin');
      vi.mocked(mockScanner.parseComposeName).mockResolvedValue(null);

      // Mock cache.load for scanner
      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: [],
        projects: {}
      });

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'jellyfin');

      // Verify complete flow
      expect(result).toBe('/tmp/test-stacks/jellyfin/compose.yaml');
      expect(mockProjectLister.listComposeProjects).toHaveBeenCalledOnce();
      expect(mockScanner.findComposeFiles).toHaveBeenCalledOnce();

      const cached = await cache.getProject(testHost.name, 'jellyfin');
      expect(cached?.discoveredFrom).toBe('scan');
    });

    it('should return cached result when available', async () => {
      // Setup: Pre-populate cache
      await cache.updateProject(testHost.name, 'plex', {
        path: '/compose/plex/docker-compose.yaml',
        name: 'plex',
        discoveredFrom: 'docker-ls',
        lastSeen: new Date().toISOString()
      });

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'plex');

      // Verify: Cache hit, no scanning
      expect(result).toBe('/compose/plex/docker-compose.yaml');
      expect(mockProjectLister.listComposeProjects).not.toHaveBeenCalled();
      expect(mockScanner.findComposeFiles).not.toHaveBeenCalled();
    });

    it('should update cache after filesystem discovery', async () => {
      // Setup: Force filesystem scan
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([
        '/mnt/cache/code/sonarr/docker-compose.yaml'
      ]);
      vi.mocked(mockScanner.extractProjectName).mockReturnValue('sonarr');
      vi.mocked(mockScanner.parseComposeName).mockResolvedValue(null);

      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: [],
        projects: {}
      });

      // Execute
      await discovery.resolveProjectPath(testHost, 'sonarr');

      // Verify cache was updated
      const cached = await cache.getProject(testHost.name, 'sonarr');
      expect(cached).toBeDefined();
      expect(cached?.path).toBe('/mnt/cache/code/sonarr/docker-compose.yaml');
      expect(cached?.name).toBe('sonarr');
      expect(cached?.discoveredFrom).toBe('scan');
    });

    it('should throw error when project not found anywhere', async () => {
      // Setup: All discovery methods fail
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([]);

      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: ['/compose'],
        projects: {}
      });

      // Execute & Verify
      await expect(
        discovery.resolveProjectPath(testHost, 'missing-project')
      ).rejects.toThrow("Project 'missing-project' not found on host 'test-host'");
    });
  });

  describe('Host resolution', () => {
    it('should find project across multiple hosts', async () => {
      const resolver = new HostResolver(discovery, multipleHosts);

      // Setup: Project only on host2
      vi.mocked(mockProjectLister.listComposeProjects).mockImplementation(
        async (host: HostConfig) => {
          if (host.name === 'host2') {
            return [{
              name: 'webapp',
              status: 'running',
              configFiles: ['/opt/webapp/compose.yaml'],
              services: []
            }];
          }
          return [];
        }
      );

      // Setup filesystem scanner to return empty array (no filesystem projects)
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([]);

      // Execute
      const resolvedHost = await resolver.resolveHost('webapp');

      // Verify correct host found
      expect(resolvedHost.name).toBe('host2');
      expect(resolvedHost.host).toBe('192.168.1.20');
    });

    it('should timeout after 30 seconds', async () => {
      const resolver = new HostResolver(discovery, multipleHosts);

      // Setup: Slow responses
      vi.mocked(mockProjectLister.listComposeProjects).mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve([]), 35000);
        })
      );

      // Execute & Verify
      await expect(
        resolver.resolveHost('slow-project')
      ).rejects.toThrow('Host resolution timed out after 30000ms');
    }, 35000);

    it('should throw when project on multiple hosts', async () => {
      const resolver = new HostResolver(discovery, multipleHosts);

      // Setup: Project on host1 and host3
      vi.mocked(mockProjectLister.listComposeProjects).mockImplementation(
        async (host: HostConfig) => {
          if (host.name === 'host1' || host.name === 'host3') {
            return [{
              name: 'duplicated',
              status: 'running',
              configFiles: ['/opt/duplicated/compose.yaml'],
              services: []
            }];
          }
          return [];
        }
      );

      // Setup filesystem scanner to return empty array (no filesystem projects)
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([]);

      // Execute & Verify
      await expect(
        resolver.resolveHost('duplicated')
      ).rejects.toThrow(
        'Project "duplicated" found on multiple hosts: host1, host3. Please specify which host to use.'
      );
    });

    it('should respect specified host parameter', async () => {
      const resolver = new HostResolver(discovery, multipleHosts);

      // Execute with specified host (no discovery needed)
      const resolvedHost = await resolver.resolveHost('any-project', 'host2');

      // Verify
      expect(resolvedHost.name).toBe('host2');
      expect(mockProjectLister.listComposeProjects).not.toHaveBeenCalled();
    });

    it('should throw error for invalid specified host', async () => {
      const resolver = new HostResolver(discovery, multipleHosts);

      await expect(
        resolver.resolveHost('any-project', 'nonexistent-host')
      ).rejects.toThrow('Host "nonexistent-host" not found in configuration');
    });
  });

  describe('Cache invalidation and re-discovery', () => {
    it('should not return stale cache entries', async () => {
      // Setup: Add entry with old timestamp
      const oldTimestamp = new Date(Date.now() - 2000).toISOString(); // 2 seconds ago, TTL is 1 second
      await cache.updateProject(testHost.name, 'stale-project', {
        path: '/old/path/compose.yaml',
        name: 'stale-project',
        discoveredFrom: 'scan',
        lastSeen: oldTimestamp
      });

      // Setup fresh discovery
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'stale-project',
        status: 'running',
        configFiles: ['/new/path/compose.yaml'],
        services: []
      }]);

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'stale-project');

      // Verify: Should have re-discovered (stale cache ignored)
      expect(result).toBe('/new/path/compose.yaml');
      expect(mockProjectLister.listComposeProjects).toHaveBeenCalledOnce();
    });

    it('should allow manual cache invalidation', async () => {
      // Setup: Populate cache
      await cache.updateProject(testHost.name, 'myproject', {
        path: '/old/path/compose.yaml',
        name: 'myproject',
        discoveredFrom: 'scan',
        lastSeen: new Date().toISOString()
      });

      // Manually invalidate
      await cache.removeProject(testHost.name, 'myproject');

      // Setup re-discovery
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'myproject',
        status: 'running',
        configFiles: ['/new/path/compose.yaml'],
        services: []
      }]);

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'myproject');

      // Verify re-discovery happened
      expect(result).toBe('/new/path/compose.yaml');
      const cached = await cache.getProject(testHost.name, 'myproject');
      expect(cached?.path).toBe('/new/path/compose.yaml');
    });

    it('should re-discover after cache invalidation', async () => {
      // Setup: Initial discovery
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'evolving-project',
        status: 'running',
        configFiles: ['/path1/compose.yaml'],
        services: []
      }]);

      await discovery.resolveProjectPath(testHost, 'evolving-project');

      // Invalidate
      await cache.removeProject(testHost.name, 'evolving-project');

      // Update mock for new location
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'evolving-project',
        status: 'running',
        configFiles: ['/path2/compose.yaml'],
        services: []
      }]);

      // Re-discover
      const newPath = await discovery.resolveProjectPath(testHost, 'evolving-project');

      expect(newPath).toBe('/path2/compose.yaml');
    });
  });

  describe('Search path management', () => {
    it('should merge default, cached, and user-configured paths', async () => {
      // Setup: Cache with some paths
      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: ['/cached/path'],
        projects: {}
      });

      // Host with custom paths
      const hostWithPaths: HostConfig = {
        name: 'custom-host',
        host: 'localhost',
        protocol: 'local',
        composeSearchPaths: ['/custom/path']
      };

      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([]);

      // Execute (will fail, but that's OK - we're testing path merging)
      try {
        await discovery.resolveProjectPath(hostWithPaths, 'test-project');
      } catch {
        // Expected to fail - project not found
      }

      // Verify scanner was called with merged paths
      expect(mockScanner.findComposeFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          composeSearchPaths: expect.arrayContaining([
            '/compose',                 // default
            '/mnt/cache/compose',       // default
            '/mnt/cache/code',          // default
            '/cached/path',             // from cache
            '/custom/path'              // user-configured
          ])
        })
      );
    });
  });

  describe('Error handling and resilience', () => {
    it('should handle docker-ls errors gracefully', async () => {
      // Setup: docker-ls throws error, but filesystem scan succeeds
      vi.mocked(mockProjectLister.listComposeProjects).mockRejectedValue(
        new Error('Docker daemon not reachable')
      );

      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([
        '/fallback/app/compose.yaml'
      ]);
      vi.mocked(mockScanner.extractProjectName).mockReturnValue('app');
      vi.mocked(mockScanner.parseComposeName).mockResolvedValue(null);

      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: [],
        projects: {}
      });

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'app');

      // Verify fallback worked
      expect(result).toBe('/fallback/app/compose.yaml');
    });

    it('should handle filesystem scan errors gracefully', async () => {
      // Setup: docker-ls succeeds, filesystem scan throws error (shouldn't be called)
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'reliable-app',
        status: 'running',
        configFiles: ['/docker/app/compose.yaml'],
        services: []
      }]);

      vi.mocked(mockScanner.findComposeFiles).mockRejectedValue(
        new Error('Filesystem error')
      );

      // Execute
      const result = await discovery.resolveProjectPath(testHost, 'reliable-app');

      // Verify docker-ls result was used (filesystem scan not needed)
      expect(result).toBe('/docker/app/compose.yaml');
    });

    it('should handle explicit project name from compose file', async () => {
      // Setup: Project has explicit name in compose file
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
      vi.mocked(mockScanner.findComposeFiles).mockResolvedValue([
        '/stacks/my-folder/compose.yaml'
      ]);
      vi.mocked(mockScanner.extractProjectName).mockReturnValue('my-folder');
      vi.mocked(mockScanner.parseComposeName).mockResolvedValue('explicit-name');

      const loadSpy = vi.spyOn(cache, 'load');
      loadSpy.mockResolvedValue({
        lastScan: new Date().toISOString(),
        searchPaths: [],
        projects: {}
      });

      // Execute with explicit name
      const result = await discovery.resolveProjectPath(testHost, 'explicit-name');

      // Verify found by explicit name, not directory name
      expect(result).toBe('/stacks/my-folder/compose.yaml');

      const cached = await cache.getProject(testHost.name, 'explicit-name');
      expect(cached?.name).toBe('explicit-name');
    });
  });

  describe('Performance and caching behavior', () => {
    it('should use cache for repeated lookups', async () => {
      // Setup initial discovery
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'cached-app',
        status: 'running',
        configFiles: ['/app/compose.yaml'],
        services: []
      }]);

      // First call
      await discovery.resolveProjectPath(testHost, 'cached-app');
      expect(mockProjectLister.listComposeProjects).toHaveBeenCalledOnce();

      // Second call (should use cache)
      const result = await discovery.resolveProjectPath(testHost, 'cached-app');
      expect(result).toBe('/app/compose.yaml');

      // Should NOT call docker-ls again
      expect(mockProjectLister.listComposeProjects).toHaveBeenCalledOnce();
    });

    it('should handle concurrent lookups for same project', async () => {
      vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([{
        name: 'concurrent-app',
        status: 'running',
        configFiles: ['/app/compose.yaml'],
        services: []
      }]);

      // Execute concurrent lookups
      const results = await Promise.allSettled([
        discovery.resolveProjectPath(testHost, 'concurrent-app'),
        discovery.resolveProjectPath(testHost, 'concurrent-app'),
        discovery.resolveProjectPath(testHost, 'concurrent-app')
      ]);

      // At least one should succeed (race conditions on cache writes are acceptable)
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);

      // All successful results should have same path
      for (const result of results) {
        if (result.status === 'fulfilled') {
          expect(result.value).toBe('/app/compose.yaml');
        }
      }

      // Cache should eventually have the correct entry
      // Give it a moment to settle from concurrent writes
      await new Promise(resolve => setTimeout(resolve, 10));
      const cached = await cache.getProject(testHost.name, 'concurrent-app');
      expect(cached?.path).toBe('/app/compose.yaml');
    });
  });
});
