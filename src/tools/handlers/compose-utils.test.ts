// src/tools/handlers/compose-utils.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFileNotFoundError, withCacheInvalidation } from './compose-utils.js';
import type { ComposeDiscovery } from '../../services/compose-discovery.js';

describe('isFileNotFoundError', () => {
  it('should return true for ENOENT error code', () => {
    const error = { code: 'ENOENT', message: 'File not found' };
    expect(isFileNotFoundError(error)).toBe(true);
  });

  it('should return true for error message containing "No such file or directory"', () => {
    const error = new Error('compose.yaml: No such file or directory');
    expect(isFileNotFoundError(error)).toBe(true);
  });

  it('should return true for error message containing "does not exist"', () => {
    const error = new Error('/path/to/compose.yaml does not exist');
    expect(isFileNotFoundError(error)).toBe(true);
  });

  it('should return true for error message containing "cannot find"', () => {
    const error = new Error('cannot find compose file');
    expect(isFileNotFoundError(error)).toBe(true);
  });

  it('should return false for non-file-not-found errors', () => {
    const error = new Error('Connection refused');
    expect(isFileNotFoundError(error)).toBe(false);
  });

  it('should return false for network errors', () => {
    const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
    expect(isFileNotFoundError(error)).toBe(false);
  });

  it('should return false for permission errors', () => {
    const error = { code: 'EACCES', message: 'Permission denied' };
    expect(isFileNotFoundError(error)).toBe(false);
  });

  it('should return false for non-Error objects', () => {
    expect(isFileNotFoundError('string error')).toBe(false);
    expect(isFileNotFoundError(42)).toBe(false);
    expect(isFileNotFoundError(null)).toBe(false);
    expect(isFileNotFoundError(undefined)).toBe(false);
  });
});

describe('withCacheInvalidation', () => {
  let mockDiscovery: Partial<ComposeDiscovery>;

  beforeEach(() => {
    mockDiscovery = {
      cache: {
        removeProject: vi.fn()
      }
    } as ComposeDiscovery;
  });

  it('should execute operation and return result on success', async () => {
    const operation = vi.fn().mockResolvedValue('success result');

    const result = await withCacheInvalidation(
      operation,
      'test-project',
      'test-host',
      mockDiscovery as ComposeDiscovery,
      'testOperation'
    );

    expect(operation).toHaveBeenCalledOnce();
    expect(result).toBe('success result');
    expect(mockDiscovery.cache?.removeProject).not.toHaveBeenCalled();
  });

  it('should invalidate cache and re-throw on file-not-found error', async () => {
    const fileNotFoundError = new Error('/path/compose.yaml: No such file or directory');
    const operation = vi.fn().mockRejectedValue(fileNotFoundError);

    await expect(
      withCacheInvalidation(
        operation,
        'test-project',
        'test-host',
        mockDiscovery as ComposeDiscovery,
        'testOperation'
      )
    ).rejects.toThrow(fileNotFoundError);

    expect(operation).toHaveBeenCalledOnce();
    expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('test-host', 'test-project');
  });

  it('should invalidate cache on ENOENT error', async () => {
    const enoentError = { code: 'ENOENT', message: 'File not found' };
    const operation = vi.fn().mockRejectedValue(enoentError);

    await expect(
      withCacheInvalidation(
        operation,
        'test-project',
        'test-host',
        mockDiscovery as ComposeDiscovery,
        'testOperation'
      )
    ).rejects.toThrow();

    expect(mockDiscovery.cache?.removeProject).toHaveBeenCalledWith('test-host', 'test-project');
  });

  it('should re-throw non-file-not-found errors without cache invalidation', async () => {
    const networkError = new Error('Connection refused');
    const operation = vi.fn().mockRejectedValue(networkError);

    await expect(
      withCacheInvalidation(
        operation,
        'test-project',
        'test-host',
        mockDiscovery as ComposeDiscovery,
        'testOperation'
      )
    ).rejects.toThrow(networkError);

    expect(operation).toHaveBeenCalledOnce();
    expect(mockDiscovery.cache?.removeProject).not.toHaveBeenCalled();
  });

  it('should handle operation errors that are not Error instances', async () => {
    const operation = vi.fn().mockRejectedValue('string error');

    await expect(
      withCacheInvalidation(
        operation,
        'test-project',
        'test-host',
        mockDiscovery as ComposeDiscovery,
        'testOperation'
      )
    ).rejects.toThrow();

    expect(mockDiscovery.cache?.removeProject).not.toHaveBeenCalled();
  });

  it('should log cache invalidation when debugging', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fileNotFoundError = new Error('compose.yaml does not exist');
    const operation = vi.fn().mockRejectedValue(fileNotFoundError);

    await expect(
      withCacheInvalidation(
        operation,
        'test-project',
        'test-host',
        mockDiscovery as ComposeDiscovery,
        'testOperation'
      )
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[testOperation] Cache invalidated for project')
    );

    consoleSpy.mockRestore();
  });
});
