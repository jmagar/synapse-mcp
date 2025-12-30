import { describe, it, expect } from "vitest";
import {
  validateSecurePath,
  validateHostFormat,
  HostSecurityError,
  escapeShellArg,
  isSystemPath
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
