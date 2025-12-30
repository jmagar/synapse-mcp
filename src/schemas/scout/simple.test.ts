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

    it('should require target or content', () => {
      const result = scoutDeltaSchema.safeParse({
        action: 'delta',
        source: 'tootie:/etc/hosts'
      });

      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }
      expect(result.error.issues[0]?.message).toBe(
        'Either target or content must be provided for comparison'
      );
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

    it('should accept optional timeout override', () => {
      const result = scoutEmitSchema.parse({
        action: 'emit',
        targets: ['host1:/tmp'],
        command: 'echo hello',
        timeout: 45000
      });
      expect(result.timeout).toBe(45000);
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

    it('should allow grep patterns with shell chars (JS-side filtering)', () => {
      // ps grep uses jsFilterSchema since filtering is done in JavaScript
      // with String.includes(), not passed to shell
      const result = scoutPsSchema.parse({
        action: 'ps',
        host: 'tootie',
        grep: "[nginx] error"
      });
      expect(result.grep).toBe("[nginx] error");
    });

    it('should reject grep patterns with control characters', () => {
      expect(() => scoutPsSchema.parse({
        action: 'ps',
        host: 'tootie',
        grep: "nginx\x00inject"
      })).toThrow(/control characters/);
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

    // Security tests for command injection prevention (CWE-78)
    it('should reject path with semicolon injection', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/tmp; cat /etc/shadow'
      })).toThrow(/invalid characters/i);
    });

    it('should reject path with pipe injection', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/tmp | cat /etc/passwd'
      })).toThrow(/invalid characters/i);
    });

    it('should reject path with backtick injection', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/tmp/`id`'
      })).toThrow(/invalid characters/i);
    });

    it('should reject path with command substitution', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/tmp/$(whoami)'
      })).toThrow(/invalid characters/i);
    });

    it('should accept valid absolute paths', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/home/user/data'
      });
      expect(result.path).toBe('/home/user/data');
    });

    it('should accept paths with dots in filenames', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/var/log/nginx.access.log'
      });
      expect(result.path).toBe('/var/log/nginx.access.log');
    });

    it('should accept paths with hyphens and underscores', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/mnt/my-data_backup/files'
      });
      expect(result.path).toBe('/mnt/my-data_backup/files');
    });

    // Path traversal prevention tests (CWE-22)
    it('should reject path with parent directory traversal', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '../../../etc/passwd'
      })).toThrow(/path traversal/i);
    });

    it('should reject path with embedded traversal', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/var/log/../../../etc/shadow'
      })).toThrow(/path traversal/i);
    });

    it('should reject path with double dot at end', () => {
      expect(() => scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/var/log/..'
      })).toThrow(/path traversal/i);
    });

    it('should allow single dots in path components', () => {
      // Single dots are valid (current directory or file extensions)
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/var/log/./nginx.log'
      });
      expect(result.path).toBe('/var/log/./nginx.log');
    });

    it('should allow files starting with dot', () => {
      const result = scoutDfSchema.parse({
        action: 'df',
        host: 'tootie',
        path: '/home/user/.bashrc'
      });
      expect(result.path).toBe('/home/user/.bashrc');
    });
  });
});
