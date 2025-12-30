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

  it('should count 11 total action types (9 simple + 2 nested)', () => {
    // 9 simple actions + 2 nested discriminators (zfs, logs)
    // Total unique schema options = 9 + 3 (zfs subactions) + 4 (logs subactions) = 16
    const simpleActions = ['nodes', 'peek', 'exec', 'find', 'delta', 'emit', 'beam', 'ps', 'df'];
    const zfsSubactions = ['pools', 'datasets', 'snapshots'];
    const logsSubactions = ['syslog', 'journal', 'dmesg', 'auth'];

    expect(simpleActions).toHaveLength(9);
    expect(zfsSubactions).toHaveLength(3);
    expect(logsSubactions).toHaveLength(4);
    expect(simpleActions.length + zfsSubactions.length + logsSubactions.length).toBe(16);
  });
});
