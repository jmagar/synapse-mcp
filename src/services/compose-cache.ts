// src/services/compose-cache.ts
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';

export interface CachedProject {
  path: string;
  name: string;
  discoveredFrom: 'docker-ls' | 'scan' | 'user-provided';
  lastSeen: string;
}

export interface CacheData {
  lastScan: string;
  searchPaths: string[];
  projects: Record<string, CachedProject>;
}

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * ⚠️  SECURITY RECOMMENDATION (Code Review Finding):
 *
 * The `host` parameter in load() and save() is used directly in path construction
 * without validation. If `host` contains `../`, it could read/write files outside
 * the cache directory (path traversal vulnerability).
 *
 * REQUIRED FIX:
 * 1. Sanitize `host` parameter to reject path separators (`/`, `\`, `..`)
 * 2. Or use existing `validateSecurePath()` from path-security.ts
 * 3. Add validation in constructor or at start of load()/save()
 *
 * Example:
 * ```typescript
 * private validateHostname(host: string): void {
 *   if (!/^[a-zA-Z0-9_-]+$/.test(host)) {
 *     throw new ValidationError(`Invalid host identifier: ${host}`);
 *   }
 * }
 * ```
 */
export class ComposeProjectCache {
  constructor(
    private cacheDir = '.cache/compose-projects',
    private cacheTtlMs = DEFAULT_CACHE_TTL_MS
  ) {}

  async load(host: string): Promise<CacheData> {
    // TODO: Add host validation here before path construction
    const file = join(this.cacheDir, `${host}.json`);
    try {
      const data = await readFile(file, 'utf-8');
      return JSON.parse(data);
    } catch {
      return this.emptyCache();
    }
  }

  async save(host: string, data: CacheData): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const file = join(this.cacheDir, `${host}.json`);
    const tempFile = join(this.cacheDir, `${host}.json.tmp`);

    // Atomic write: write to temp file in same directory, then rename
    // Using same directory ensures rename works across all filesystems
    await writeFile(tempFile, JSON.stringify(data, null, 2));
    await rename(tempFile, file);
  }

  async getProject(host: string, projectName: string): Promise<CachedProject | undefined> {
    const data = await this.load(host);
    const project = data.projects[projectName];

    // Check TTL - return undefined if stale
    if (project && this.isStale(project.lastSeen)) {
      return undefined;
    }

    return project;
  }

  /**
   * Check if a cache entry is stale based on TTL
   */
  private isStale(lastSeenIso: string): boolean {
    const lastSeen = new Date(lastSeenIso).getTime();
    const now = Date.now();
    return (now - lastSeen) > this.cacheTtlMs;
  }

  async updateProject(
    host: string,
    projectName: string,
    project: CachedProject
  ): Promise<void> {
    const data = await this.load(host);
    data.projects[projectName] = project;
    data.lastScan = new Date().toISOString();
    await this.save(host, data);
  }

  async removeProject(host: string, projectName: string): Promise<void> {
    const data = await this.load(host);
    delete data.projects[projectName];
    await this.save(host, data);
  }

  private emptyCache(): CacheData {
    return {
      lastScan: new Date().toISOString(),
      searchPaths: [],
      projects: {}
    };
  }
}
