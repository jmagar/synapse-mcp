/**
 * Path Security Utilities
 *
 * SECURITY: Path Traversal Protection (CWE-22) & Command Injection Prevention (CWE-78)
 *
 * This module provides utilities to prevent directory traversal attacks
 * in file path parameters. Used by docker.ts buildImage() to validate
 * build context and Dockerfile paths.
 *
 * Also provides host validation to prevent command injection attacks
 * when hostnames are used in SSH commands.
 *
 * CVSS 7.4 (HIGH) - Prevents attackers from using paths like:
 * - ../../../etc/passwd
 * - /valid/../../../etc/passwd
 * - /path/./to/../../sensitive
 *
 * @see https://cwe.mitre.org/data/definitions/22.html
 * @see https://cwe.mitre.org/data/definitions/78.html
 */

import { resolve } from "node:path";

/**
 * Security error for invalid host format
 */
export class HostSecurityError extends Error {
  constructor(
    message: string,
    public readonly host: string
  ) {
    super(message);
    this.name = "HostSecurityError";
  }
}

// Pattern for valid hostnames: alphanumeric, dots, hyphens, underscores
const VALID_HOST_PATTERN = /^[a-zA-Z0-9._-]+$/;

// Dangerous shell characters that could enable command injection
const DANGEROUS_HOST_CHARS = /[;|$`&<>(){}[\]'"\\!#*?]/;

/**
 * Shell metacharacters that could enable command injection in SSH arguments
 * More permissive than DANGEROUS_HOST_CHARS to allow valid argument values
 */
const SHELL_METACHARACTERS = /[;&|`$()<>{}[\]\\"\n\r\t]/;

/**
 * Validates hostname format to prevent command injection
 *
 * @param host - Hostname to validate
 * @throws HostSecurityError if host contains dangerous characters
 */
export function validateHostFormat(host: string): void {
  if (!host || host.length === 0) {
    throw new HostSecurityError("Host cannot be empty", host);
  }

  if (DANGEROUS_HOST_CHARS.test(host)) {
    throw new HostSecurityError(`Invalid characters in hostname: ${host.substring(0, 50)}`, host);
  }

  if (!VALID_HOST_PATTERN.test(host)) {
    throw new HostSecurityError(`Invalid hostname format: ${host.substring(0, 50)}`, host);
  }
}

/**
 * Security error for SSH argument validation
 */
export class SSHArgSecurityError extends Error {
  constructor(
    message: string,
    public readonly arg: string,
    public readonly paramName: string
  ) {
    super(message);
    this.name = "SSHArgSecurityError";
  }
}

/**
 * Validates SSH command argument to prevent command injection
 *
 * SECURITY: Prevents command injection by rejecting shell metacharacters.
 * The SSH service joins args with spaces and executes as shell command,
 * so an attacker could inject arbitrary commands (e.g., "running; rm -rf /").
 *
 * @param arg - Argument value to validate
 * @param paramName - Name of the parameter (for error messages)
 * @throws SSHArgSecurityError if arg contains shell metacharacters
 */
export function validateSSHArg(arg: string, paramName: string): void {
  if (!arg || arg.length === 0) {
    throw new SSHArgSecurityError(`${paramName} cannot be empty`, arg, paramName);
  }

  if (SHELL_METACHARACTERS.test(arg)) {
    throw new SSHArgSecurityError(
      `Invalid character in ${paramName}: shell metacharacters not allowed`,
      arg.substring(0, 50),
      paramName
    );
  }

  // Additional safety: reject extremely long arguments (DoS prevention)
  if (arg.length > 500) {
    throw new SSHArgSecurityError(
      `${paramName} too long: maximum 500 characters allowed`,
      arg.substring(0, 50),
      paramName
    );
  }
}

/**
 * Escapes a string for safe use as a shell argument.
 * Uses single quotes with proper escaping for embedded single quotes.
 *
 * @param arg - String to escape
 * @returns Safely quoted string
 */
export function escapeShellArg(arg: string): string {
  // Single quote the entire string, escaping any embedded single quotes
  // by ending the quote, adding an escaped single quote, and starting a new quote
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * System paths that should trigger warnings when used as transfer targets
 */
const SYSTEM_PATH_PREFIXES = [
  "/etc",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/lib",
  "/lib64",
  "/boot",
  "/root"
];

/**
 * Checks if a path is a system path that should be protected
 *
 * @param path - Path to check
 * @returns true if path is in a system directory
 */
export function isSystemPath(path: string): boolean {
  return SYSTEM_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

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
    throw new Error(`${paramName}: Invalid characters in path: ${path}`);
  }

  // 3. Split path into components and check for ".." traversal first
  const components = path.split("/").filter((c) => c.length > 0);

  for (const component of components) {
    // Reject ".." (parent directory traversal) - check this first
    if (component === "..") {
      throw new Error(`${paramName}: directory traversal (..) not allowed in path: ${path}`);
    }
  }

  // 4. Must be absolute path (starts with /) - checked after .. but before .
  if (!path.startsWith("/")) {
    throw new Error(`${paramName}: absolute path required, got: ${path}`);
  }

  // 5. Check for "." as standalone component (only in absolute paths)
  for (const component of components) {
    // Reject "." as standalone component (current directory)
    // BUT allow dots in filenames like "file.txt" or "config.prod"
    if (component === ".") {
      throw new Error(`${paramName}: directory traversal (.) not allowed in path: ${path}`);
    }
  }

  // 5. Additional safety check: resolve path and verify it doesn't traverse
  // This catches cases like /valid/path/../../etc that might slip through
  const resolved = resolve(path);
  if (!resolved.startsWith(path.split("/")[1] ? `/${path.split("/")[1]}` : "/")) {
    throw new Error(`${paramName}: Path resolution resulted in directory traversal: ${path}`);
  }
}
