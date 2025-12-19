import { describe, it, expect } from "vitest";
import { sanitizeForShell, validateHostForSsh } from "./ssh.js";
import { HostConfig } from "../types.js";

describe("sanitizeForShell", () => {
  it("should allow alphanumeric characters", () => {
    expect(sanitizeForShell("abc123")).toBe("abc123");
  });

  it("should allow dots, hyphens, underscores", () => {
    expect(sanitizeForShell("my-host.local_name")).toBe("my-host.local_name");
  });

  it("should allow forward slashes for paths", () => {
    expect(sanitizeForShell("/path/to/file")).toBe("/path/to/file");
  });

  it("should throw on shell metacharacters", () => {
    expect(() => sanitizeForShell("test;rm -rf")).toThrow("Invalid characters");
    expect(() => sanitizeForShell("test|cat")).toThrow("Invalid characters");
    expect(() => sanitizeForShell("test&bg")).toThrow("Invalid characters");
    expect(() => sanitizeForShell("$(command)")).toThrow("Invalid characters");
    expect(() => sanitizeForShell("`command`")).toThrow("Invalid characters");
  });

  it("should throw on spaces", () => {
    expect(() => sanitizeForShell("has spaces")).toThrow("Invalid characters");
  });

  it("should throw on quotes", () => {
    expect(() => sanitizeForShell("has'quote")).toThrow("Invalid characters");
    expect(() => sanitizeForShell('has"quote')).toThrow("Invalid characters");
  });
});

describe("validateHostForSsh", () => {
  const baseHost: HostConfig = {
    name: "test",
    host: "192.168.1.100",
    protocol: "http"
  };

  it("should accept valid hostname", () => {
    expect(() => validateHostForSsh({ ...baseHost, host: "my-host.local" })).not.toThrow();
  });

  it("should accept valid IPv4 address", () => {
    expect(() => validateHostForSsh({ ...baseHost, host: "192.168.1.100" })).not.toThrow();
  });

  it("should accept valid IPv6 address", () => {
    expect(() => validateHostForSsh({ ...baseHost, host: "[::1]" })).not.toThrow();
    expect(() => validateHostForSsh({ ...baseHost, host: "fe80::1" })).not.toThrow();
  });

  it("should reject invalid host format", () => {
    expect(() => validateHostForSsh({ ...baseHost, host: "test;rm -rf" })).toThrow("Invalid host");
  });

  it("should accept valid SSH user", () => {
    expect(() => validateHostForSsh({ ...baseHost, sshUser: "root" })).not.toThrow();
    expect(() => validateHostForSsh({ ...baseHost, sshUser: "admin_user" })).not.toThrow();
    expect(() => validateHostForSsh({ ...baseHost, sshUser: "user-name" })).not.toThrow();
  });

  it("should reject invalid SSH user", () => {
    expect(() => validateHostForSsh({ ...baseHost, sshUser: "user;hack" })).toThrow("Invalid SSH user");
    expect(() => validateHostForSsh({ ...baseHost, sshUser: "user name" })).toThrow("Invalid SSH user");
  });

  it("should accept valid SSH key path", () => {
    expect(() =>
      validateHostForSsh({ ...baseHost, sshKeyPath: "/home/user/.ssh/id_rsa" })
    ).not.toThrow();
    expect(() =>
      validateHostForSsh({ ...baseHost, sshKeyPath: "~/.ssh/id_ed25519" })
    ).not.toThrow();
  });

  it("should reject invalid SSH key path", () => {
    expect(() =>
      validateHostForSsh({ ...baseHost, sshKeyPath: "/path/with spaces/key" })
    ).toThrow("Invalid SSH key path");
    expect(() => validateHostForSsh({ ...baseHost, sshKeyPath: "key;rm" })).toThrow(
      "Invalid SSH key path"
    );
  });
});
