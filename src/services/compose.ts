import { HostConfig } from "../types.js";
import { validateHostForSsh } from "./ssh.js";
import { executeSSHCommand } from "./ssh-pool-exec.js";

/**
 * Validate Docker Compose project name
 * Project names must be alphanumeric with hyphens and underscores only
 */
export function validateProjectName(name: string): void {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid project name: ${name}`);
  }
}

/**
 * Validate extra arguments for docker compose commands
 *
 * SECURITY: Prevents command injection by rejecting shell metacharacters.
 * Only allows alphanumeric, hyphens, underscores, dots, equals, colons,
 * forward slashes, commas, and spaces.
 *
 * @throws {Error} If argument contains shell metacharacters or exceeds 500 chars
 */
function validateComposeArgs(args: string[]): void {
  const SHELL_METACHARACTERS = /[;&|`$()<>{}[\]\\"\'\n\r\t]/;

  for (const arg of args) {
    if (SHELL_METACHARACTERS.test(arg)) {
      throw new Error(`Invalid character in compose argument: ${arg}`);
    }

    // Additional safety: reject extremely long arguments (DoS prevention)
    if (arg.length > 500) {
      throw new Error(`Compose argument too long: ${arg.substring(0, 50)}...`);
    }
  }
}

/**
 * Compose project status
 */
export interface ComposeProject {
  name: string;
  status: "running" | "partial" | "stopped" | "unknown";
  configFiles: string[];
  services: ComposeService[];
}

/**
 * Compose service info
 */
export interface ComposeService {
  name: string;
  status: string;
  health?: string;
  exitCode?: number;
  publishers?: Array<{
    publishedPort: number;
    targetPort: number;
    protocol: string;
  }>;
}

/**
 * Build docker compose command string for remote execution
 *
 * @param project - Project name (optional, for commands that need -p flag)
 * @param action - Compose action (up, down, ps, ls, etc.)
 * @param extraArgs - Additional arguments
 * @returns Command string
 */
function buildComposeCommand(
  project: string | null,
  action: string,
  extraArgs: string[] = []
): string {
  const parts = ["docker", "compose"];

  if (project) {
    parts.push("-p", project);
  }

  parts.push(action);
  parts.push(...extraArgs);

  return parts.join(" ");
}

/**
 * Execute docker compose command on remote host using connection pool
 *
 * SECURITY: Arguments are validated before execution to prevent command injection.
 * Uses SSH connection pool for better performance.
 *
 * @param host - Host configuration with SSH details
 * @param project - Docker Compose project name (validated, alphanumeric only)
 * @param action - Compose action (up, down, restart, etc.)
 * @param extraArgs - Additional arguments (validated for shell metacharacters)
 * @returns Command output
 * @throws {Error} If validation fails or SSH execution fails
 */
