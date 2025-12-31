// src/services/compose-discovery.ts
import type { HostConfig } from '../types.js';
import type { IComposeProjectLister } from './interfaces.js';
import type { ComposeProjectCache, CachedProject } from './compose-cache.js';
import type { ComposeScanner } from './compose-scanner.js';
import { logError } from '../utils/errors.js';

const DEFAULT_SEARCH_PATHS = ['/compose', '/mnt/cache/compose', '/mnt/cache/code'];

export class ComposeDiscovery {
  constructor(
    private projectLister: IComposeProjectLister,
    public cache: ComposeProjectCache,  // Public for cache invalidation in handlers
    private scanner: ComposeScanner
  ) {}

  private getSearchPaths(host: HostConfig, cachedPaths: string[]): string[] {
    const paths = new Set<string>();

    // Add default paths
    DEFAULT_SEARCH_PATHS.forEach(p => paths.add(p));

    // Add cached paths
    cachedPaths.forEach(p => paths.add(p));

    // Add user-configured paths
    if (host.composeSearchPaths) {
      host.composeSearchPaths.forEach(p => paths.add(p));
    }

    return Array.from(paths);
  }

  private async discoverFromDockerLs(
    host: HostConfig,
    projectName: string
  ): Promise<CachedProject | null> {
    try {
      const projects = await this.projectLister.listComposeProjects(host);
      const found = projects.find(p => p.name === projectName);

      if (found && found.configFiles.length > 0) {
        return {
          path: found.configFiles[0],
          name: projectName,
          discoveredFrom: 'docker-ls',
          lastSeen: new Date().toISOString()
        };
      }
    } catch (error) {
      logError(error as Error, {
        operation: 'discoverFromDockerLs',
        metadata: { host: host.name, project: projectName }
      });
    }

    return null;
  }

  private async discoverFromFilesystem(
    host: HostConfig,
    projectName: string
  ): Promise<CachedProject | null> {
    try {
      const cacheData = await this.cache.load(host.name);
      const searchPaths = this.getSearchPaths(host, cacheData.searchPaths);

      const files = await this.scanner.findComposeFiles(host, searchPaths);

      // Parse all files in parallel
      const projects = await Promise.all(
        files.map(async (file) => {
          const dirName = this.scanner.extractProjectName(file);
          const explicitName = await this.scanner.parseComposeName(host, file);
          const name = explicitName ?? dirName;

          return { name, path: file };
        })
      );

      const found = projects.find(p => p.name === projectName);
      if (found) {
        return {
          path: found.path,
          name: found.name,
          discoveredFrom: 'scan',
          lastSeen: new Date().toISOString()
        };
      }
    } catch (error) {
      logError(error as Error, {
        operation: 'discoverFromFilesystem',
        metadata: { host: host.name, project: projectName }
      });
    }

    return null;
  }

  /**
   * Resolve compose file path for a project
   * Strategy:
   * 1. Check cache (trust it - lazy invalidation at handler level)
   * 2. Check docker compose ls (running projects) - FAST
   * 3. Scan filesystem if not found - SLOWER
   * 4. Error if not found
   */
  async resolveProjectPath(host: HostConfig, projectName: string): Promise<string> {
    // Step 1: Check cache (no validation - lazy invalidation)
    const cached = await this.cache.getProject(host.name, projectName);
    if (cached) {
      return cached.path;
    }

    // Step 2: Try docker ls first (fast, authoritative for running projects)
    const dockerLsResult = await this.discoverFromDockerLs(host, projectName);
    if (dockerLsResult) {
      await this.cache.updateProject(host.name, projectName, dockerLsResult);
      return dockerLsResult.path;
    }

    // Step 3: Fallback to filesystem scan (slower, but finds stopped projects)
    const scanResult = await this.discoverFromFilesystem(host, projectName);
    if (scanResult) {
      await this.cache.updateProject(host.name, projectName, scanResult);
      return scanResult.path;
    }

    // Step 4: Not found
    const cacheData = await this.cache.load(host.name);
    const searchPaths = cacheData.searchPaths.length > 0
      ? cacheData.searchPaths
      : DEFAULT_SEARCH_PATHS;

    throw new Error(
      `Project '${projectName}' not found on host '${host.name}'\n` +
      `Searched locations: ${searchPaths.join(', ')}\n` +
      `Tip: Provide compose_file parameter if project is in a different location`
    );
  }
}
