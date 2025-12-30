import type { HostConfig } from "../types.js";

/**
 * Determine if a host should use local command execution instead of SSH.
 *
 * A host is considered local if:
 * - Host is localhost/127.x.x.x/::1/0.0.0.0 AND no SSH user is specified
 * - Protocol is SSH (http/https are Docker API only, not for command execution)
 *
 * Note: Even localhost with sshUser means we need to SSH as that user,
 * so it's treated as remote for command execution purposes.
 *
 * @param host - Host configuration to check
 * @returns True if commands should run locally, false if SSH is required
 */
export function isLocalHost(host: HostConfig): boolean {
  // Docker API protocols (http/https) don't support local command execution
  if (host.protocol === "http" || host.protocol === "https") {
    return false;
  }

  // If SSH user is specified, we need SSH even for localhost
  if (host.sshUser) {
    return false;
  }

  // Check if hostname is a loopback address
  const hostname = host.host.toLowerCase();

  // Check for localhost
  if (hostname === "localhost") {
    return true;
  }

  // Check for IPv4 loopback (127.0.0.0/8)
  if (hostname.startsWith("127.")) {
    return true;
  }

  // Check for IPv6 loopback
  if (hostname === "::1") {
    return true;
  }

  // Check for 0.0.0.0 (all interfaces - treated as local)
  if (hostname === "0.0.0.0") {
    return true;
  }

  return false;
}
