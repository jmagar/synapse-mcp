import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { loadFromSSHConfig, mergeHostConfigs } from "./ssh-config-loader.js";
import type { HostConfig } from "../types.js";

describe("loadFromSSHConfig", () => {
  const testConfigDir = join(tmpdir(), "synapse-test-ssh-config");
  const testConfigPath = join(testConfigDir, "config");

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test config file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  it("should parse a basic SSH host configuration", () => {
    const sshConfig = `
Host testhost
  HostName 192.168.1.100
  User admin
  Port 22
  IdentityFile ~/.ssh/id_ed25519
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "testhost",
      host: "192.168.1.100",
      protocol: "ssh",
      sshUser: "admin",
      port: 22
    });
    expect(hosts[0].sshKeyPath).toBe(join(homedir(), ".ssh", "id_ed25519"));
  });

  it("should parse multiple hosts", () => {
    const sshConfig = `
Host host1
  HostName 192.168.1.100
  User root
  IdentityFile ~/.ssh/id_rsa

Host host2
  HostName 192.168.1.101
  User admin
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(2);
    expect(hosts[0].name).toBe("host1");
    expect(hosts[0].host).toBe("192.168.1.100");
    expect(hosts[0].sshUser).toBe("root");

    expect(hosts[1].name).toBe("host2");
    expect(hosts[1].host).toBe("192.168.1.101");
    expect(hosts[1].sshUser).toBe("admin");
    expect(hosts[1].port).toBe(2222);
  });

  it("should skip wildcard hosts", () => {
    const sshConfig = `
Host *
  User defaultuser
  IdentityFile ~/.ssh/id_rsa

Host realhost
  HostName 192.168.1.100
  User admin
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("realhost");
  });

  it("should handle missing optional fields gracefully", () => {
    const sshConfig = `
Host minimalhost
  HostName 192.168.1.100
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "minimalhost",
      host: "192.168.1.100",
      protocol: "ssh"
    });
    expect(hosts[0].sshUser).toBeUndefined();
    expect(hosts[0].sshKeyPath).toBeUndefined();
    expect(hosts[0].port).toBeUndefined();
  });

  it("should expand tilde paths", () => {
    const sshConfig = `
Host tildehost
  HostName 192.168.1.100
  IdentityFile ~/custom/path/key
  User admin
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].sshKeyPath).toBe(join(homedir(), "custom", "path", "key"));
  });

  it("should return empty array for nonexistent config file", () => {
    const nonexistentPath = join(testConfigDir, "nonexistent");

    const hosts = loadFromSSHConfig(nonexistentPath);

    expect(hosts).toEqual([]);
  });

  it("should handle malformed config gracefully", () => {
    const malformedConfig = `
This is not valid SSH config
Random garbage text
Host incomplete
  # Missing required fields
`;
    writeFileSync(testConfigPath, malformedConfig);

    // Should not throw, should return what it can parse
    const hosts = loadFromSSHConfig(testConfigPath);

    // May return empty array or partial results depending on implementation
    expect(Array.isArray(hosts)).toBe(true);
  });

  it("should handle hosts with patterns in name", () => {
    const sshConfig = `
Host *.example.com
  User admin
  IdentityFile ~/.ssh/id_rsa

Host server.example.com
  HostName 192.168.1.100
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    // Should skip pattern hosts
    const patternHosts = hosts.filter(h => h.name.includes("*"));
    expect(patternHosts).toHaveLength(0);
  });

  it("should handle absolute paths without tilde expansion", () => {
    const sshConfig = `
Host absolutepath
  HostName 192.168.1.100
  IdentityFile /absolute/path/to/key
  User admin
`;
    writeFileSync(testConfigPath, sshConfig);

    const hosts = loadFromSSHConfig(testConfigPath);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].sshKeyPath).toBe("/absolute/path/to/key");
  });
});

describe("mergeHostConfigs", () => {
  it("should merge unique hosts from both sources", () => {
    const sshHosts: HostConfig[] = [
      { name: "ssh1", host: "192.168.1.100", protocol: "ssh", sshUser: "root" },
      { name: "ssh2", host: "192.168.1.101", protocol: "ssh", sshUser: "admin" }
    ];

    const manualHosts: HostConfig[] = [
      { name: "manual1", host: "192.168.1.200", protocol: "http", port: 2375 }
    ];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toHaveLength(3);
    expect(merged.find(h => h.name === "ssh1")).toBeDefined();
    expect(merged.find(h => h.name === "ssh2")).toBeDefined();
    expect(merged.find(h => h.name === "manual1")).toBeDefined();
  });

  it("should give manual config precedence over SSH config", () => {
    const sshHosts: HostConfig[] = [
      { name: "shared", host: "192.168.1.100", protocol: "ssh", sshUser: "root" }
    ];

    const manualHosts: HostConfig[] = [
      { name: "shared", host: "192.168.1.200", protocol: "http", port: 2375 }
    ];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(manualHosts[0]);
    expect(merged[0].host).toBe("192.168.1.200");
    expect(merged[0].protocol).toBe("http");
  });

  it("should handle empty SSH hosts array", () => {
    const sshHosts: HostConfig[] = [];
    const manualHosts: HostConfig[] = [
      { name: "manual1", host: "192.168.1.200", protocol: "http", port: 2375 }
    ];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toEqual(manualHosts);
  });

  it("should handle empty manual hosts array", () => {
    const sshHosts: HostConfig[] = [
      { name: "ssh1", host: "192.168.1.100", protocol: "ssh", sshUser: "root" }
    ];
    const manualHosts: HostConfig[] = [];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toEqual(sshHosts);
  });

  it("should handle both arrays empty", () => {
    const sshHosts: HostConfig[] = [];
    const manualHosts: HostConfig[] = [];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toEqual([]);
  });

  it("should completely replace SSH config for same name, not merge properties", () => {
    const sshHosts: HostConfig[] = [
      {
        name: "shared",
        host: "192.168.1.100",
        protocol: "ssh",
        sshUser: "root",
        tags: ["production"]
      }
    ];

    const manualHosts: HostConfig[] = [
      {
        name: "shared",
        host: "192.168.1.200",
        protocol: "http",
        port: 2375
      }
    ];

    const merged = mergeHostConfigs(sshHosts, manualHosts);

    expect(merged).toHaveLength(1);
    expect(merged[0].tags).toBeUndefined(); // Should not merge tags from SSH config
    expect(merged[0].sshUser).toBeUndefined(); // Should not have SSH user from old config
  });
});
