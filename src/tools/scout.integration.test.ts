// src/tools/scout.integration.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutSchema } from '../schemas/scout/index.js';

describe('Scout Integration', () => {
  describe('simple actions (9)', () => {
    it('should validate nodes', () => {
      expect(() => ScoutSchema.parse({ action: 'nodes' })).not.toThrow();
    });

    it('should validate peek', () => {
      expect(() => ScoutSchema.parse({ action: 'peek', target: 'tootie:/etc/hosts' })).not.toThrow();
    });

    it('should validate exec', () => {
      expect(() => ScoutSchema.parse({ action: 'exec', target: 'tootie:/tmp', command: 'ls -la' })).not.toThrow();
    });

    it('should validate find', () => {
      expect(() => ScoutSchema.parse({ action: 'find', target: 'tootie:/var/log', pattern: '*.log' })).not.toThrow();
    });

    it('should validate delta', () => {
      expect(() => ScoutSchema.parse({ action: 'delta', source: 'tootie:/etc/hosts', target: 'dookie:/etc/hosts' })).not.toThrow();
    });

    it('should validate emit', () => {
      expect(() => ScoutSchema.parse({ action: 'emit', targets: ['tootie:/tmp/test.txt'] })).not.toThrow();
    });

    it('should validate beam', () => {
      expect(() => ScoutSchema.parse({ action: 'beam', source: 'tootie:/tmp/file', destination: 'dookie:/tmp/file' })).not.toThrow();
    });

    it('should validate ps', () => {
      expect(() => ScoutSchema.parse({ action: 'ps', host: 'tootie' })).not.toThrow();
    });

    it('should validate df', () => {
      expect(() => ScoutSchema.parse({ action: 'df', host: 'tootie' })).not.toThrow();
    });
  });

  describe('zfs nested discriminator (3)', () => {
    it('should validate zfs:pools', () => {
      expect(() => ScoutSchema.parse({ action: 'zfs', subaction: 'pools', host: 'tootie' })).not.toThrow();
    });

    it('should validate zfs:datasets', () => {
      expect(() => ScoutSchema.parse({ action: 'zfs', subaction: 'datasets', host: 'tootie' })).not.toThrow();
    });

    it('should validate zfs:snapshots', () => {
      expect(() => ScoutSchema.parse({ action: 'zfs', subaction: 'snapshots', host: 'tootie' })).not.toThrow();
    });

    it('should reject invalid zfs subaction', () => {
      expect(() => ScoutSchema.parse({ action: 'zfs', subaction: 'invalid', host: 'tootie' })).toThrow();
    });
  });

  describe('logs nested discriminator (4)', () => {
    it('should validate logs:syslog', () => {
      expect(() => ScoutSchema.parse({ action: 'logs', subaction: 'syslog', host: 'tootie' })).not.toThrow();
    });

    it('should validate logs:journal', () => {
      expect(() => ScoutSchema.parse({ action: 'logs', subaction: 'journal', host: 'tootie' })).not.toThrow();
    });

    it('should validate logs:dmesg', () => {
      expect(() => ScoutSchema.parse({ action: 'logs', subaction: 'dmesg', host: 'tootie' })).not.toThrow();
    });

    it('should validate logs:auth', () => {
      expect(() => ScoutSchema.parse({ action: 'logs', subaction: 'auth', host: 'tootie' })).not.toThrow();
    });

    it('should reject invalid logs subaction', () => {
      expect(() => ScoutSchema.parse({ action: 'logs', subaction: 'invalid', host: 'tootie' })).toThrow();
    });
  });

  describe('target format validation', () => {
    it('should require host:/path format for peek', () => {
      expect(() => ScoutSchema.parse({ action: 'peek', target: 'invalid' })).toThrow();
      expect(() => ScoutSchema.parse({ action: 'peek', target: 'host:/path' })).not.toThrow();
    });
  });

  it('should reject invalid action', () => {
    expect(() => ScoutSchema.parse({ action: 'invalid' })).toThrow();
  });
});
