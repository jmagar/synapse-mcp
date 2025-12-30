import type { HostConfig } from "../types.js";
import type { ISSHService, IFileService } from "./interfaces.js";
import { validateSecurePath, escapeShellArg, isSystemPath } from "../utils/path-security.js";
import { validateHostForSsh } from "./ssh.js";
import {
  ALLOWED_COMMANDS,
  ENV_ALLOW_ANY_COMMAND,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  MAX_TREE_DEPTH,
  MAX_FIND_LIMIT,
  MAX_DIFF_CONTEXT_LINES,
  MAX_FILE_SIZE_LIMIT
} from "../constants.js";

/**
 * Validates that a number is a safe positive integer for shell interpolation.
 * Prevents injection via malformed numbers like "5; rm -rf /".
 */
function validatePositiveInt(value: number, name: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}, got: ${value}`);
  }
  return value;
}

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
   * Parses and validates a command, returning the safe escaped version.
   * Validates base command against allowlist and escapes all arguments.
   * Can be bypassed with HOMELAB_ALLOW_ANY_COMMAND=true env var.
   *
   * SECURITY: This prevents command injection via arguments like:
   *   "ls -la; rm -rf /" -> base="ls" passes, but "; rm -rf /" would execute
   *   Fix: Split into ["ls", "-la;", "rm", "-rf", "/"], escape each part
   */
  private validateAndEscapeCommand(command: string): string {
    const allowAny = process.env[ENV_ALLOW_ANY_COMMAND] === "true";

    // Split command into parts (handles multiple spaces)
    const parts = command.trim().split(/\s+/).filter((p) => p.length > 0);

    if (parts.length === 0) {
      throw new Error("Command cannot be empty");
    }

    const baseCommand = parts[0];

    // Validate base command against allowlist (unless bypassed)
    if (!allowAny && !ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command '${baseCommand}' not in allowed list. ` +
          `Allowed: ${[...ALLOWED_COMMANDS].join(", ")}. ` +
          `Set ${ENV_ALLOW_ANY_COMMAND}=true to allow any command.`
      );
    }

    // Escape all arguments individually to prevent injection
    // Base command is NOT escaped (it's validated against allowlist)
    // Arguments ARE escaped to prevent shell metacharacter injection
    if (parts.length === 1) {
      return baseCommand;
    }

    const escapedArgs = parts.slice(1).map((arg) => escapeShellArg(arg));
    return `${baseCommand} ${escapedArgs.join(" ")}`;
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

    // SECURITY: Validate maxSize is a safe integer to prevent injection
    const safeMaxSize = validatePositiveInt(maxSize, "maxSize", MAX_FILE_SIZE_LIMIT);

    const escapedPath = escapeShellArg(path);
    // Read maxSize + 1 bytes to detect if truncation is needed
    const command = `cat ${escapedPath} | head -c ${safeMaxSize + 1}`;

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
  async listDirectory(host: HostConfig, path: string, showHidden: boolean): Promise<string> {
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
  async treeDirectory(host: HostConfig, path: string, depth: number): Promise<string> {
    this.validatePath(path);

    // Validate depth is a safe integer to prevent injection
    const safeDepth = validatePositiveInt(depth, "depth", MAX_TREE_DEPTH);

    const escapedPath = escapeShellArg(path);
    const command = `tree -L ${safeDepth} ${escapedPath}`;

    return this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });
  }

  /**
   * Execute a command in a working directory on a remote host.
   *
   * SECURITY: Command is validated against allowlist and all arguments
   * are individually escaped to prevent injection attacks.
   */
  async executeCommand(
    host: HostConfig,
    path: string,
    command: string,
    timeout: number
  ): Promise<{ stdout: string; exitCode: number }> {
    this.validatePath(path);

    // Validate timeout is a safe integer
    const safeTimeout = validatePositiveInt(timeout, "timeout", MAX_COMMAND_TIMEOUT);

    // Validate base command and escape all arguments
    const safeCommand = this.validateAndEscapeCommand(command);

    const escapedPath = escapeShellArg(path);
    const fullCommand = `cd ${escapedPath} && ${safeCommand}`;

    const stdout = await this.sshService.executeSSHCommand(host, fullCommand, [], {
      timeoutMs: safeTimeout
    });

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

    // Validate and add maxDepth if provided
    if (options.maxDepth !== undefined) {
      const safeMaxDepth = validatePositiveInt(options.maxDepth, "maxDepth", MAX_TREE_DEPTH);
      command += ` -maxdepth ${safeMaxDepth}`;
    }

    // Runtime validation for type - TypeScript types are compile-time only
    // and don't protect against malicious runtime input
    if (options.type !== undefined) {
      const allowedTypes = ["f", "d", "l"] as const;
      if (!allowedTypes.includes(options.type)) {
        throw new Error(`Invalid type '${options.type}'. Allowed values: ${allowedTypes.join(", ")}`);
      }
      command += ` -type ${options.type}`;
    }

    command += ` -name ${escapedPattern}`;

    // Validate and add limit if provided
    if (options.limit !== undefined) {
      const safeLimit = validatePositiveInt(options.limit, "limit", MAX_FIND_LIMIT);
      command += ` | head -n ${safeLimit}`;
    }

    return this.sshService.executeSSHCommand(host, command, [], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT
    });
  }

  /**
   * Transfer a file between hosts via SSH cat piping.
   *
   * SECURITY: Uses SSH cat piping instead of SCP to avoid path escaping
   * issues with the user@host:path format. The source path is escaped
   * for the source shell, and the target path is separately escaped
   * inside the SSH command for the target shell.
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

    const sizeStr = sizeOutput.trim();
    const size = parseInt(sizeStr, 10);
    if (isNaN(size) || size < 0) {
      throw new Error(`Failed to get file size: stat returned '${sizeStr}'`);
    }

    // For same-host transfers, use simple cp
    if (sourceHost.name === targetHost.name) {
      const escapedTarget = escapeShellArg(targetPath);
      await this.sshService.executeSSHCommand(
        sourceHost,
        `cp ${escapedSource} ${escapedTarget}`,
        [],
        { timeoutMs: 300000 }
      );
      return { bytesTransferred: size, warning };
    }

    // For cross-host transfers, use SSH cat piping
    // This avoids SCP's path escaping issues with user@host:path format
    // Command: cat /source/path | ssh user@target 'cat > /target/path'
    //
    // SECURITY: Validate targetHost before interpolating into shell command
    // to prevent command injection via malicious hostname or sshUser values
    validateHostForSsh(targetHost);

    const targetUser = targetHost.sshUser || "root";

    // Build the remote command that will run on the target host.
    // The command goes through TWO shell parsing stages:
    //
    //   1. SOURCE SHELL: Parses the full `ssh user@host 'remote-cmd'` line
    //   2. REMOTE SHELL: Parses 'remote-cmd' after SSH delivers it
    //
    // Example for targetPath = "/data/my file.txt":
    //
    //   Step 1: Escape for remote shell -> "cat > '/data/my file.txt'"
    //   Step 2: Escape for source shell -> "'cat > '\\'''/data/my file.txt'\\''''"
    //
    // The source shell strips the outer quotes and escapes, then SSH passes
    // "cat > '/data/my file.txt'" to the remote shell, which handles it correctly.
    //
    const remoteCmdUnescaped = `cat > ${escapeShellArg(targetPath)}`;  // For remote shell
    const remoteCmdForSourceShell = escapeShellArg(remoteCmdUnescaped); // For source shell

    const transferCmd = `cat ${escapedSource} | ssh ${targetUser}@${targetHost.host} ${remoteCmdForSourceShell}`;

    await this.sshService.executeSSHCommand(
      sourceHost,
      transferCmd,
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

    // Validate contextLines is a safe integer
    const safeContextLines = validatePositiveInt(contextLines, "contextLines", MAX_DIFF_CONTEXT_LINES);

    // Same host: direct diff
    if (host1.name === host2.name) {
      const escapedPath1 = escapeShellArg(path1);
      const escapedPath2 = escapeShellArg(path2);

      // Use || true to prevent non-zero exit code when files differ
      return this.sshService.executeSSHCommand(
        host1,
        `diff -u -U ${safeContextLines} ${escapedPath1} ${escapedPath2} || true`,
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
