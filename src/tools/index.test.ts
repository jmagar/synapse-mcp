// src/tools/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { registerTools } from './index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '../services/container.js';

describe('Tool Registration', () => {
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
});
