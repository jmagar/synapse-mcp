// src/services/compose-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { ComposeProjectCache } from './compose-cache.js';
import { HostSecurityError } from '../utils/path-security.js';

describe('ComposeProjectCache', () => {
  const testCacheDir = '.cache/test-compose-projects';
  let cache: ComposeProjectCache;

  beforeEach(async () => {
    await mkdir(testCacheDir, { recursive: true });
    cache = new ComposeProjectCache(testCacheDir);
  });

  afterEach(async () => {
    await rm(testCacheDir, { recursive: true, force: true });
  });

  it('should load empty cache for new host', async () => {
    const data = await cache.load('test-host');

    expect(data).toEqual({
      lastScan: expect.any(String),
      searchPaths: [],
      projects: {}
    });
  });

  it('should save and load cache data', async () => {
    const data = {
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose', '/mnt/cache/compose'],
      projects: {
        plex: {
          path: '/mnt/cache/compose/plex/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'docker-ls' as const,
          lastSeen: new Date().toISOString()
        }
      }
    };

    await cache.save('test-host', data);
    const loaded = await cache.load('test-host');

    expect(loaded).toEqual(data);
  });

  it('should get project from cache', async () => {
    const data = {
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose'],
      projects: {
        plex: {
          path: '/mnt/cache/compose/plex/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'docker-ls' as const,
          lastSeen: new Date().toISOString()
        }
      }
    };

    await cache.save('test-host', data);
    const project = await cache.getProject('test-host', 'plex');

    expect(project?.path).toBe('/mnt/cache/compose/plex/docker-compose.yaml');
  });

  it('should return undefined for missing project', async () => {
    const project = await cache.getProject('test-host', 'missing');
    expect(project).toBeUndefined();
  });

  it('should invalidate stale cache entries based on TTL', async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const data = {
      lastScan: staleDate.toISOString(),
      searchPaths: ['/compose'],
      projects: {
        plex: {
          path: '/mnt/cache/compose/plex/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'docker-ls' as const,
          lastSeen: staleDate.toISOString()
        }
      }
    };

    await cache.save('test-host', data);

    // Should return undefined for stale entry (default TTL: 24 hours)
    const project = await cache.getProject('test-host', 'plex');
    expect(project).toBeUndefined();
  });

  it('should return valid cache entries within TTL', async () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    const data = {
      lastScan: recentDate.toISOString(),
      searchPaths: ['/compose'],
      projects: {
        plex: {
          path: '/mnt/cache/compose/plex/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'docker-ls' as const,
          lastSeen: recentDate.toISOString()
        }
      }
    };

    await cache.save('test-host', data);

    // Should return entry within TTL
    const project = await cache.getProject('test-host', 'plex');
    expect(project?.path).toBe('/mnt/cache/compose/plex/docker-compose.yaml');
  });

  it('should update existing project', async () => {
    // Save initial project
    const initial = {
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose'],
      projects: {
        plex: {
          path: '/old/path/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'scan' as const,
          lastSeen: new Date().toISOString()
        }
      }
    };
    await cache.save('test-host', initial);

    // Update project
    await cache.updateProject('test-host', 'plex', {
      path: '/new/path/docker-compose.yaml',
      name: 'plex',
      discoveredFrom: 'docker-ls' as const,
      lastSeen: new Date().toISOString()
    });

    // Verify update
    const project = await cache.getProject('test-host', 'plex');
    expect(project?.path).toBe('/new/path/docker-compose.yaml');
    expect(project?.discoveredFrom).toBe('docker-ls');
  });

  it('should add new project via updateProject', async () => {
    // Update non-existent project (should add it)
    await cache.updateProject('test-host', 'sonarr', {
      path: '/compose/sonarr/docker-compose.yaml',
      name: 'sonarr',
      discoveredFrom: 'scan' as const,
      lastSeen: new Date().toISOString()
    });

    const project = await cache.getProject('test-host', 'sonarr');
    expect(project?.name).toBe('sonarr');
  });

  it('should update lastScan timestamp on updateProject', async () => {
    const before = Date.now();

    await cache.updateProject('test-host', 'test', {
      path: '/test/docker-compose.yaml',
      name: 'test',
      discoveredFrom: 'scan' as const,
      lastSeen: new Date().toISOString()
    });

    const data = await cache.load('test-host');
    const after = new Date(data.lastScan).getTime();

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('should remove project from cache', async () => {
    const data = {
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose'],
      projects: {
        plex: {
          path: '/compose/plex/docker-compose.yaml',
          name: 'plex',
          discoveredFrom: 'docker-ls' as const,
          lastSeen: new Date().toISOString()
        }
      }
    };
    await cache.save('test-host', data);

    // Remove project
    await cache.removeProject('test-host', 'plex');

    // Verify removed
    const project = await cache.getProject('test-host', 'plex');
    expect(project).toBeUndefined();
  });

  it('should handle removing non-existent project gracefully', async () => {
    // Should not throw
    await cache.removeProject('test-host', 'non-existent');

    // Cache should still be valid
    const data = await cache.load('test-host');
    expect(data.projects).toEqual({});
  });

  describe('Security: Host Validation', () => {
    it('should reject path traversal in load()', async () => {
      await expect(cache.load('../../../etc')).rejects.toThrow(HostSecurityError);
    });

    it('should reject path traversal in save()', async () => {
      const data = {
        lastScan: new Date().toISOString(),
        searchPaths: [],
        projects: {}
      };
      await expect(cache.save('../../../etc', data)).rejects.toThrow(HostSecurityError);
    });

    it('should reject shell metacharacters in host', async () => {
      await expect(cache.load('host; rm -rf /')).rejects.toThrow(HostSecurityError);
    });

    it('should accept valid hostnames', async () => {
      const validHosts = ['test-host', 'host_123', 'host.domain.com', 'server-01'];

      for (const host of validHosts) {
        await expect(cache.load(host)).resolves.toBeDefined();
      }
    });
  });

  describe('Runtime Validation', () => {
    it('should reject corrupted cache file with invalid schema', async () => {
      // Write corrupted cache file directly
      const corruptedData = {
        lastScan: new Date().toISOString(),
        searchPaths: ['/compose'],
        projects: {
          plex: {
            path: '/compose/plex/docker-compose.yaml',
            name: 'plex',
            // Missing required field: discoveredFrom
            lastSeen: new Date().toISOString()
          }
        }
      };

      await mkdir(testCacheDir, { recursive: true });
      const { writeFile } = await import('fs/promises');
      await writeFile(
        `${testCacheDir}/corrupted-host.json`,
        JSON.stringify(corruptedData)
      );

      await expect(cache.load('corrupted-host')).rejects.toThrow('Cache file validation failed');
    });

    it('should reject cache file with invalid project type', async () => {
      // Write cache file with wrong discoveredFrom value
      const invalidData = {
        lastScan: new Date().toISOString(),
        searchPaths: ['/compose'],
        projects: {
          plex: {
            path: '/compose/plex/docker-compose.yaml',
            name: 'plex',
            discoveredFrom: 'invalid-source',  // Not in enum
            lastSeen: new Date().toISOString()
          }
        }
      };

      await mkdir(testCacheDir, { recursive: true });
      const { writeFile } = await import('fs/promises');
      await writeFile(
        `${testCacheDir}/invalid-type-host.json`,
        JSON.stringify(invalidData)
      );

      await expect(cache.load('invalid-type-host')).rejects.toThrow('Cache file validation failed');
    });
  });
});
