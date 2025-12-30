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
    const fluxCall = (server.registerTool as any).mock.calls[0];
    expect(fluxCall[0]).toBe('flux');
    expect(fluxCall[1]).toMatchObject({
      title: 'Flux Tool',
      description: expect.stringContaining('Docker'),
      inputSchema: expect.any(Object)
    });

    // Check second call (scout)
    const scoutCall = (server.registerTool as any).mock.calls[1];
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
