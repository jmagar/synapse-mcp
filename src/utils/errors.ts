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

/**
 * Additional context for error logging
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log error with structured context
 *
 * NEVER use this to silently swallow errors - always re-throw after logging
 * if the error should propagate.
 *
 * @param error - Error to log (any type)
 * @param context - Additional context information
 */
export function logError(error: unknown, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  const parts: string[] = [`[${timestamp}]`];

  if (context?.requestId) {
    parts.push(`[Request: ${context.requestId}]`);
  }

  if (context?.operation) {
    parts.push(`[Operation: ${context.operation}]`);
  }

  // Extract error details
  if (error instanceof HostOperationError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Op: ${error.operation}]`);
  } else if (error instanceof SSHCommandError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Command: ${error.command}]`);
  } else if (error instanceof ComposeOperationError) {
    parts.push(`[Host: ${error.hostName}]`);
    parts.push(`[Project: ${error.project}]`);
    parts.push(`[Action: ${error.action}]`);
  }

  if (error instanceof Error) {
    parts.push(error.name);
    parts.push(error.message);
    console.error(parts.join(" "));

    if (error.stack) {
      console.error(error.stack);
    }

    if (context?.metadata) {
      console.error("Metadata:", JSON.stringify(context.metadata, null, 2));
    }
  } else {
    parts.push(String(error));
    console.error(parts.join(" "));
  }
}
