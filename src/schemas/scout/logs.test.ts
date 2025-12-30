// src/schemas/scout/logs.test.ts
import { describe, it, expect } from 'vitest';
import { scoutLogsSchema } from './logs.js';
import { DEFAULT_LOG_LINES } from '../../constants.js';

describe('Scout Logs Schema', () => {
  it('should validate syslog subaction', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie',
      lines: 50
    });
    expect(result.subaction).toBe('syslog');
  });

  it('should validate journal with unit filter', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'journal',
      host: 'tootie',
      unit: 'docker.service',
      priority: 'err',
      since: '1h'
    });
    expect(result.unit).toBe('docker.service');
    expect(result.priority).toBe('err');
  });

  it('should validate dmesg', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'dmesg',
      host: 'tootie',
      grep: 'USB'
    });
    expect(result.grep).toBe('USB');
  });

  it('should reject grep patterns with shell metacharacters', () => {
    expect(() => scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie',
      grep: "oops'; rm -rf /"
    })).toThrow(/shell metacharacters/i);
  });

  it('should reject grep patterns that are too long', () => {
    const longPattern = 'a'.repeat(201);
    expect(() => scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie',
      grep: longPattern
    })).toThrow(/too big|maximum.*200/i);
  });

  it('should reject various shell injection attempts', () => {
    const maliciousPatterns = [
      '`whoami`',
      '$(cat /etc/passwd)',
      'foo; rm -rf /',
      'foo && malicious',
      'foo | grep secret',
      'foo > /tmp/output',
      'test"injection',
      'test[injection]'
    ];

    for (const pattern of maliciousPatterns) {
      expect(() => scoutLogsSchema.parse({
        action: 'logs',
        subaction: 'dmesg',
        host: 'tootie',
        grep: pattern
      })).toThrow(/shell metacharacters/i);
    }
  });

  it('should validate auth logs', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'auth',
      host: 'tootie',
      lines: 200
    });
    expect(result.lines).toBe(200);
  });

  it('should reject invalid subaction', () => {
    expect(() => scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'invalid',
      host: 'tootie'
    })).toThrow();
  });

  it('should default lines to DEFAULT_LOG_LINES', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie'
    });
    expect(result.lines).toBe(DEFAULT_LOG_LINES);
  });
});
