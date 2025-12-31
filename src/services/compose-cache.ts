// src/services/compose-cache.ts
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { validateHostFormat } from '../utils/path-security.js';

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

// Zod schemas for runtime validation of JSON cache files
const CachedProjectSchema = z.object({
  path: z.string(),
  name: z.string(),
  discoveredFrom: z.enum(['docker-ls', 'scan', 'user-provided']),
  lastSeen: z.string()
});

const CacheDataSchema = z.object({
  lastScan: z.string(),
  searchPaths: z.array(z.string()),
  projects: z.record(z.string(), CachedProjectSchema)
});

export class ComposeProjectCache {
  constructor(
    private cacheDir = '.cache/compose-projects',
    private cacheTtlMs = DEFAULT_CACHE_TTL_MS
  ) {}

  async load(host: string): Promise<CacheData> {
    // SECURITY: Validate host to prevent path traversal attacks (CWE-22)
    validateHostFormat(host);

    const file = join(this.cacheDir, `${host}.json`);
    try {
      const data = await readFile(file, 'utf-8');
      const parsed = JSON.parse(data);

      // Runtime validation: protect against corrupted cache files
      return CacheDataSchema.parse(parsed);
    } catch (error) {
      // Only return empty cache if file doesn't exist
      // Re-throw validation errors to catch corrupted cache files
      if (error instanceof z.ZodError) {
        throw new Error(`Cache file validation failed for ${host}: ${error.message}`);
      }
      // File not found or JSON parse error - return empty cache
      return this.emptyCache();
    }
  }

  async save(host: string, data: CacheData): Promise<void> {
    // SECURITY: Validate host to prevent path traversal attacks (CWE-22)
    validateHostFormat(host);

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