export async function composeExec(
  host: HostConfig,
  project: string,
  action: string,
  extraArgs: string[] = []
): Promise<string> {
  validateHostForSsh(host);
  validateProjectName(project);
  validateComposeArgs(extraArgs);

  const command = buildComposeCommand(project, action, extraArgs);

  try {
    return await executeSSHCommand(host, command, [], { timeoutMs: 30000 });
  } catch (error) {
    throw new Error(
      `Compose command failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * List all compose projects on a host using connection pool
 */
export async function listComposeProjects(host: HostConfig): Promise<ComposeProject[]> {
  validateHostForSsh(host);

  const command = buildComposeCommand(null, "ls", ["--format", "json"]);

  try {
    const stdout = await executeSSHCommand(host, command, [], { timeoutMs: 15000 });

    if (!stdout.trim()) {
      return [];
    }

    const projects = JSON.parse(stdout) as Array<{
      Name: string;
      Status: string;
      ConfigFiles: string;
    }>;

    return projects.map((p) => ({
      name: p.Name,
      status: parseComposeStatus(p.Status),
      configFiles: p.ConfigFiles.split(",").map((f) => f.trim()),
      services: []
    }));
  } catch (error) {
    throw new Error(
      `Failed to list compose projects: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Parse compose status string to enum
 */
function parseComposeStatus(status: string): ComposeProject["status"] {
  const lower = status.toLowerCase();
  if (lower.includes("running")) {
    if (lower.includes("(") && !lower.includes("running(")) {
      return "partial";
    }
    return "running";
  }
  if (lower.includes("exited") || lower.includes("stopped")) {
    return "stopped";
  }
  return "unknown";
}

/**
 * Get detailed status of a compose project using connection pool
 */
export async function getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject> {
  validateHostForSsh(host);
  validateProjectName(project);

  const command = buildComposeCommand(project, "ps", ["--format", "json"]);

  try {
    const stdout = await executeSSHCommand(host, command, [], { timeoutMs: 15000 });

    const services: ComposeService[] = [];

    if (stdout.trim()) {
      // docker compose ps outputs one JSON object per line
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const svc = JSON.parse(line) as {
            Name: string;
            State: string;
            Health?: string;
            ExitCode?: number;
            Publishers?: Array<{
              PublishedPort: number;
              TargetPort: number;
              Protocol: string;
            }>;
          };
          services.push({
            name: svc.Name,
            status: svc.State,
            health: svc.Health,
            exitCode: svc.ExitCode,
            publishers: svc.Publishers?.map((p) => ({
              publishedPort: p.PublishedPort,
              targetPort: p.TargetPort,
              protocol: p.Protocol
            }))
          });
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Determine overall status
    let status: ComposeProject["status"] = "unknown";
    if (services.length === 0) {
      status = "stopped";
    } else {
      const running = services.filter((s) => s.status === "running").length;
      if (running === services.length) {
        status = "running";
      } else if (running > 0) {
        status = "partial";
      } else {
        status = "stopped";
      }
    }

    return {
      name: project,
      status,
      configFiles: [],
      services
    };
  } catch (error) {
    throw new Error(
      `Failed to get compose status: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Start a compose project
 */
export async function composeUp(host: HostConfig, project: string, detach = true): Promise<string> {
  const args = detach ? ["-d"] : [];
  return composeExec(host, project, "up", args);
}

/**
 * Stop a compose project
 */
export async function composeDown(
  host: HostConfig,
  project: string,
  removeVolumes = false
): Promise<string> {
  const args = removeVolumes ? ["-v"] : [];
  return composeExec(host, project, "down", args);
}

/**
 * Restart a compose project
 */
export async function composeRestart(host: HostConfig, project: string): Promise<string> {
  return composeExec(host, project, "restart", []);
}

/**
 * Get logs from a compose project
 */
export async function composeLogs(
  host: HostConfig,
  project: string,
  options: { lines?: number; service?: string } = {}
): Promise<string> {
  const args: string[] = ["--no-color"];

  if (options.lines) {
    args.push("--tail", String(options.lines));
  }

  if (options.service) {
    // Validate service name like project name
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "logs", args);
}

/**
 * Build images for a compose project
 */
export async function composeBuild(
  host: HostConfig,
  project: string,
  options: { service?: string; noCache?: boolean } = {}
): Promise<string> {
  const args: string[] = [];

  if (options.noCache) {
    args.push("--no-cache");
  }

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "build", args);
}

/**
 * Pull images for a compose project
 */
export async function composePull(
  host: HostConfig,
  project: string,
  options: { service?: string } = {}
): Promise<string> {
  const args: string[] = [];

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "pull", args);
}

/**
 * Recreate containers for a compose project (force recreate)
 */
export async function composeRecreate(
  host: HostConfig,
  project: string,
  options: { service?: string } = {}
): Promise<string> {
  const args: string[] = ["-d", "--force-recreate"];

  if (options.service) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
      throw new Error(`Invalid service name: ${options.service}`);
    }
    args.push(options.service);
  }

  return composeExec(host, project, "up", args);
}
