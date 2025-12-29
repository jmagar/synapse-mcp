import type { HostConfig } from "../types.js";
import type { ISSHService, IFileService } from "./interfaces.js";
import {
  validateSecurePath,
  escapeShellArg,
  isSystemPath
} from "../utils/path-security.js";
import {
  ALLOWED_COMMANDS,
  ENV_ALLOW_ANY_COMMAND,
  DEFAULT_COMMAND_TIMEOUT
} from "../constants.js";

/**
 * File service implementation for remote file operations via SSH.
 * Provides secure file reading, directory listing, command execution,
 * and file transfer capabilities across hosts.
 *
 * SECURITY: All paths are validated to prevent directory traversal attacks.
 * Commands are validated against an allowlist unless explicitly overridden.
 */
export class FileService implements IFileService {
  constructor(private readonly sshService: ISSHService) {}

  /**
   * Validates a path for security issues (directory traversal, etc.)
   */
  private validatePath(path: string): void {
    validateSecurePath(path, "path");
  }

  /**
   * Validates that a command is in the allowed list.
   * Can be bypassed with HOMELAB_ALLOW_ANY_COMMAND=true env var.
   */
  private validateCommand(command: string): void {
    const allowAny = process.env[ENV_ALLOW_ANY_COMMAND] === "true";
    if (allowAny) return;

    const baseCommand = command.trim().split(/\s+/)[0];

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command '${baseCommand}' not in allowed list. ` +
          `Allowed: ${[...ALLOWED_COMMANDS].join(", ")}. ` +
          `Set ${ENV_ALLOW_ANY_COMMAND}=true to allow any command.`
      );
    }
  }

  /**
   * Read content from a file on a remote host.
   */
  async readFile(
    host: HostConfig,
    path: string,
    maxSize: number
  ): Promise<{ content: string; size: number; truncated: boolean }> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    // Read maxSize + 1 bytes to detect if truncation is needed
    const command = `cat ${escapedPath} | head -c ${maxSize + 1}`;

    const output = await this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });

    const truncated = output.length > maxSize;
    const content = truncated ? output.slice(0, maxSize) : output;

    return {
      content,
      size: output.length,
      truncated
    };
  }

  /**
   * List contents of a directory on a remote host.
   */
  async listDirectory(
    host: HostConfig,
    path: string,
    showHidden: boolean
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const flags = showHidden ? "-la" : "-l";
    const command = `ls ${flags} ${escapedPath}`;

    return this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });
  }

  /**
   * Get tree representation of a directory structure.
   */
  async treeDirectory(
    host: HostConfig,
    path: string,
    depth: number
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const command = `tree -L ${depth} ${escapedPath}`;

    return this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });
  }

  /**
   * Execute a command in a working directory on a remote host.
   */
  async executeCommand(
    host: HostConfig,
    path: string,
    command: string,
    timeout: number
  ): Promise<{ stdout: string; exitCode: number }> {
    this.validatePath(path);
    this.validateCommand(command);

    const escapedPath = escapeShellArg(path);
    const fullCommand = `cd ${escapedPath} && ${command}`;

    const stdout = await this.sshService.executeSSHCommand(
      host,
      fullCommand,
      [],
      { timeoutMs: timeout }
    );

    return { stdout, exitCode: 0 };
  }

  /**
   * Find files matching a pattern on a remote host.
   */
  async findFiles(
    host: HostConfig,
    path: string,
    pattern: string,
    options: { type?: "f" | "d" | "l"; maxDepth?: number; limit?: number }
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const escapedPattern = escapeShellArg(pattern);

    let command = `find ${escapedPath}`;

    if (options.maxDepth !== undefined) {
      command += ` -maxdepth ${options.maxDepth}`;
    }

    if (options.type) {
      command += ` -type ${options.type}`;
    }

    command += ` -name ${escapedPattern}`;

    if (options.limit !== undefined) {
      command += ` | head -n ${options.limit}`;
    }

    return this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });
  }

  /**
   * Transfer a file between hosts via SCP.
   */
  async transferFile(
    sourceHost: HostConfig,
    sourcePath: string,
    targetHost: HostConfig,
    targetPath: string
  ): Promise<{ bytesTransferred: number; warning?: string }> {
    this.validatePath(sourcePath);
    this.validatePath(targetPath);

    let warning: string | undefined;
    if (isSystemPath(targetPath)) {
      warning = `Warning: target is a system path (${targetPath}). Proceed with caution.`;
    }

    const escapedSource = escapeShellArg(sourcePath);

    // Get file size first
    const sizeOutput = await this.sshService.executeSSHCommand(
      sourceHost,
      `stat -c %s ${escapedSource}`,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );

    const size = parseInt(sizeOutput.trim(), 10) || 0;

    const escapedTarget = escapeShellArg(targetPath);

    // Build scp command
    const sourceSpec = `${sourceHost.sshUser || "root"}@${sourceHost.host}:${escapedSource}`;
    const targetSpec = `${targetHost.sshUser || "root"}@${targetHost.host}:${escapedTarget}`;

    await this.sshService.executeSSHCommand(
      sourceHost,
      `scp ${sourceSpec} ${targetSpec}`,
      [],
      { timeoutMs: 300000 } // 5 minute timeout for transfers
    );

    return { bytesTransferred: size, warning };
  }

  /**
   * Compare two files and return diff output.
   */
  async diffFiles(
    host1: HostConfig,
    path1: string,
    host2: HostConfig,
    path2: string,
    contextLines: number
  ): Promise<string> {
    this.validatePath(path1);
    this.validatePath(path2);

    // Same host: direct diff
    if (host1.name === host2.name) {
      const escapedPath1 = escapeShellArg(path1);
      const escapedPath2 = escapeShellArg(path2);

      // Use || true to prevent non-zero exit code when files differ
      return this.sshService.executeSSHCommand(
        host1,
        `diff -u -U ${contextLines} ${escapedPath1} ${escapedPath2} || true`,
        [],
        { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
      );
    }

    // Cross-host: read both files and compare
    const [content1, content2] = await Promise.all([
      this.readFile(host1, path1, 10485760), // 10MB max
      this.readFile(host2, path2, 10485760)
    ]);

    if (content1.content === content2.content) {
      return "(files are identical)";
    }

    return `--- ${host1.name}:${path1}\n+++ ${host2.name}:${path2}\n@@ differences exist (cross-host diff) @@`;
  }
}
