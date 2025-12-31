// src/services/compose-discovery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComposeDiscovery } from './compose-discovery.js';
import type { IComposeProjectLister } from './interfaces.js';
import { ComposeProjectCache } from './compose-cache.js';
import { ComposeScanner } from './compose-scanner.js';

describe('ComposeDiscovery', () => {
  const mockProjectLister: IComposeProjectLister = {
    listComposeProjects: vi.fn()
  };

  const mockCache = {
    load: vi.fn(),
    save: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn()
  } as any;

  const mockScanner = {
    findComposeFiles: vi.fn(),
    extractProjectName: vi.fn(),
    parseComposeName: vi.fn()
  } as any;

  let discovery: ComposeDiscovery;

  beforeEach(() => {
    vi.clearAllMocks();
    discovery = new ComposeDiscovery(mockProjectLister, mockCache, mockScanner);
  });

  it('should return cached path if found', async () => {
    mockCache.getProject.mockResolvedValue({
      path: '/compose/plex/docker-compose.yaml',
      name: 'plex',
      discoveredFrom: 'docker-ls',
      lastSeen: new Date().toISOString()
    });

    const host = { name: 'test', host: 'localhost', protocol: 'ssh' as const };
    const result = await discovery.resolveProjectPath(host, 'plex');

    expect(result).toBe('/compose/plex/docker-compose.yaml');
    expect(mockProjectLister.listComposeProjects).not.toHaveBeenCalled();
  });

  it('should discover from docker compose ls if not cached', async () => {
    mockCache.getProject.mockResolvedValue(undefined);
    vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([
      {
        name: 'plex',
        status: 'running',
        configFiles: ['/compose/plex/docker-compose.yaml'],
        services: []
      }
    ]);

    const host = { name: 'test', host: 'localhost', protocol: 'ssh' as const };
    const result = await discovery.resolveProjectPath(host, 'plex');

    expect(result).toBe('/compose/plex/docker-compose.yaml');
    expect(mockCache.updateProject).toHaveBeenCalledWith(
      'test',
      'plex',
      expect.objectContaining({
        path: '/compose/plex/docker-compose.yaml',
        discoveredFrom: 'docker-ls'
      })
    );
  });

  it('should scan filesystem if not found in docker ls', async () => {
    mockCache.getProject.mockResolvedValue(undefined);
    mockCache.load.mockResolvedValue({
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose'],
      projects: {}
    });
    vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
    mockScanner.findComposeFiles.mockResolvedValue([
      '/compose/plex/docker-compose.yaml'
    ]);
    mockScanner.extractProjectName.mockReturnValue('plex');
    mockScanner.parseComposeName.mockResolvedValue(null);

    const host = { name: 'test', host: 'localhost', protocol: 'ssh' as const };
    const result = await discovery.resolveProjectPath(host, 'plex');

    expect(result).toBe('/compose/plex/docker-compose.yaml');
    expect(mockScanner.findComposeFiles).toHaveBeenCalled();
  });

  it('should throw error if project not found', async () => {
    mockCache.getProject.mockResolvedValue(undefined);
    mockCache.load.mockResolvedValue({
      lastScan: new Date().toISOString(),
      searchPaths: ['/compose'],
      projects: {}
    });
    vi.mocked(mockProjectLister.listComposeProjects).mockResolvedValue([]);
    mockScanner.findComposeFiles.mockResolvedValue([]);

    const host = { name: 'test', host: 'localhost', protocol: 'ssh' as const };

    await expect(discovery.resolveProjectPath(host, 'missing')).rejects.toThrow(
      "Project 'missing' not found on host 'test'"
    );
  });
});
