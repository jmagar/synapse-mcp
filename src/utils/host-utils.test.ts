import { describe, it, expect } from "vitest";
import { isLocalHost } from "./host-utils.js";
import type { HostConfig } from "../types.js";

describe("isLocalHost", () => {
  describe("local host detection", () => {
    it("detects localhost hostname", () => {
      const host: HostConfig = {
        name: "local",
        host: "localhost",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("detects 127.0.0.1 IPv4", () => {
      const host: HostConfig = {
        name: "local",
        host: "127.0.0.1",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("detects ::1 IPv6 loopback", () => {
      const host: HostConfig = {
        name: "local",
        host: "::1",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("detects 0.0.0.0 (all interfaces)", () => {
      const host: HostConfig = {
        name: "local",
        host: "0.0.0.0",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("detects Unix socket path without SSH user", () => {
      const host: HostConfig = {
        name: "local",
        host: "localhost",
        protocol: "ssh",
        dockerSocketPath: "/var/run/docker.sock"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("detects protocol 'ssh' with localhost and no SSH user", () => {
      const host: HostConfig = {
        name: "local",
        host: "localhost",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });
  });

  describe("remote host detection", () => {
    it("detects remote IP as not local", () => {
      const host: HostConfig = {
        name: "remote",
        host: "192.168.1.100",
        protocol: "ssh",
        sshUser: "admin"
      };
      expect(isLocalHost(host)).toBe(false);
    });

    it("detects remote hostname as not local", () => {
      const host: HostConfig = {
        name: "remote",
        host: "server.example.com",
        protocol: "ssh",
        sshUser: "admin"
      };
      expect(isLocalHost(host)).toBe(false);
    });

    it("detects localhost with SSH user as remote (requires SSH)", () => {
      const host: HostConfig = {
        name: "remote",
        host: "localhost",
        protocol: "ssh",
        sshUser: "admin"
      };
      expect(isLocalHost(host)).toBe(false);
    });

    it("detects 127.0.0.1 with SSH user as remote (requires SSH)", () => {
      const host: HostConfig = {
        name: "remote",
        host: "127.0.0.1",
        protocol: "ssh",
        sshUser: "admin"
      };
      expect(isLocalHost(host)).toBe(false);
    });

    it("detects http/https protocol as not local (Docker API only)", () => {
      const host: HostConfig = {
        name: "remote",
        host: "localhost",
        protocol: "http"
      };
      expect(isLocalHost(host)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles uppercase localhost", () => {
      const host: HostConfig = {
        name: "local",
        host: "LOCALHOST",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("handles localhost with port", () => {
      const host: HostConfig = {
        name: "local",
        host: "localhost",
        port: 2375,
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("handles 127.0.0.2 (also loopback range)", () => {
      const host: HostConfig = {
        name: "local",
        host: "127.0.0.2",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });

    it("handles 127.255.255.255 (end of loopback range)", () => {
      const host: HostConfig = {
        name: "local",
        host: "127.255.255.255",
        protocol: "ssh"
      };
      expect(isLocalHost(host)).toBe(true);
    });
  });
});
