// src/tools/handlers/compose-utils.ts
import type { ComposeDiscovery } from '../../services/compose-discovery.js';

/**
 * Check if an error is a file-not-found error
 *
 * Detects:
 * - ENOENT error code (Node.js file system errors)
 * - Error messages containing file-not-found indicators
 *
 * @param error - The error to check
 * @returns True if this is a file-not-found error
 */
export function isFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Check for ENOENT error code
  if ('code' in error && error.code === 'ENOENT') {
    return true;
  }

  // Check error message for file-not-found indicators
  if ('message' in error && typeof error.message === 'string') {
    const message = error.message.toLowerCase();
    return (
      message.includes('no such file or directory') ||
      message.includes('does not exist') ||
      message.includes('cannot find')
    );
  }

  return false;
}

/**
 * Wrap a compose operation with cache invalidation on file-not-found errors
 *
 * When a compose operation fails due to a stale cached path, this wrapper:
 * 1. Detects the file-not-found error
 * 2. Invalidates the cache for that project
 * 3. Re-throws the error for normal error handling
 *
 * The cache invalidation ensures the next operation will re-discover the project.
 *
 * @param operation - The async operation to execute
 * @param projectName - The compose project name
 * @param hostName - The host name
 * @param discovery - The discovery service (for cache access)
 * @param operationName - Name of the operation (for logging)
 * @returns The result of the operation
 * @throws Re-throws any errors from the operation
 */
export async function withCacheInvalidation<T>(
  operation: () => Promise<T>,
  projectName: string,
  hostName: string,
  discovery: ComposeDiscovery,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // If this is a file-not-found error, invalidate cache and re-throw
    if (isFileNotFoundError(error)) {
      await discovery.cache.removeProject(hostName, projectName);
      console.error(
        `[${operationName}] Cache invalidated for project "${projectName}" on host "${hostName}" due to stale path`
      );
    }

    // Always re-throw the error
    throw error;
  }
}
