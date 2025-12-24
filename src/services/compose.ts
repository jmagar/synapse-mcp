import { execFile } from "child_process";
import { promisify } from "util";
import { HostConfig } from "../types.js";
import { sanitizeForShell, validateHostForSsh } from "./ssh.js";

const execFileAsync = promisify(execFile);

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
 * Build SSH command args for remote compose execution
 */
function buildComposeArgs(host: HostConfig): string[] {
  validateHostForSsh(host);

  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "StrictHostKeyChecking=accept-new"
  ];

  if (host.sshKeyPath) {
    args.push("-i", sanitizeForShell(host.sshKeyPath));
  }

  // Use host.name for SSH target to leverage ~/.ssh/config (port, key, user settings)
  const target = host.host.includes("/") ? "localhost" : sanitizeForShell(host.name);

  args.push(target);

  return args;
}

/**
 * Execute docker compose command on remote host
 *
 * SECURITY: Uses execFile with argument arrays (not shell strings) to prevent
 * command injection. All extraArgs are validated before execution.
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
  validateProjectName(project);
  validateComposeArgs(extraArgs);

  // Build SSH connection arguments
  const sshArgs = buildComposeArgs(host);

  // Build docker compose command as separate arguments (NOT concatenated string)
  // SSH will receive: ssh [options] host docker compose -p project action arg1 arg2 ...
  sshArgs.push("docker", "compose", "-p", project, action, ...extraArgs);

  try {
    const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: 30000 });
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Compose command failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * List all compose projects on a host
 */
export async function listComposeProjects(host: HostConfig): Promise<ComposeProject[]> {
  const sshArgs = buildComposeArgs(host);
  sshArgs.push("docker", "compose", "ls", "--format", "json");

  try {
    const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: 15000 });

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
 * Get detailed status of a compose project
 */
export async function getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject> {
  validateProjectName(project);

  const sshArgs = buildComposeArgs(host);
  sshArgs.push("docker", "compose", "-p", project, "ps", "--format", "json");

  try {
    const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: 15000 });

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
