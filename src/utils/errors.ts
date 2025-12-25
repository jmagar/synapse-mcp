/**
 * Error classes for preserving context in error chains
 *
 * These custom errors ensure we never lose debug information when catching
 * and re-throwing errors. All include:
 * - Original error as 'cause' (preserves stack trace)
 * - Contextual information (host, command, operation)
 * - Structured message format
 */

/**
 * Base error for host operations (SSH, Docker API)
 */
export class HostOperationError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly operation: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = `[Host: ${hostName}] [Op: ${operation}] ${message}`;
    super(fullMessage);
    this.name = "HostOperationError";

    // Preserve original error cause for debugging
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * SSH command execution error with full context
 */
export class SSHCommandError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly stderr?: string,
    public readonly stdout?: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = [
      `[SSH] [Host: ${hostName}] ${message}`,
      `Command: ${command}`,
      exitCode !== undefined ? `Exit code: ${exitCode}` : null,
      stderr ? `Stderr: ${stderr}` : null
    ]
      .filter(Boolean)
      .join("\n");

    super(fullMessage);
    this.name = "SSHCommandError";

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Docker Compose operation error
 */
export class ComposeOperationError extends Error {
  constructor(
    message: string,
    public readonly hostName: string,
    public readonly project: string,
    public readonly action: string,
    public readonly cause?: unknown
  ) {
    const fullMessage = `[Compose] [Host: ${hostName}] [Project: ${project}] [Action: ${action}] ${message}`;
    super(fullMessage);
    this.name = "ComposeOperationError";

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}
