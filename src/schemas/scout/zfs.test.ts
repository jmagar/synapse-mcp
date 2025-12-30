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

  it('should validate pools with health filter', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'pools',
      host: 'dookie',
      health: 'degraded'
    });
    expect(result.health).toBe('degraded');
  });

  it('should validate datasets with type filter', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'datasets',
      host: 'dookie',
      type: 'volume'
    });
    expect(result.type).toBe('volume');
  });

  it('should validate snapshots limit at minimum', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 1
    });
    expect(result.limit).toBe(1);
  });

  it('should validate snapshots limit at maximum', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 1000
    });
    expect(result.limit).toBe(1000);
  });

  it('should reject snapshots limit below minimum', () => {
    expect(() => scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 0
    })).toThrow();
  });

  it('should reject snapshots limit exceeding maximum', () => {
    expect(() => scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 1001
    })).toThrow();
  });

  it('should reject invalid subaction', () => {
    expect(() => scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'invalid',
      host: 'dookie'
    })).toThrow();
  });

  // Security tests for command injection prevention (CWE-78)
  describe('pool name validation', () => {
    it('should reject pool name with semicolon injection', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'pools',
        host: 'dookie',
        pool: 'tank; rm -rf /'
      })).toThrow(/alphanumeric/i);
    });

    it('should reject pool name with backticks', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'pools',
        host: 'dookie',
        pool: '`whoami`'
      })).toThrow(/alphanumeric/i);
    });

    it('should reject pool name with command substitution', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'datasets',
        host: 'dookie',
        pool: '$(cat /etc/passwd)'
      })).toThrow(/alphanumeric/i);
    });

    it('should reject pool name with pipe', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'pools',
        host: 'dookie',
        pool: 'tank | cat /etc/shadow'
      })).toThrow(/alphanumeric/i);
    });

    it('should accept valid pool names', () => {
      const result = scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'pools',
        host: 'dookie',
        pool: 'tank-backup_2024'
      });
      expect(result.pool).toBe('tank-backup_2024');
    });

    it('should accept pool names with periods', () => {
      const result = scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'pools',
        host: 'dookie',
        pool: 'pool.v2'
      });
      expect(result.pool).toBe('pool.v2');
    });
  });

  describe('dataset name validation', () => {
    it('should reject dataset name with semicolon injection', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank/data; rm -rf /'
      })).toThrow(/alphanumeric/i);
    });

    it('should reject dataset name with command substitution', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank/$(whoami)'
      })).toThrow(/alphanumeric/i);
    });

    it('should accept valid hierarchical dataset names', () => {
      const result = scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank/data/backup'
      });
      expect(result.dataset).toBe('tank/data/backup');
    });

    it('should accept dataset with snapshot notation', () => {
      const result = scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank/data@autosnap_2024-01-01'
      });
      expect(result.dataset).toBe('tank/data@autosnap_2024-01-01');
    });

    it('should reject dataset names with colons (reserved for user properties)', () => {
      expect(() => scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank:dataset'
      })).toThrow();
    });

    it('should accept dataset names with bookmark notation (#)', () => {
      const result = scoutZfsSchema.parse({
        action: 'zfs',
        subaction: 'snapshots',
        host: 'dookie',
        dataset: 'tank/data#bookmark_2024-01-01'
      });
      expect(result.dataset).toBe('tank/data#bookmark_2024-01-01');
    });
  });
});
