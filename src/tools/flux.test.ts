// src/tools/flux.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFluxTool } from './flux.js';
import type { ServiceContainer } from '../services/container.js';

describe('Flux Tool Handler', () => {
  let mockContainer: ServiceContainer;

  beforeEach(() => {
    mockContainer = {
      getDockerService: vi.fn(),
      getSSHService: vi.fn(),
      getComposeService: vi.fn(),
      getFileService: vi.fn()
    } as unknown as ServiceContainer;
  });

  describe('help system', () => {
    it('should handle help action and return markdown by default', async () => {
      const result = await handleFluxTool(
        { action: 'help' },
        mockContainer
      );
      // Should contain action:subaction format
      expect(result).toContain('container:list');
      expect(result).toContain('compose:up');
      expect(result).toContain('docker:info');
      expect(result).toContain('host:status');
    });

    it('should handle help with topic filter', async () => {
      const result = await handleFluxTool(
        { action: 'help', topic: 'container:list' },
        mockContainer
      );
      expect(result).toContain('container:list');
      expect(result).not.toContain('container:start');
      expect(result).not.toContain('compose:up');
    });

    it('should handle help with json format', async () => {
      const result = await handleFluxTool(
        { action: 'help', format: 'json' },
        mockContainer
      );
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty('action');
      expect(parsed[0]).toHaveProperty('parameters');
    });

    it('should return empty help for non-existent topic', async () => {
      const result = await handleFluxTool(
        { action: 'help', topic: 'nonexistent:action' },
        mockContainer
      );
      expect(result).toContain('No help available');
    });
  });

  describe('routing', () => {
    it('should throw for unimplemented container action', async () => {
      await expect(handleFluxTool(
        { action: 'container', subaction: 'list' },
        mockContainer
      )).rejects.toThrow('Handler not implemented');
    });

    it('should throw for unimplemented compose action', async () => {
      await expect(handleFluxTool(
        { action: 'compose', subaction: 'list', host: 'tootie' },
        mockContainer
      )).rejects.toThrow('Handler not implemented');
    });

    it('should throw for unimplemented docker action', async () => {
      await expect(handleFluxTool(
        { action: 'docker', subaction: 'info', host: 'tootie' },
        mockContainer
      )).rejects.toThrow('Handler not implemented');
    });

    it('should throw for unimplemented host action', async () => {
      await expect(handleFluxTool(
        { action: 'host', subaction: 'status' },
        mockContainer
      )).rejects.toThrow('Handler not implemented');
    });
  });

  describe('validation', () => {
    it('should reject invalid action', async () => {
      await expect(handleFluxTool(
        { action: 'invalid', subaction: 'test' },
        mockContainer
      )).rejects.toThrow();
    });

    it('should reject invalid subaction', async () => {
      await expect(handleFluxTool(
        { action: 'container', subaction: 'invalid' },
        mockContainer
      )).rejects.toThrow();
    });
  });
});
