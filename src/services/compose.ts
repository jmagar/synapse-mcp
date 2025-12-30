import { HostConfig } from "../types.js";
import { validateHostForSsh } from "./ssh.js";
import { ComposeOperationError, logError } from "../utils/errors.js";
import { isLocalHost } from "../utils/host-utils.js";
import type { ISSHService, IComposeService, ILocalExecutorService } from "./interfaces.js";

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
  const SHELL_METACHARACTERS = /[;&|`$()<>{}[\]\\"\n\r\t]/;

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
  services: ComposeServiceInfo[];
}

/**
 * Compose service info
 */
export interface ComposeServiceInfo {
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
 * ComposeService class for managing Docker Compose operations with dependency injection
 */
export class ComposeService implements IComposeService {
  constructor(
    private sshService: ISSHService,
    private localExecutor: ILocalExecutorService
  ) {}

  /**
   * Execute docker compose command on local or remote host
   *
   * SECURITY: Arguments are validated before execution to prevent command injection.
   * Uses local executor for localhost, SSH connection pool for remote hosts.
   *
   * @param host - Host configuration with execution details
   * @param project - Docker Compose project name (validated, alphanumeric only)
   * @param action - Compose action (up, down, restart, etc.)
   * @param extraArgs - Additional arguments (validated for shell metacharacters)
   * @returns Command output
   * @throws {Error} If validation fails or execution fails
   */
  async composeExec(
    host: HostConfig,
    project: string,
    action: string,
    extraArgs: string[] = []
  ): Promise<string> {
    validateProjectName(project);
    validateComposeArgs(extraArgs);

    // Build command parts for docker compose
    const args = ["compose"];
    if (project) {
      args.push("-p", project);
    }
    args.push(action);
    args.push(...extraArgs);

    try {
      // Route to local or SSH executor based on host config
      if (isLocalHost(host)) {
        return await this.localExecutor.executeLocalCommand("docker", args, {
          timeoutMs: 30000
        });
      } else {
        // Remote host - use SSH
        validateHostForSsh(host);
        const command = buildComposeCommand(project, action, extraArgs);
        return await this.sshService.executeSSHCommand(host, command, [], { timeoutMs: 30000 });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      throw new ComposeOperationError(
        `Docker Compose command failed: ${detail}`,
        host.name,
        project,
        action,
        error
      );
    }
  }

  /**
   * List all compose projects on a host (local or remote)
   */
  async listComposeProjects(host: HostConfig): Promise<ComposeProject[]> {
    const args = ["--format", "json"];

    try {
      let stdout: string;

      if (isLocalHost(host)) {
        stdout = await this.localExecutor.executeLocalCommand(
          "docker",
          ["compose", "ls", ...args],
          { timeoutMs: 15000 }
        );
      } else {
        validateHostForSsh(host);
        const command = buildComposeCommand(null, "ls", args);
        stdout = await this.sshService.executeSSHCommand(host, command, [], {
          timeoutMs: 15000
        });
      }

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
      const detail = error instanceof Error ? error.message : "Unknown error";
      throw new ComposeOperationError(
        `Failed to list compose projects: ${detail}`,
        host.name,
        "*",
        "ls",
        error
      );
    }
  }

  /**
   * Get detailed status of a compose project (local or remote)
   */
  async getComposeStatus(host: HostConfig, project: string): Promise<ComposeProject> {
    validateProjectName(project);

    const args = ["--format", "json"];

    try {
      let stdout: string;

      if (isLocalHost(host)) {
        stdout = await this.localExecutor.executeLocalCommand(
          "docker",
          ["compose", "-p", project, "ps", ...args],
          { timeoutMs: 15000 }
        );
      } else {
        validateHostForSsh(host);
        const command = buildComposeCommand(project, "ps", args);
        stdout = await this.sshService.executeSSHCommand(host, command, [], {
          timeoutMs: 15000
        });
      }

      const services: ComposeServiceInfo[] = [];

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
            logError(new Error("Failed to parse compose service line"), {
              operation: "getComposeStatus",
              metadata: {
                host: host.name,
                project,
                line: line.substring(0, 100)
              }
            });
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
      const detail = error instanceof Error ? error.message : "Unknown error";
      throw new ComposeOperationError(
        `Failed to get compose status: ${detail}`,
        host.name,
        project,
        "ps",
        error
      );
    }
  }

  /**
   * Start a compose project
   */
  async composeUp(host: HostConfig, project: string, detach = true): Promise<string> {
    const args = detach ? ["-d"] : [];
    return this.composeExec(host, project, "up", args);
  }

  /**
   * Stop a compose project
   */
  async composeDown(host: HostConfig, project: string, removeVolumes = false): Promise<string> {
    const args = removeVolumes ? ["-v"] : [];
    return this.composeExec(host, project, "down", args);
  }

  /**
   * Restart a compose project
   */
  async composeRestart(host: HostConfig, project: string): Promise<string> {
    return this.composeExec(host, project, "restart", []);
  }

  /**
   * Get logs from a compose project
   */
  async composeLogs(
    host: HostConfig,
    project: string,
    options: {
      tail?: number;
      follow?: boolean;
      timestamps?: boolean;
      since?: string;
      until?: string;
      services?: string[];
    } = {}
  ): Promise<string> {
    const args: string[] = ["--no-color"];

    if (options.tail !== undefined) {
      args.push("--tail", String(options.tail));
    }

    if (options.follow) {
      args.push("-f");
    }

    if (options.timestamps) {
      args.push("-t");
    }

    if (options.since) {
      args.push("--since", options.since);
    }

    if (options.until) {
      args.push("--until", options.until);
    }

    if (options.services && options.services.length > 0) {
      // Validate service names
      for (const service of options.services) {
        if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
          throw new Error(`Invalid service name: ${service}`);
        }
      }
      args.push(...options.services);
    }

    return this.composeExec(host, project, "logs", args);
  }

  /**
   * Build images for a compose project
   */
  async composeBuild(
    host: HostConfig,
    project: string,
    options: { service?: string; noCache?: boolean; pull?: boolean } = {}
  ): Promise<string> {
    const args: string[] = [];

    if (options.noCache) {
      args.push("--no-cache");
    }

    if (options.pull) {
      args.push("--pull");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "build", args);
  }

  /**
   * Pull images for a compose project
   */
  async composePull(
    host: HostConfig,
    project: string,
    options: { service?: string; ignorePullFailures?: boolean; quiet?: boolean } = {}
  ): Promise<string> {
    const args: string[] = [];

    if (options.ignorePullFailures) {
      args.push("--ignore-pull-failures");
    }

    if (options.quiet) {
      args.push("--quiet");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "pull", args);
  }

  /**
   * Recreate containers for a compose project (force recreate)
   */
  async composeRecreate(
    host: HostConfig,
    project: string,
    options: { service?: string; forceRecreate?: boolean; noDeps?: boolean } = {}
  ): Promise<string> {
    const args: string[] = ["-d"];

    if (options.forceRecreate !== false) {
      args.push("--force-recreate");
    }

    if (options.noDeps) {
      args.push("--no-deps");
    }

    if (options.service) {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.service)) {
        throw new Error(`Invalid service name: ${options.service}`);
      }
      args.push(options.service);
    }

    return this.composeExec(host, project, "up", args);
  }
}
