import { ALLOWED_COMMANDS, ENV_ALLOW_ANY_COMMAND } from "../constants.js";
import { escapeShellArg } from "./path-security.js";

/**
 * Safe command character pattern.
 * Allows alphanumeric, underscore, hyphen, and forward slash (for paths like /usr/bin/grep).
 */
const SAFE_COMMAND_PATTERN = /^[a-zA-Z0-9_\-/]+$/;

/**
 * Parse a command string into parts for allowlist validation.
 *
 * IMPORTANT LIMITATION: This function does NOT handle shell-quoted arguments.
 * It splits purely on whitespace, meaning commands like:
 *   grep "hello world" file.txt
 * Will be parsed as: ["grep", '"hello', 'world"', "file.txt"]
 *
 * This is acceptable for our use case because:
 * 1. Arguments are escaped via escapeShellArg() in buildSafeShellCommand()
 * 2. Callers should pass arguments as separate array elements when possible
 * 3. This function is primarily for allowlist validation, not shell execution
 *
 * If you need quoted argument handling, pass arguments separately to the
 * underlying service functions rather than as a single command string.
 */
export function parseCommandParts(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

/**
 * Validate a command against the allowlist and return the parsed parts.
 */
export function validateCommandAllowlist(command: string): string[] {
  const parts = parseCommandParts(command);

  if (parts.length === 0) {
    throw new Error("Command cannot be empty");
  }

  const baseCommand = parts[0];
  const allowAny = process.env[ENV_ALLOW_ANY_COMMAND] === "true";

  if (!allowAny && !ALLOWED_COMMANDS.has(baseCommand)) {
    throw new Error(
      `Command '${baseCommand}' not in allowed list. ` +
        `Allowed: ${[...ALLOWED_COMMANDS].join(", ")}. ` +
        `Set ${ENV_ALLOW_ANY_COMMAND}=true to allow any command.`
    );
  }

  return parts;
}

/**
 * Validate that the base command contains only safe characters.
 * Prevents shell injection via command names when ENV_ALLOW_ANY_COMMAND is enabled
 * or if the allowlist were to be modified to include unsafe patterns.
 *
 * @throws Error if command contains unsafe characters
 */
function validateBaseCommand(baseCommand: string): void {
  if (!SAFE_COMMAND_PATTERN.test(baseCommand)) {
    throw new Error(
      `Base command '${baseCommand}' contains unsafe characters. ` +
        `Only alphanumeric, underscore, hyphen, and forward slash are allowed.`
    );
  }
}

/**
 * Validate command against allowlist and escape arguments for shell usage.
 *
 * Security measures:
 * 1. Command is validated against allowlist (unless ENV_ALLOW_ANY_COMMAND=true)
 * 2. Base command is validated against safe character pattern
 * 3. All arguments are escaped via escapeShellArg()
 */
export function buildSafeShellCommand(command: string): string {
  const parts = validateCommandAllowlist(command);
  const baseCommand = parts[0];

  // Validate base command contains only safe characters
  // This protects against injection when ENV_ALLOW_ANY_COMMAND=true
  // or if allowlist is modified to include unsafe patterns
  validateBaseCommand(baseCommand);

  if (parts.length === 1) {
    return baseCommand;
  }

  const escapedArgs = parts.slice(1).map((arg) => escapeShellArg(arg));
  return `${baseCommand} ${escapedArgs.join(" ")}`;
}
