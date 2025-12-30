// src/schemas/scout/zfs.test.ts
import { describe, it, expect } from 'vitest';
import { scoutZfsSchema } from './zfs.js';

describe('Scout ZFS Schema', () => {
  it('should validate pools subaction', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'pools',
      host: 'dookie'
    });
    expect(result.subaction).toBe('pools');
  });

  it('should validate datasets with recursive', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'datasets',
      host: 'dookie',
      pool: 'tank',
      recursive: true
    });
    expect(result.recursive).toBe(true);
  });

  it('should validate snapshots with limit', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 50
    });
    expect(result.limit).toBe(50);
  });

  it('should reject invalid subaction', () => {
    expect(() => scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'invalid',
      host: 'dookie'
    })).toThrow();
  });
});
