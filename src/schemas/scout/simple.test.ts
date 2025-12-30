// src/schemas/scout/simple.test.ts
import { describe, it, expect } from 'vitest';
import {
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema
} from './simple.js';

describe('Scout Simple Schemas', () => {
  describe('scoutNodesSchema', () => {
    it('should validate nodes action', () => {
      const result = scoutNodesSchema.parse({ action: 'nodes' });
      expect(result.action).toBe('nodes');
    });
  });

  describe('scoutPeekSchema', () => {
    it('should validate target format', () => {
      const result = scoutPeekSchema.parse({
        action: 'peek',
        target: 'tootie:/etc/nginx/nginx.conf'
      });
      expect(result.target).toBe('tootie:/etc/nginx/nginx.conf');
    });

    it('should reject invalid target format', () => {
      expect(() => scoutPeekSchema.parse({
        action: 'peek',
        target: 'invalid'
      })).toThrow();
    });

    it('should validate with tree and depth options', () => {
      const result = scoutPeekSchema.parse({
        action: 'peek',
        target: 'tootie:/var/log',
        tree: true,
        depth: 5
      });
      expect(result.tree).toBe(true);
      expect(result.depth).toBe(5);
    });
  });

  describe('scoutExecSchema', () => {
    it('should validate exec with timeout', () => {
      const result = scoutExecSchema.parse({
        action: 'exec',
        target: 'tootie:/app',
        command: 'ls -la',
        timeout: 60000
      });
      expect(result.timeout).toBe(60000);
    });
  });

  describe('scoutFindSchema', () => {
    it('should validate find with pattern', () => {
      const result = scoutFindSchema.parse({
        action: 'find',
        target: 'tootie:/var/log',
        pattern: '*.log'
      });
      expect(result.pattern).toBe('*.log');
    });
  });

  describe('scoutDeltaSchema', () => {
    it('should validate with target file', () => {
      const result = scoutDeltaSchema.parse({
        action: 'delta',
        source: 'host1:/etc/hosts',
        target: 'host2:/etc/hosts'
      });
      expect(result.source).toBe('host1:/etc/hosts');
    });

    it('should validate with content string', () => {
      const result = scoutDeltaSchema.parse({
        action: 'delta',
        source: 'tootie:/etc/hosts',
        content: '127.0.0.1 localhost'
      });
      expect(result.content).toBe('127.0.0.1 localhost');
    });
  });

  describe('scoutEmitSchema', () => {
    it('should validate multi-host targets', () => {
      const result = scoutEmitSchema.parse({
        action: 'emit',
        targets: ['host1:/tmp', 'host2:/tmp'],
        command: 'echo hello'
      });
      expect(result.targets).toHaveLength(2);
    });
  });

  describe('scoutBeamSchema', () => {
    it('should validate file transfer', () => {
      const result = scoutBeamSchema.parse({
        action: 'beam',
        source: 'host1:/etc/config.conf',
        destination: 'host2:/etc/config.conf'
      });
      expect(result.source).toBe('host1:/etc/config.conf');
    });
  });

  describe('scoutPsSchema', () => {
    it('should validate process listing', () => {
      const result = scoutPsSchema.parse({
        action: 'ps',
        host: 'tootie',
        grep: 'nginx',
        sort: 'mem',
        limit: 20
      });
      expect(result.sort).toBe('mem');
      expect(result.limit).toBe(20);
    });

    it('should default sort to cpu', () => {
      const result = scoutPsSchema.parse({
        action: 'ps',
        host: 'tootie'
      });
      expect(result.sort).toBe('cpu');
    });
  });

  describe('scoutDfSchema', () => {
    it('should validate disk usage', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/mnt/data'
      });
      expect(result.path).toBe('/mnt/data');
    });

    it('should default human_readable to true', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie'
      });
      expect(result.human_readable).toBe(true);
    });
  });
});
