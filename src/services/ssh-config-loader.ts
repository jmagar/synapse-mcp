import SSHConfig, { LineType, type Section, type Directive } from "ssh-config";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { HostConfig } from "../types.js";

/**
 * Expand tilde (~) in paths to user's home directory
 */
function expandTildePath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

/**
 * Check if a host pattern contains wildcards or special characters
 * Skip hosts like *, *.example.com, etc.
 */
function isPatternHost(hostName: string): boolean {
  return hostName.includes("*") || hostName.includes("?");
}

/**
 * Helper to get string value from SSH config value
 */
function getStringValue(value: string | { val: string }[]): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0].val;
  }
  return "";
}

/**
 * Load host configurations from SSH config file
 *
 * @param configPath - Path to SSH config file (defaults to ~/.ssh/config)
 * @returns Array of HostConfig objects parsed from SSH config
 *
 * @example
 * ```typescript
 * const hosts = loadFromSSHConfig("~/.ssh/config");
 * // Returns: [{ name: "server1", host: "192.168.1.100", protocol: "ssh", ... }]
 * ```
 */
export function loadFromSSHConfig(configPath: string = join(homedir(), ".ssh", "config")): HostConfig[] {
  // Return empty array if config doesn't exist
  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const configContent = readFileSync(configPath, "utf-8");
    const config = SSHConfig.parse(configContent);
    const hosts: HostConfig[] = [];

    for (const section of config) {
      // Only process Host sections (not Match or other directives)
      if (section.type !== LineType.DIRECTIVE) {
        continue;
      }

      const directive = section as Directive;
      if (directive.param !== "Host") {
        continue;
      }

      const hostValue = getStringValue(directive.value);

      // Skip wildcard hosts and pattern hosts
      if (!hostValue || hostValue === "*" || isPatternHost(hostValue)) {
        continue;
      }

      // Find the config section for this host
      const hostSection = config.find({ Host: hostValue }) as Section | undefined;
      if (!hostSection || !("config" in hostSection)) {
        continue;
      }

      // Extract hostname - required field
      const hostname = hostSection.config.find((line) => {
        return line.type === LineType.DIRECTIVE && (line as Directive).param === "HostName";
      }) as Directive | undefined;

      // Skip hosts without HostName (they're just aliases)
      if (!hostname || !hostname.value) {
        continue;
      }

      // Build HostConfig object
      const hostConfig: HostConfig = {
        name: hostValue,
        host: getStringValue(hostname.value),
        protocol: "ssh" as const
      };

      // Extract optional User
      const user = hostSection.config.find((line) => {
        return line.type === LineType.DIRECTIVE && (line as Directive).param === "User";
      }) as Directive | undefined;
      if (user?.value) {
        hostConfig.sshUser = getStringValue(user.value);
      }

      // Extract optional Port
      const port = hostSection.config.find((line) => {
        return line.type === LineType.DIRECTIVE && (line as Directive).param === "Port";
      }) as Directive | undefined;
      if (port?.value) {
        const portNum = parseInt(getStringValue(port.value), 10);
        if (!isNaN(portNum)) {
          hostConfig.port = portNum;
        }
      }

      // Extract optional IdentityFile
      const identityFile = hostSection.config.find((line) => {
        return line.type === LineType.DIRECTIVE && (line as Directive).param === "IdentityFile";
      }) as Directive | undefined;
      if (identityFile?.value) {
        const rawPath = getStringValue(identityFile.value);
        const expandedPath = expandTildePath(rawPath);
        hostConfig.sshKeyPath = expandedPath;

        // === Layer 0: SSH Config Loading ===
        console.error("=== SSH Config Loaded ===");
        console.error("Host:", hostConfig.name);
        console.error("Host address:", hostConfig.host);
        console.error("Port:", hostConfig.port || 22);
        console.error("User:", hostConfig.sshUser || "(not set)");
        console.error("Raw key path:", rawPath);
        console.error("Expanded key path:", expandedPath);
      }

      hosts.push(hostConfig);
    }

    console.error(`=== SSH Config Parse Complete ===`);
    console.error(`Loaded ${hosts.length} host(s) from ${configPath}`);

    return hosts;
  } catch (error) {
    // Log error but don't crash - return empty array on parse errors
    console.error(`Failed to parse SSH config at ${configPath}:`, error);
    return [];
  }
}

/**
 * Merge host configurations with manual config taking precedence
 *
 * Manual hosts completely replace SSH config hosts with the same name.
 * No property merging - manual config is used as-is.
 *
 * @param sshConfigHosts - Hosts loaded from SSH config
 * @param manualHosts - Hosts from manual configuration (config file or env var)
 * @returns Merged array with manual hosts taking precedence
 *
 * @example
 * ```typescript
 * const sshHosts = [{ name: "server1", host: "192.168.1.100", protocol: "ssh" }];
 * const manualHosts = [{ name: "server1", host: "10.0.0.100", protocol: "http" }];
 * const merged = mergeHostConfigs(sshHosts, manualHosts);
 * // Result: [{ name: "server1", host: "10.0.0.100", protocol: "http" }]
 * // Manual config completely replaces SSH config
 * ```
 */
export function mergeHostConfigs(
  sshConfigHosts: HostConfig[],
  manualHosts: HostConfig[]
): HostConfig[] {
  // Create a map of manual hosts by name for fast lookup
  const manualHostMap = new Map<string, HostConfig>();
  for (const host of manualHosts) {
    manualHostMap.set(host.name, host);
  }

  // Start with all manual hosts
  const merged = [...manualHosts];

  // Add SSH hosts that don't conflict with manual hosts
  for (const sshHost of sshConfigHosts) {
    if (!manualHostMap.has(sshHost.name)) {
      merged.push(sshHost);
    }
  }

  return merged;
}
