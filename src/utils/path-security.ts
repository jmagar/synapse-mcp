/**
 * Path Security Utilities
 *
 * SECURITY: Path Traversal Protection (CWE-22)
 *
 * This module provides utilities to prevent directory traversal attacks
 * in file path parameters. Used by docker.ts buildImage() to validate
 * build context and Dockerfile paths.
 *
 * CVSS 7.4 (HIGH) - Prevents attackers from using paths like:
 * - ../../../etc/passwd
 * - /valid/../../../etc/passwd
 * - /path/./to/../../sensitive
 *
 * @see https://cwe.mitre.org/data/definitions/22.html
 */

import { resolve } from "node:path";

/**
 * Validates that a file path is safe from directory traversal attacks
 *
 * Rules:
 * 1. Must be absolute path (starts with /)
 * 2. Cannot contain .. (parent directory)
 * 3. Cannot contain . as a path component (except in filenames)
 * 4. Must contain only allowed characters: a-zA-Z0-9._-/
 *
 * @param path - The file path to validate
 * @param paramName - Name of the parameter (for error messages)
 * @throws Error if path contains directory traversal or is invalid
 */
export function validateSecurePath(path: string, paramName: string): void {
  // 1. Check for empty path
  if (!path || path.length === 0) {
    throw new Error(`${paramName}: Path cannot be empty`);
  }

  // 2. Character validation - only allow alphanumeric, dots, hyphens, underscores, forward slashes
  if (!/^[a-zA-Z0-9._\-/]+$/.test(path)) {
    throw new Error(
      `${paramName}: Invalid characters in path: ${path}`
    );
  }

  // 3. Split path into components and check for ".." traversal first
  const components = path.split("/").filter(c => c.length > 0);

  for (const component of components) {
    // Reject ".." (parent directory traversal) - check this first
    if (component === "..") {
      throw new Error(
        `${paramName}: directory traversal (..) not allowed in path: ${path}`
      );
    }
  }

  // 4. Must be absolute path (starts with /) - checked after .. but before .
  if (!path.startsWith("/")) {
    throw new Error(
      `${paramName}: absolute path required, got: ${path}`
    );
  }

  // 5. Check for "." as standalone component (only in absolute paths)
  for (const component of components) {
    // Reject "." as standalone component (current directory)
    // BUT allow dots in filenames like "file.txt" or "config.prod"
    if (component === ".") {
      throw new Error(
        `${paramName}: directory traversal (.) not allowed in path: ${path}`
      );
    }
  }

  // 5. Additional safety check: resolve path and verify it doesn't traverse
  // This catches cases like /valid/path/../../etc that might slip through
  const resolved = resolve(path);
  if (!resolved.startsWith(path.split("/")[1] ? `/${path.split("/")[1]}` : "/")) {
    throw new Error(
      `${paramName}: Path resolution resulted in directory traversal: ${path}`
    );
  }
}
