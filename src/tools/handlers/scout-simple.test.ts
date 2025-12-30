// src/tools/handlers/scout-simple.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScoutSimpleAction } from './scout-simple.js';
import type { ServiceContainer } from '../../services/container.js';
import type { ISSHService, IFileService } from '../../services/interfaces.js';
import type { ScoutInput } from '../../schemas/scout/index.js';
import { ResponseFormat } from '../../types.js';

// Mock loadHostConfigs
vi.mock('../../services/docker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/docker.js')>();
  return {
    ...actual,
    loadHostConfigs: vi.fn().mockReturnValue([
      { name: 'tootie', host: 'tootie', protocol: 'http', port: 2375 },
      { name: 'lolcow', host: 'lolcow', protocol: 'http', port: 2375 }
    ])
  };
});

describe('Scout Simple Handlers', () => {
  let mockSSHService: Partial<ISSHService>;
  let mockFileService: Partial<IFileService>;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn(),
      getHostResources: vi.fn()
    };

    mockFileService = {
      readFile: vi.fn(),
      listDirectory: vi.fn(),
      treeDirectory: vi.fn(),
      executeCommand: vi.fn(),
      findFiles: vi.fn(),
      transferFile: vi.fn(),
      diffFiles: vi.fn()
    };

    mockContainer = {
      getSSHService: vi.fn().mockReturnValue(mockSSHService),
      getFileService: vi.fn().mockReturnValue(mockFileService)
    };
  });

  describe('nodes action', () => {
    it('should list all configured SSH hosts', async () => {
      const result = await handleScoutSimpleAction({
        action: 'nodes'
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(result).toContain('tootie');
      expect(result).toContain('lolcow');
    });

    it('should return JSON format when requested', async () => {
      const result = await handleScoutSimpleAction({
        action: 'nodes',
        response_format: ResponseFormat.JSON
      } as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('tootie');
    });
  });

  describe('peek action', () => {
    it('should read file contents from remote host', async () => {
      (mockFileService.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'Hello World\n',
        size: 12,
        truncated: false
      });

      const result = await handleScoutSimpleAction({
        action: 'peek',
        target: 'tootie:/etc/hostname',
        tree: false
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.readFile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        '/etc/hostname',
        expect.any(Number)
      );
      expect(result).toContain('Hello World');
    });

    it('should show directory tree when tree=true', async () => {
      (mockFileService.treeDirectory as ReturnType<typeof vi.fn>).mockResolvedValue(
        '/etc\n├── hosts\n├── hostname\n└── passwd\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'peek',
        target: 'tootie:/etc',
        tree: true,
        depth: 3
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.treeDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        '/etc',
        3
      );
      expect(result).toContain('├──');
    });

    it('should list directory contents when target is a directory', async () => {
      // First readFile returns error indicating it's a directory
      (mockFileService.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Is a directory')
      );
      (mockFileService.listDirectory as ReturnType<typeof vi.fn>).mockResolvedValue(
        'hosts\nhostname\npasswd\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'peek',
        target: 'tootie:/etc',
        tree: false
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(result).toContain('hosts');
      expect(result).toContain('hostname');
    });
  });

  describe('exec action', () => {
    it('should execute command on remote host', async () => {
      (mockFileService.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
        stdout: 'command output\n',
        exitCode: 0
      });

      const result = await handleScoutSimpleAction({
        action: 'exec',
        target: 'tootie:/tmp',
        command: 'ls -la',
        timeout: 30000
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.executeCommand).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        '/tmp',
        'ls -la',
        30000
      );
      expect(result).toContain('command output');
    });

    it('should include exit code in JSON response', async () => {
      (mockFileService.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
        stdout: 'output\n',
        exitCode: 1
      });

      const result = await handleScoutSimpleAction({
        action: 'exec',
        target: 'tootie:/tmp',
        command: 'false',
        timeout: 30000,
        response_format: ResponseFormat.JSON
      } as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.exitCode).toBe(1);
    });
  });

  describe('find action', () => {
    it('should find files matching pattern', async () => {
      (mockFileService.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue(
        '/var/log/syslog\n/var/log/auth.log\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'find',
        target: 'tootie:/var/log',
        pattern: '*.log',
        depth: 3,
        limit: 100
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.findFiles).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tootie' }),
        '/var/log',
        '*.log',
        expect.objectContaining({ maxDepth: 3, limit: 100 })
      );
      expect(result).toContain('/var/log/syslog');
    });
  });

  describe('delta action', () => {
    it('should compare files between hosts', async () => {
      (mockFileService.diffFiles as ReturnType<typeof vi.fn>).mockResolvedValue(
        '--- tootie:/etc/hosts\n+++ lolcow:/etc/hosts\n@@ -1,3 +1,4 @@\n+extra line\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'delta',
        source: 'tootie:/etc/hosts',
        target: 'lolcow:/etc/hosts'
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.diffFiles).toHaveBeenCalled();
      expect(result).toContain('---');
      expect(result).toContain('+++');
    });

    it('should compare content directly when content provided', async () => {
      (mockFileService.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'file content\n',
        size: 13,
        truncated: false
      });

      const result = await handleScoutSimpleAction({
        action: 'delta',
        source: 'tootie:/etc/hosts',
        content: 'different content\n'
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(result).toContain('differ');
    });
  });

  describe('emit action', () => {
    it('should execute command on multiple hosts', async () => {
      (mockFileService.executeCommand as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ stdout: 'tootie output\n', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'lolcow output\n', exitCode: 0 });

      const result = await handleScoutSimpleAction({
        action: 'emit',
        targets: ['tootie:/tmp', 'lolcow:/tmp'],
        command: 'uptime'
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.executeCommand).toHaveBeenCalledTimes(2);
      expect(result).toContain('tootie');
      expect(result).toContain('lolcow');
    });

    it('should allow a custom timeout override', async () => {
      (mockFileService.executeCommand as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ stdout: 'done\n', exitCode: 0 });

      await handleScoutSimpleAction({
        action: 'emit',
        targets: ['tootie:/tmp'],
        command: 'uptime',
        timeout: '45000'
      } as unknown as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.executeCommand).toHaveBeenCalledWith(
        expect.anything(),
        '/tmp',
        'uptime',
        45000
      );
    });
  });

  describe('beam action', () => {
    it('should transfer file between hosts', async () => {
      (mockFileService.transferFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        bytesTransferred: 1024
      });

      const result = await handleScoutSimpleAction({
        action: 'beam',
        source: 'tootie:/etc/hosts',
        destination: 'lolcow:/tmp/hosts'
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockFileService.transferFile).toHaveBeenCalled();
      expect(result).toContain('1024');
    });

    it('should warn about large transfers', async () => {
      (mockFileService.transferFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        bytesTransferred: 1073741824, // 1GB
        warning: 'Large file transfer'
      });

      const result = await handleScoutSimpleAction({
        action: 'beam',
        source: 'tootie:/backup.tar',
        destination: 'lolcow:/backup.tar',
        response_format: ResponseFormat.JSON
      } as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      expect(parsed.warning).toBe('Large file transfer');
    });
  });

  describe('ps action', () => {
    it('should list processes on remote host', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' +
        'root         1  0.0  0.0  22312  5488 ?        Ss   Dec01   0:03 /sbin/init\n' +
        'root       123 10.0  2.0 100000 20000 ?        S    Dec01   1:00 /usr/bin/dockerd\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'ps',
        host: 'tootie',
        sort: 'cpu',
        limit: 50
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('dockerd');
    });

    it('should filter by grep pattern', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' +
        'root       123 10.0  2.0 100000 20000 ?        S    Dec01   1:00 /usr/bin/dockerd\n' +
        'root       456  0.5  0.1  50000  8000 ?        S    Dec01   0:10 /usr/bin/nginx\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'ps',
        host: 'tootie',
        grep: 'docker',
        sort: 'cpu',
        limit: 50
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(result).toContain('dockerd');
      expect(result).not.toContain('nginx');
    });

    it('applies user and grep filters before limit and preserves header', async () => {
      const header = 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        `${header}\n` +
        'root       101  2.0  1.0  10000  2000 ?        S    Dec01   0:10 /usr/bin/python\n' +
        'alice      202  1.0  0.5   9000  1500 ?        S    Dec01   0:05 /usr/bin/python\n' +
        'alice      303  0.5  0.2   8000  1200 ?        S    Dec01   0:03 /usr/bin/node\n'
      );

      const result = await handleScoutSimpleAction({
        action: 'ps',
        host: 'tootie',
        grep: 'python',
        user: 'alice',
        limit: 1,
        response_format: ResponseFormat.JSON
      } as ScoutInput, mockContainer as ServiceContainer);

      const parsed = JSON.parse(result);
      const lines = parsed.processes.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(header);
      expect(lines[1]).toContain('alice');
      expect(lines[1]).toContain('python');
    });
  });

  describe('df action', () => {
    it('should get disk usage on remote host', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Filesystem      Size  Used Avail Use% Mounted on\n' +
        '/dev/sda1       500G  250G  250G  50% /'
      );

      const result = await handleScoutSimpleAction({
        action: 'df',
        host: 'tootie',
        human_readable: true
      } as ScoutInput, mockContainer as ServiceContainer);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalled();
      expect(result).toContain('/dev/sda1');
      expect(result).toContain('500G');
    });

    it('should filter by specific path', async () => {
      (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Filesystem      Size  Used Avail Use% Mounted on\n' +
        '/dev/sda1       500G  250G  250G  50% /'
      );

      await handleScoutSimpleAction({
        action: 'df',
        host: 'tootie',
        path: '/',
        human_readable: true
      } as ScoutInput, mockContainer as ServiceContainer);

      // Path is now escaped with single quotes for shell safety
      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        'df',
        expect.arrayContaining(['-h', "'/'"])
      );
    });
  });

  describe('error handling', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleScoutSimpleAction({
          action: 'zfs',
          subaction: 'pools'
        } as unknown as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Not a simple action');
    });

    it('should throw on unknown host', async () => {
      await expect(
        handleScoutSimpleAction({
          action: 'peek',
          target: 'unknown-host:/etc/hosts',
          tree: false
        } as ScoutInput, mockContainer as ServiceContainer)
      ).rejects.toThrow('Host not found');
    });
  });
});
