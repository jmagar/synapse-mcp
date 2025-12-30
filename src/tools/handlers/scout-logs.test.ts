// src/tools/handlers/scout-logs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLogsAction } from './scout-logs.js';
import type { ServiceContainer } from '../../services/container.js';
import type { ISSHService } from '../../services/interfaces.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { ResponseFormat } from '../../types.js';
import { loadHostConfigs } from '../../services/docker.js';

// Mock loadHostConfigs
vi.mock('../../services/docker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/docker.js')>();
  return {
    ...actual,
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
    ])
  };
});

describe('Scout Logs Handler', () => {
  let mockSSHService: Partial<ISSHService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn()
    };

    mockContainer = {
      getSSHService: vi.fn().mockReturnValue(mockSSHService)
    };
  });

  describe('syslog subaction', () => {
    it('should read syslog entries', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie systemd[1]: Started Daily apt upgrade\n' +
        'Dec 15 10:01:00 tootie CRON[12345]: (root) CMD (test)\n'
      );

      const result = await handleLogsAction({
        action: 'logs',
        subaction: 'syslog',
        host: 'tootie',
        lines: 100
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'tail',
        expect.arrayContaining(['-n', '100', '/var/log/syslog'])
      );
      expect(result).toContain('systemd');
      expect(result).toContain('CRON');
    });

    it('should apply grep filter', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie CRON[12345]: (root) CMD (test)\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'syslog',
        host: 'tootie',
        lines: 100,
        grep: 'CRON'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('tail'),
        expect.anything()
      );
    });

    it('should return JSON format when requested', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie systemd[1]: Started Daily apt upgrade\n'
      );

      const result = await handleLogsAction({
        action: 'logs',
        subaction: 'syslog',
        host: 'tootie',
        lines: 100,
        response_format: ResponseFormat.JSON
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.host).toBe('tootie');
      expect(parsed.subaction).toBe('syslog');
      expect(parsed.output).toContain('systemd');
    });
  });

  describe('journal subaction', () => {
    it('should read journal entries', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie systemd[1]: Starting Docker...\n' +
        'Dec 15 10:00:05 tootie dockerd[123]: Started containerd\n'
      );

      const result = await handleLogsAction({
        action: 'logs',
        subaction: 'journal',
        host: 'tootie',
        lines: 100
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'journalctl',
        expect.arrayContaining(['-n', '100'])
      );
      expect(result).toContain('systemd');
    });

    it('should filter by systemd unit', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie dockerd[123]: Docker daemon started\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'journal',
        host: 'tootie',
        lines: 100,
        unit: 'docker.service'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'journalctl',
        expect.arrayContaining(['-u', 'docker.service'])
      );
    });

    it('should filter by time range', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie systemd[1]: Log entry\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'journal',
        host: 'tootie',
        lines: 100,
        since: '2024-12-15',
        until: '2024-12-16'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'journalctl',
        expect.arrayContaining(['--since', '2024-12-15', '--until', '2024-12-16'])
      );
    });

    it('should filter by priority', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie kernel: Error occurred\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'journal',
        host: 'tootie',
        lines: 100,
        priority: 'err'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'journalctl',
        expect.arrayContaining(['-p', 'err'])
      );
    });
  });

  describe('dmesg subaction', () => {
    it('should read kernel messages', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[    0.000000] Linux version 6.1.0-21-amd64\n' +
        '[    0.123456] Booting paravirtualized kernel on bare hardware\n'
      );

      const result = await handleLogsAction({
        action: 'logs',
        subaction: 'dmesg',
        host: 'tootie',
        lines: 100
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'dmesg',
        expect.arrayContaining(['--color=never'])
      );
      expect(result).toContain('Linux version');
    });

    it('should apply grep filter to dmesg', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[    1.234567] usb 1-1: new high-speed USB device\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'dmesg',
        host: 'tootie',
        lines: 100,
        grep: 'usb'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      // dmesg with grep filter
      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
    });
  });

  describe('auth subaction', () => {
    it('should read auth log entries', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie sshd[12345]: Accepted publickey for user\n' +
        'Dec 15 10:01:00 tootie sudo: user : command\n'
      );

      const result = await handleLogsAction({
        action: 'logs',
        subaction: 'auth',
        host: 'tootie',
        lines: 100
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        'tail',
        expect.arrayContaining(['-n', '100', '/var/log/auth.log'])
      );
      expect(result).toContain('sshd');
      expect(result).toContain('sudo');
    });

    it('should apply grep filter to auth log', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie sshd[12345]: Failed password for invalid user\n'
      );

      await handleLogsAction({
        action: 'logs',
        subaction: 'auth',
        host: 'tootie',
        lines: 100,
        grep: 'Failed'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
    });
  });

  describe('grep pattern security validation', () => {
    beforeEach(() => {
      // Reset mock to return valid host
      vi.mocked(loadHostConfigs).mockReturnValue([
        { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
      ]);
    });

    it('should reject grep patterns with shell metacharacters', async () => {
      const maliciousPatterns = [
        "'; rm -rf / ; echo '",  // Single quote injection
        '`whoami`',               // Backtick command substitution
        '$(cat /etc/passwd)',     // Dollar command substitution
        'foo; bar',               // Semicolon command separator
        'foo && bar',             // AND operator
        'foo || bar',             // OR operator
        'foo | bar',              // Pipe operator
        'foo > /tmp/out',         // Output redirect
        'foo < /tmp/in',          // Input redirect
        '$()',                    // Command substitution
        '\\n',                    // Backslash escape
        'foo"bar',                // Double quote
      ];

      for (const pattern of maliciousPatterns) {
        await expect(
          handleLogsAction({
            action: 'logs',
            subaction: 'syslog',
            host: 'tootie',
            lines: 100,
            grep: pattern
          } as unknown as ScoutInput, mockContainer as ServiceContainer)
        ).rejects.toThrow('shell metacharacters');
      }
    });

    it('should reject grep patterns that are too long', async () => {
      const longPattern = 'a'.repeat(201);

      await expect(
        handleLogsAction({
          action: 'logs',
          subaction: 'syslog',
          host: 'tootie',
          lines: 100,
          grep: longPattern
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Too big');
    });

    it('should allow safe grep patterns', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Dec 15 10:00:00 tootie CRON[12345]: job ran\n'
      );

      const safePatterns = ['CRON', 'error', 'warning', '12345', 'foo-bar', 'foo_bar', 'foo.bar'];

      for (const pattern of safePatterns) {
        await expect(
          handleLogsAction({
            action: 'logs',
            subaction: 'syslog',
            host: 'tootie',
            lines: 100,
            grep: pattern
          } as unknown as ScoutInput, mockContainer as ServiceContainer)
        ).resolves.not.toThrow();
      }
    });

    it('should validate grep patterns for dmesg subaction', async () => {
      await expect(
        handleLogsAction({
          action: 'logs',
          subaction: 'dmesg',
          host: 'tootie',
          lines: 100,
          grep: "'; rm -rf /"
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('shell metacharacters');
    });

    it('should validate grep patterns for auth subaction', async () => {
      await expect(
        handleLogsAction({
          action: 'logs',
          subaction: 'auth',
          host: 'tootie',
          lines: 100,
          grep: '$(whoami)'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('shell metacharacters');
    });
  });

  describe('error handling', () => {
    afterEach(() => {
      // Restore default host config after each test to prevent mock state leakage
      vi.mocked(loadHostConfigs).mockReturnValue([
        { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 }
      ]);
    });

    it('should throw on invalid action', async () => {
      await expect(
        handleLogsAction({
          action: 'zfs',
          subaction: 'pools'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Invalid action for logs handler');
    });

    it('should throw on unknown host', async () => {
      // Re-mock to return empty hosts array
      vi.mocked(loadHostConfigs).mockReturnValue([]);

      await expect(
        handleLogsAction({
          action: 'logs',
          subaction: 'syslog',
          host: 'unknown-host',
          lines: 100
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });

    it('should handle SSH command failure', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('Permission denied'));

      await expect(
        handleLogsAction({
          action: 'logs',
          subaction: 'syslog',
          host: 'tootie',
          lines: 100
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Permission denied');
    });
  });
});
