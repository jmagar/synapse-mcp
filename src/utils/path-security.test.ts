import { describe, it, expect } from "vitest";
import {
  validateSecurePath,
  validateHostFormat,
  HostSecurityError,
  escapeShellArg,
  isSystemPath,
  validateSSHArg,
  SSHArgSecurityError
} from "./path-security.js";

describe("validateSecurePath", () => {
  describe("directory traversal attacks", () => {
    it("should reject basic .. traversal", () => {
      expect(() => validateSecurePath("../../../etc/passwd", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject .. at start of path", () => {
      expect(() => validateSecurePath("../sibling", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject .. in middle of path", () => {
      expect(() => validateSecurePath("/valid/../etc/passwd", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject .. at end of path", () => {
      expect(() => validateSecurePath("/some/path/..", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject multiple .. sequences", () => {
      expect(() => validateSecurePath("/path/../../other/../etc", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject hidden traversal with /./../", () => {
      expect(() => validateSecurePath("/valid/./path/../../etc", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });
  });

  describe("relative path rejection", () => {
    it("should reject path starting with ./", () => {
      expect(() => validateSecurePath("./relative/path", "context")).toThrow(
        /absolute path required/i
      );
    });

    it("should reject path without leading /", () => {
      expect(() => validateSecurePath("relative/path", "context")).toThrow(
        /absolute path required/i
      );
    });

    it("should reject single dot path", () => {
      expect(() => validateSecurePath(".", "context")).toThrow(/absolute path required/i);
    });
  });

  describe("valid absolute paths", () => {
    it("should accept simple absolute path", () => {
      expect(() => validateSecurePath("/home/user/build", "context")).not.toThrow();
    });

    it("should accept absolute path with hyphens", () => {
      expect(() => validateSecurePath("/opt/my-app/build-context", "context")).not.toThrow();
    });

    it("should accept absolute path with underscores", () => {
      expect(() => validateSecurePath("/var/docker_builds/app_v2", "context")).not.toThrow();
    });

    it("should accept absolute path with dots in filename", () => {
      expect(() => validateSecurePath("/app/Dockerfile.prod", "dockerfile")).not.toThrow();
    });

    it("should accept deep nested path", () => {
      expect(() =>
        validateSecurePath("/very/deep/nested/directory/structure/build", "context")
      ).not.toThrow();
    });

    it("should accept single character directories", () => {
      expect(() => validateSecurePath("/a/b/c", "context")).not.toThrow();
    });
  });

  describe("character validation", () => {
    it("should reject paths with spaces", () => {
      expect(() => validateSecurePath("/path with spaces", "context")).toThrow(
        /invalid characters/i
      );
    });

    it("should reject paths with special characters", () => {
      expect(() => validateSecurePath("/path/with$pecial", "context")).toThrow(
        /invalid characters/i
      );
    });

    it("should reject paths with semicolons", () => {
      expect(() => validateSecurePath("/path;rm -rf /", "context")).toThrow(/invalid characters/i);
    });

    it("should reject paths with backticks", () => {
      expect(() => validateSecurePath("/path/`whoami`", "context")).toThrow(/invalid characters/i);
    });
  });

  describe("error messages", () => {
    it("should include parameter name in error message", () => {
      expect(() => validateSecurePath("../etc/passwd", "buildContext")).toThrow(/buildContext/);
    });

    it("should include parameter name for character errors", () => {
      expect(() => validateSecurePath("/path with spaces", "dockerfile")).toThrow(/dockerfile/);
    });
  });

  describe("edge cases", () => {
    it("should reject empty path", () => {
      expect(() => validateSecurePath("", "context")).toThrow();
    });

    it("should accept root path", () => {
      expect(() => validateSecurePath("/", "context")).not.toThrow();
    });

    it("should accept path with multiple dots in filename", () => {
      expect(() => validateSecurePath("/path/to/file.tar.gz", "context")).not.toThrow();
    });

    it("should reject path ending with /.", () => {
      expect(() => validateSecurePath("/path/to/.", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });

    it("should reject path with /./ in middle", () => {
      expect(() => validateSecurePath("/path/./to/file", "context")).toThrow(
        /directory traversal.*not allowed/i
      );
    });
  });

  describe("user-friendly error messages", () => {
    it("should provide clear error for common mistake (relative path)", () => {
      try {
        validateSecurePath("./config", "buildContext");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("buildContext");
        expect((error as Error).message).toContain("absolute path required");
      }
    });

    it("should provide clear error for traversal attempt", () => {
      try {
        validateSecurePath("/app/../etc", "dockerfile");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("dockerfile");
        expect((error as Error).message).toContain("directory traversal");
        expect((error as Error).message).toContain("..");
      }
    });
  });
});

describe("validateHostFormat", () => {
  // Valid hostnames
  it("allows simple hostname: myserver", () => {
    expect(() => validateHostFormat("myserver")).not.toThrow();
  });

  it("allows FQDN: server.example.com", () => {
    expect(() => validateHostFormat("server.example.com")).not.toThrow();
  });

  it("allows IP address: 192.168.1.100", () => {
    expect(() => validateHostFormat("192.168.1.100")).not.toThrow();
  });

  it("allows hostname with dash: my-server", () => {
    expect(() => validateHostFormat("my-server")).not.toThrow();
  });

  it("allows hostname with underscore: my_server", () => {
    expect(() => validateHostFormat("my_server")).not.toThrow();
  });

  // Command injection attacks
  it("throws on semicolon: host;rm -rf /", () => {
    expect(() => validateHostFormat("host;rm -rf /")).toThrow(HostSecurityError);
  });

  it("throws on pipe: host|cat /etc/passwd", () => {
    expect(() => validateHostFormat("host|cat")).toThrow(HostSecurityError);
  });

  it("throws on dollar: host$(whoami)", () => {
    expect(() => validateHostFormat("host$(whoami)")).toThrow(HostSecurityError);
  });

  it("throws on backtick: host`id`", () => {
    expect(() => validateHostFormat("host`id`")).toThrow(HostSecurityError);
  });

  it("throws on ampersand: host&rm", () => {
    expect(() => validateHostFormat("host&rm")).toThrow(HostSecurityError);
  });

  it("throws on angle brackets: host<script>", () => {
    expect(() => validateHostFormat("host<script>")).toThrow(HostSecurityError);
  });

  it("throws on empty string", () => {
    expect(() => validateHostFormat("")).toThrow(HostSecurityError);
  });
});

describe("escapeShellArg", () => {
  it("returns simple strings in single quotes: filename.txt", () => {
    expect(escapeShellArg("filename.txt")).toBe("'filename.txt'");
  });

  it("quotes paths with spaces", () => {
    expect(escapeShellArg("/path/with spaces/file.txt")).toBe("'/path/with spaces/file.txt'");
  });

  it("escapes single quotes by ending quote, adding escaped quote, starting new quote", () => {
    expect(escapeShellArg("file'name.txt")).toBe("'file'\\''name.txt'");
  });

  it("handles paths with special shell chars safely", () => {
    const result = escapeShellArg("$HOME/file.txt");
    expect(result).toBe("'$HOME/file.txt'");
  });

  it("handles backticks safely", () => {
    const result = escapeShellArg("`whoami`.txt");
    expect(result).toBe("'`whoami`.txt'");
  });

  it("handles subshell safely", () => {
    const result = escapeShellArg("$(id).txt");
    expect(result).toBe("'$(id).txt'");
  });

  it("handles empty string", () => {
    expect(escapeShellArg("")).toBe("''");
  });
});

describe("isSystemPath", () => {
  it("returns true for /etc/*", () => {
    expect(isSystemPath("/etc/passwd")).toBe(true);
    expect(isSystemPath("/etc/shadow")).toBe(true);
  });

  it("returns true for /bin/*", () => {
    expect(isSystemPath("/bin/bash")).toBe(true);
  });

  it("returns true for /usr/bin/*", () => {
    expect(isSystemPath("/usr/bin/python")).toBe(true);
  });

  it("returns true for /sbin/*", () => {
    expect(isSystemPath("/sbin/init")).toBe(true);
  });

  it("returns false for /home/*", () => {
    expect(isSystemPath("/home/user/file.txt")).toBe(false);
  });

  it("returns false for /tmp/*", () => {
    expect(isSystemPath("/tmp/scratch.txt")).toBe(false);
  });

  it("returns false for /var/log/*", () => {
    expect(isSystemPath("/var/log/syslog")).toBe(false);
  });
});

describe("validateSSHArg", () => {
  describe("valid SSH arguments", () => {
    it("allows simple alphanumeric value: running", () => {
      expect(() => validateSSHArg("running", "state")).not.toThrow();
    });

    it("allows value with hyphen: list-units", () => {
      expect(() => validateSSHArg("list-units", "command")).not.toThrow();
    });

    it("allows value with underscore: my_service", () => {
      expect(() => validateSSHArg("my_service", "service")).not.toThrow();
    });

    it("allows value with dot: nginx.service", () => {
      expect(() => validateSSHArg("nginx.service", "service")).not.toThrow();
    });

    it("allows value with equals: --state=running", () => {
      expect(() => validateSSHArg("--state=running", "arg")).not.toThrow();
    });

    it("allows spaces in arguments", () => {
      expect(() => validateSSHArg("some value", "arg")).not.toThrow();
    });
  });

  describe("command injection attacks", () => {
    it("throws on semicolon: running; rm -rf /", () => {
      expect(() => validateSSHArg("running; rm -rf /", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on pipe: running | cat /etc/passwd", () => {
      expect(() => validateSSHArg("running | cat /etc/passwd", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on ampersand: running & rm -rf /", () => {
      expect(() => validateSSHArg("running & rm -rf /", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on backtick: running`id`", () => {
      expect(() => validateSSHArg("running`id`", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on dollar subshell: running$(whoami)", () => {
      expect(() => validateSSHArg("running$(whoami)", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on parentheses: (rm -rf /)", () => {
      expect(() => validateSSHArg("(rm -rf /)", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on angle brackets: <script>", () => {
      expect(() => validateSSHArg("<script>", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on curly braces: {cmd}", () => {
      expect(() => validateSSHArg("{cmd}", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on backslash: running\\ncmd", () => {
      expect(() => validateSSHArg("running\\ncmd", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on double quotes: running\"cmd", () => {
      expect(() => validateSSHArg('running"cmd', "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on newline character", () => {
      expect(() => validateSSHArg("running\nrm -rf /", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on tab character", () => {
      expect(() => validateSSHArg("running\trm", "state")).toThrow(SSHArgSecurityError);
    });
  });

  describe("edge cases", () => {
    it("throws on empty string", () => {
      expect(() => validateSSHArg("", "state")).toThrow(SSHArgSecurityError);
    });

    it("throws on extremely long argument (DoS prevention)", () => {
      const longArg = "a".repeat(501);
      expect(() => validateSSHArg(longArg, "state")).toThrow(SSHArgSecurityError);
    });

    it("allows maximum length argument (500 chars)", () => {
      const maxArg = "a".repeat(500);
      expect(() => validateSSHArg(maxArg, "state")).not.toThrow();
    });
  });

  describe("error messages", () => {
    it("includes parameter name in error message", () => {
      try {
        validateSSHArg("running; rm", "state");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SSHArgSecurityError);
        expect((error as SSHArgSecurityError).message).toContain("state");
      }
    });

    it("sets paramName property on error", () => {
      try {
        validateSSHArg("running; rm", "myParam");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SSHArgSecurityError);
        expect((error as SSHArgSecurityError).paramName).toBe("myParam");
      }
    });
  });
});
