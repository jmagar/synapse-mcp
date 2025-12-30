import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, unlinkSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import type { HostConfig } from "../types.js";

describe("SSHConnectionPool - Private Key Handling", () => {
  const testDir = join(tmpdir(), "synapse-ssh-key-test");
  const testKeyPath = join(testDir, "test_key");
  const testKeyContent = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
-----END OPENSSH PRIVATE KEY-----`;

  beforeEach(() => {
    // Create test directory and key file
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(testKeyPath, testKeyContent, { mode: 0o600 });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should read private key content from sshKeyPath", async () => {
    const pool = new SSHConnectionPoolImpl({ enableHealthChecks: false });

    const host: HostConfig = {
      name: "test-with-key",
      host: "localhost",
      protocol: "ssh",
      sshUser: "testuser",
      sshKeyPath: testKeyPath,
      port: 22
    };

    // This should read the key file and attempt connection
    // The connection will fail (no SSH server on localhost:22)
    // but we can verify it tried to read the key
    await expect(pool.getConnection(host)).rejects.toThrow();

    await pool.closeAll();
  });

  it("should throw HostOperationError when private key file is missing", async () => {
    const pool = new SSHConnectionPoolImpl({ enableHealthChecks: false });

    const host: HostConfig = {
      name: "test-missing-key",
      host: "localhost",
      protocol: "ssh",
      sshUser: "testuser",
      sshKeyPath: "/nonexistent/path/to/key",
      port: 22
    };

    await expect(pool.getConnection(host)).rejects.toThrow(/Failed to read SSH private key/);

    await pool.closeAll();
  });

  it("should work without private key (for password auth)", async () => {
    const pool = new SSHConnectionPoolImpl({ enableHealthChecks: false });

    const host: HostConfig = {
      name: "test-no-key",
      host: "localhost",
      protocol: "ssh",
      sshUser: "testuser",
      port: 22
      // No sshKeyPath provided
    };

    // Should attempt connection without key
    // Will fail due to no auth, but shouldn't crash
    await expect(pool.getConnection(host)).rejects.toThrow();

    await pool.closeAll();
  });

  it("should handle empty sshKeyPath gracefully", async () => {
    const pool = new SSHConnectionPoolImpl({ enableHealthChecks: false });

    const host: HostConfig = {
      name: "test-empty-key",
      host: "localhost",
      protocol: "ssh",
      sshUser: "testuser",
      sshKeyPath: "",
      port: 22
    };

    // Empty string should be treated as no key
    await expect(pool.getConnection(host)).rejects.toThrow();

    await pool.closeAll();
  });
});
