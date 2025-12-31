import YAML from "yaml";
import type { HostConfig } from "../types.js";
import type { ISSHService, ILocalExecutorService } from "./interfaces.js";

/**
 * Default search paths for compose files if not specified in host config
 */
const DEFAULT_SEARCH_PATHS = ["/compose", "/mnt/cache/compose", "/mnt/cache/code"];

/**
 * Maximum depth to search for compose files
 */
const MAX_SCAN_DEPTH = 3;

/**
 * Compose file patterns to search for
 */
const COMPOSE_FILE_PATTERNS = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml"
];

/**
 * Service for scanning filesystems to find Docker Compose files.
 * Supports both remote (SSH) and local execution.
 */
export class ComposeScanner {
  constructor(
    private readonly sshService: ISSHService,
    private readonly localExecutor: ILocalExecutorService
  ) {}

  /**
   * Find all compose files in configured search paths.
   * Uses SSH for remote hosts, local execution for localhost.
   *
   * @param host - Host configuration with optional composeSearchPaths
   * @returns Array of absolute paths to compose files
   */
  async findComposeFiles(host: HostConfig): Promise<string[]> {
    const searchPaths = host.composeSearchPaths ?? DEFAULT_SEARCH_PATHS;
    const isLocal = this.isLocalHost(host);

    // Build find command args to avoid shell injection
    // find /path1 /path2 -maxdepth 3 -type f \( -name "docker-compose.yml" -o -name "compose.yaml" ... \) -print
    const args = [
      ...searchPaths,
      "-maxdepth",
      MAX_SCAN_DEPTH.toString(),
      "-type",
      "f",
      "("
    ];

    // Add each pattern with -o (OR) between them
    for (let i = 0; i < COMPOSE_FILE_PATTERNS.length; i++) {
      if (i > 0) {
        args.push("-o");
      }
      args.push("-name", COMPOSE_FILE_PATTERNS[i]!);
    }

    args.push(")", "-print");

    try {
      const output = isLocal
        ? await this.localExecutor.executeLocalCommand("find", args, { timeoutMs: 60000 })
        : await this.sshService.executeSSHCommand(host, "find", args, { timeoutMs: 60000 });

      // Split output by newlines, filter empty lines, and deduplicate
      const allFiles = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return Array.from(new Set(allFiles));
    } catch (error) {
      // Return empty array on errors (e.g., permission denied, path not found)
      // This allows graceful degradation when search paths don't exist
      return [];
    }
  }

  /**
   * Extract project name from compose file path (parent directory name).
   *
   * @param filePath - Absolute path to compose file
   * @returns Parent directory name, or empty string if at root
   */
  extractProjectName(filePath: string): string {
    const parts = filePath.split("/").filter((p) => p.length > 0);
    // Return parent directory name (last directory before filename)
    if (parts.length < 2) {
      return "";
    }
    return parts[parts.length - 2]!;
  }

  /**
   * Parse compose file to extract explicit 'name:' field.
   * Returns null if parsing fails or no name field exists.
   *
   * SECURITY: Uses args array to prevent shell injection when reading files.
   *
   * @param host - Host configuration
   * @param filePath - Absolute path to compose file
   * @returns Explicit project name from 'name:' field, or null
   */
  async parseComposeName(host: HostConfig, filePath: string): Promise<string | null> {
    const isLocal = this.isLocalHost(host);

    try {
      // Read file contents using cat command with args array
      const content = isLocal
        ? await this.localExecutor.executeLocalCommand("cat", [filePath], { timeoutMs: 10000 })
        : await this.sshService.executeSSHCommand(host, "cat", [filePath], { timeoutMs: 10000 });

      // Parse YAML and extract name field
      const parsed = YAML.parse(content);

      if (parsed && typeof parsed === "object" && "name" in parsed) {
        const name = parsed.name;
        if (typeof name === "string" && name.length > 0) {
          return name;
        }
      }

      return null;
    } catch (error) {
      // CODE REVIEW NOTE: Silent error swallowing here.
      // This is intentional - we gracefully fall back to directory-based naming
      // if parsing fails (invalid YAML, file not readable, etc.).
      // Alternative: Log errors for debugging while still returning null.
      return null;
    }
  }

  /**
   * Check if host is localhost (avoids SSH overhead for local operations).
   *
   * @param host - Host configuration
   * @returns true if host is localhost/127.0.0.1
   */
  private isLocalHost(host: HostConfig): boolean {
    const hostname = host.host.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }
}
