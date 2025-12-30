// src/schemas/scout/index.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutSchema } from './index.js';

describe('ScoutSchema', () => {
  it('should validate nodes action', () => {
    const result = ScoutSchema.parse({ action: 'nodes' });
    expect(result.action).toBe('nodes');
  });

  it('should validate peek action', () => {
    const result = ScoutSchema.parse({
      action: 'peek',
      target: 'tootie:/etc/hosts'
    });
    expect(result.target).toBe('tootie:/etc/hosts');
  });

  it('should validate exec action', () => {
    const result = ScoutSchema.parse({
      action: 'exec',
      target: 'tootie:/app',
      command: 'ls -la'
    });
    expect(result.command).toBe('ls -la');
  });

  it('should validate find action', () => {
    const result = ScoutSchema.parse({
      action: 'find',
      target: 'tootie:/var/log',
      pattern: '*.log'
    });
    expect(result.pattern).toBe('*.log');
  });

  it('should validate delta action', () => {
    const result = ScoutSchema.parse({
      action: 'delta',
      source: '/local/file.txt',
      target: 'tootie:/remote/file.txt'
    });
    expect(result.source).toBe('/local/file.txt');
  });

  it('should validate emit action', () => {
    const result = ScoutSchema.parse({
      action: 'emit',
      targets: ['tootie:/app', 'dookie:/app'],
      command: 'pwd'
    });
    expect(result.targets).toHaveLength(2);
  });

  it('should validate beam action', () => {
    const result = ScoutSchema.parse({
      action: 'beam',
      source: '/local/file.txt',
      destination: 'tootie:/remote/file.txt'
    });
    expect(result.destination).toBe('tootie:/remote/file.txt');
  });

  it('should validate ps action', () => {
    const result = ScoutSchema.parse({
      action: 'ps',
      host: 'tootie',
      grep: 'docker'
    });
    expect(result.grep).toBe('docker');
  });

  it('should validate df action', () => {
    const result = ScoutSchema.parse({
      action: 'df',
      host: 'tootie',
      path: '/mnt/data'
    });
    expect(result.path).toBe('/mnt/data');
  });

  it('should validate zfs:pools', () => {
    const result = ScoutSchema.parse({
      action: 'zfs',
      subaction: 'pools',
      host: 'dookie'
    });
    expect(result.subaction).toBe('pools');
  });

  it('should validate zfs:datasets', () => {
    const result = ScoutSchema.parse({
      action: 'zfs',
      subaction: 'datasets',
      host: 'dookie',
      pool: 'tank'
    });
    expect(result.subaction).toBe('datasets');
  });

  it('should validate zfs:snapshots', () => {
    const result = ScoutSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank'
    });
    expect(result.subaction).toBe('snapshots');
  });

  it('should validate logs:syslog', () => {
    const result = ScoutSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie',
      lines: 100
    });
    expect(result.subaction).toBe('syslog');
  });

  it('should validate logs:journal', () => {
    const result = ScoutSchema.parse({
      action: 'logs',
      subaction: 'journal',
      host: 'tootie',
      unit: 'docker.service'
    });
    expect(result.subaction).toBe('journal');
  });

  it('should validate logs:dmesg', () => {
    const result = ScoutSchema.parse({
      action: 'logs',
      subaction: 'dmesg',
      host: 'tootie',
      grep: 'USB'
    });
    expect(result.grep).toBe('USB');
  });

  it('should validate logs:auth', () => {
    const result = ScoutSchema.parse({
      action: 'logs',
      subaction: 'auth',
      host: 'tootie',
      grep: 'Failed password'
    });
    expect(result.subaction).toBe('auth');
  });

  it('should reject invalid action', () => {
    expect(() => ScoutSchema.parse({
      action: 'invalid'
    })).toThrow();
  });

  it('should reject missing required field target for peek', () => {
    expect(() => ScoutSchema.parse({
      action: 'peek'
    })).toThrow();
  });

  it('should reject missing required field command for exec', () => {
    expect(() => ScoutSchema.parse({
      action: 'exec',
      target: 'tootie:/app'
    })).toThrow();
  });

  it('should have 11 top-level schema options (9 simple + 2 nested)', () => {
    // ScoutSchema is a z.union, so we can introspect its options
    const schemaOptions = ScoutSchema.options;

    // 9 simple actions + 2 nested discriminators (zfs, logs) = 11 top-level options
    expect(schemaOptions).toHaveLength(11);

    // Verify all 11 action types can be parsed by the schema
    const allActionTypes = [
      { action: 'nodes' },
      { action: 'peek', target: 'host:/path' },
      { action: 'exec', target: 'host:/path', command: 'ls' },
      { action: 'find', target: 'host:/path', pattern: '*.txt' },
      { action: 'delta', source: '/local/file' },
      { action: 'emit', targets: ['host:/path'] },
      { action: 'beam', source: '/local', destination: 'host:/remote' },
      { action: 'ps', host: 'testhost' },
      { action: 'df', host: 'testhost' },
      { action: 'zfs', subaction: 'pools', host: 'testhost' },
      { action: 'logs', subaction: 'syslog', host: 'testhost' }
    ];

    for (const input of allActionTypes) {
      expect(() => ScoutSchema.parse(input)).not.toThrow();
    }
  });
});
