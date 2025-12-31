// src/services/compose-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { ComposeProjectCache } from './compose-cache.js';

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
});
