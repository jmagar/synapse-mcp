// src/tools/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTools } from './index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '../services/container.js';
import { handleFluxTool } from './flux.js';
import { handleScoutTool } from './scout.js';
import { logError } from '../utils/errors.js';
import { getSchemaDescription } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { FluxSchema } from '../schemas/flux/index.js';
import { ScoutSchema } from '../schemas/scout/index.js';

vi.mock('./flux.js', () => ({
  handleFluxTool: vi.fn()
}));

vi.mock('./scout.js', () => ({
  handleScoutTool: vi.fn()
}));

vi.mock('../utils/errors.js', () => ({
  logError: vi.fn(),
  sanitizeParams: vi.fn((params) => params) // Pass-through mock for testing
}));

describe('Tool Registration', () => {
  beforeEach(() => {
    vi.mocked(handleFluxTool).mockReset();
    vi.mocked(handleScoutTool).mockReset();
    vi.mocked(logError).mockReset();
  });

  it('should register flux and scout tools', () => {
    const server = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    const container = {} as ServiceContainer;

    registerTools(server, container);

    // Verify registerTool was called (not addTool)
    expect(server.registerTool).toHaveBeenCalledTimes(2);

    // Check first call (flux)
    const mockFn = server.registerTool as ReturnType<typeof vi.fn>;
    const fluxCall = mockFn.mock.calls[0] as unknown[];
    expect(fluxCall[0]).toBe('flux');
    expect(fluxCall[1]).toMatchObject({
      title: 'Flux Tool',
      description: expect.stringContaining('Docker'),
      inputSchema: expect.any(Object)
    });

    // Check second call (scout)
    const scoutCall = mockFn.mock.calls[1] as unknown[];
    expect(scoutCall[0]).toBe('scout');
    expect(scoutCall[1]).toMatchObject({
      title: 'Scout Tool',
      description: expect.stringContaining('SSH'),
      inputSchema: expect.any(Object)
    });
  });

  it('should throw if container is not provided', () => {
    const server = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    expect(() => registerTools(server)).toThrow('ServiceContainer is required');
  });

  it('should log and rethrow errors from the flux handler', async () => {
    const server = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    const container = {
      constructor: { name: 'ServiceContainer' }
    } as ServiceContainer;

    registerTools(server, container);

    const mockFn = server.registerTool as ReturnType<typeof vi.fn>;
    const fluxHandler = mockFn.mock.calls[0]?.[2] as (params: unknown) => Promise<unknown>;
    const error = new Error('flux failure');

    vi.mocked(handleFluxTool).mockRejectedValueOnce(error);

    await expect(fluxHandler({ host: 'alpha' })).rejects.toThrow(error);

    expect(logError).toHaveBeenCalledWith(error, {
      operation: 'flux:handler',
      metadata: {
        message: 'Flux tool execution failed',
        params: { host: 'alpha' },
        container: { type: 'ServiceContainer' }
      }
    });
  });

  it('should log and rethrow errors from the scout handler', async () => {
    const server = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    const container = {
      constructor: { name: 'ServiceContainer' }
    } as ServiceContainer;

    registerTools(server, container);

    const mockFn = server.registerTool as ReturnType<typeof vi.fn>;
    const scoutHandler = mockFn.mock.calls[1]?.[2] as (params: unknown) => Promise<unknown>;
    const error = new Error('scout failure');

    vi.mocked(handleScoutTool).mockRejectedValueOnce(error);

    await expect(scoutHandler({ host: 'beta' })).rejects.toThrow(error);

    expect(logError).toHaveBeenCalledWith(error, {
      operation: 'scout:handler',
      metadata: {
        message: 'Scout tool execution failed',
        params: { host: 'beta' },
        container: { type: 'ServiceContainer' }
      }
    });
  });

  it('should extract descriptions from schemas', () => {
    // Test that descriptions match schema
    const server = { registerTool: vi.fn() } as unknown as McpServer;
    const container = {} as ServiceContainer;
    registerTools(server, container);
    const mockFn = server.registerTool as ReturnType<typeof vi.fn>;
    const fluxCall = mockFn.mock.calls[0] as unknown[];
    const fluxConfig = fluxCall[1] as { description: string };
    expect(fluxConfig.description).toBe(getSchemaDescription(FluxSchema));
    const scoutCall = mockFn.mock.calls[1] as unknown[];
    const scoutConfig = scoutCall[1] as { description: string };
    expect(scoutConfig.description).toBe(getSchemaDescription(ScoutSchema));
  });

  it('should not use fallback descriptions', () => {
    // Ensure .describe() was actually added with meaningful content
    const fluxDesc = getSchemaDescription(FluxSchema);
    const scoutDesc = getSchemaDescription(ScoutSchema);

    // Verify descriptions are truthy and have actual content
    expect(fluxDesc).toBeTruthy();
    expect(scoutDesc).toBeTruthy();
    expect(fluxDesc?.length).toBeGreaterThan(0);
    expect(scoutDesc?.length).toBeGreaterThan(0);

    // Verify they contain expected keywords
    expect(fluxDesc).toContain('Docker');
    expect(scoutDesc).toContain('SSH');
  });
});
