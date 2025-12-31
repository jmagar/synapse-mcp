import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ILocalExecutorService } from "./interfaces.js";

const execFileAsync = promisify(execFile);

/**
 * Options for local command execution
 */
export interface LocalCommandOptions {
  timeoutMs?: number; // Command timeout (default: 30000)
  cwd?: string; // Working directory
}

/**
 * LocalExecutorService implementation for executing commands on localhost.
 * Uses Node.js execFile for secure command execution without shell interpretation.
 *
 * SECURITY: Uses execFile (not exec) to prevent shell injection attacks.
 * Command and arguments are passed separately, preventing metacharacter interpretation.
 */
export class LocalExecutorService implements ILocalExecutorService {
  /**
   * Execute a command locally using Node.js execFile
   *
   * SECURITY: Uses execFile which does NOT invoke a shell, preventing command injection.
   * Arguments are passed as array elements, not concatenated strings.
   *
   * @param command - Command to execute (binary name or path)
   * @param args - Command arguments (each element is a separate argument)
   * @param options - Execution options (timeout, cwd)
   * @returns Command stdout (trimmed)
   * @throws Error if command fails, times out, or binary not found
   */
  async executeLocalCommand(
    command: string,
    args: string[] = [],
    options: LocalCommandOptions = {}
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? 30000;

    if (!command || command.trim() === "") {
      throw new Error("Command cannot be empty");
    }

    try {
      // execFile does NOT use shell - args are passed directly to the binary
      // This prevents injection: echo "foo; rm -rf /" becomes literal string, not executed
      const { stdout } = await execFileAsync(command, args, {
        timeout: timeoutMs,
        cwd: options.cwd,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
        encoding: "utf8",
        // IMPORTANT: no shell option - we want execFile's default behavior (no shell)
        shell: false
      });

      // execFile can succeed with stderr output in some cases
      // We only fail on non-zero exit codes (handled by execFile rejection)
      return stdout.trim();
    } catch (error) {
      // Type guard for Error objects
      if (error instanceof Error) {
        // execFile throws with code property on command errors
        const execError = error as Error & {
          code?: string | number;
          killed?: boolean;
          signal?: string;
          stderr?: string;
          stdout?: string;
        };

        // Handle timeout or forced termination
        // killed=true indicates process was forcibly terminated
        // SIGTERM is graceful termination, SIGKILL is forced termination
        if (execError.killed || execError.signal === "SIGTERM" || execError.signal === "SIGKILL") {
          throw new Error(
            `Local command timeout after ${timeoutMs}ms: ${command} ${args.join(" ")}`
          );
        }

        // Handle command not found
        if (execError.code === "ENOENT") {
          throw new Error(`Command not found: ${command}`);
        }

        // Handle command execution failure with context
        const argsStr = args.length > 0 ? ` ${args.join(" ")}` : "";
        const stderrInfo = execError.stderr ? `\nStderr: ${execError.stderr}` : "";
        throw new Error(
          `Local command failed: ${command}${argsStr}${stderrInfo}\nOriginal error: ${error.message}`
        );
      }

      // Non-Error exceptions (rare)
      throw new Error(`Local command execution failed: ${String(error)}`);
    }
  }
}
