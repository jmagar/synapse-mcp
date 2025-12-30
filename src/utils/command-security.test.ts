import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseCommandParts,
  validateCommandAllowlist,
  buildSafeShellCommand
} from "./command-security.js";

describe("parseCommandParts", () => {
  describe("basic parsing", () => {
    it("parses simple command: ls", () => {
      expect(parseCommandParts("ls")).toEqual(["ls"]);
    });

    it("parses command with arguments: ls -la /tmp", () => {
      expect(parseCommandParts("ls -la /tmp")).toEqual(["ls", "-la", "/tmp"]);
    });

    it("handles multiple spaces between arguments", () => {
      expect(parseCommandParts("ls   -la    /tmp")).toEqual(["ls", "-la", "/tmp"]);
    });

    it("handles leading and trailing whitespace", () => {
      expect(parseCommandParts("  ls -la  ")).toEqual(["ls", "-la"]);
    });

    it("handles tabs as separators", () => {
      expect(parseCommandParts("ls\t-la\t/tmp")).toEqual(["ls", "-la", "/tmp"]);
    });
  });

  describe("quoted argument limitations", () => {
    // NOTE: parseCommandParts does not handle shell-quoted arguments.
    // These tests document the expected (limited) behavior.
    it("splits quoted strings on whitespace (documented limitation)", () => {
      // This is intentional - parseCommandParts does NOT support quoted args
      expect(parseCommandParts('grep "hello world" file.txt')).toEqual([
        "grep",
        '"hello',
        'world"',
        "file.txt"
      ]);
    });

    it("splits single-quoted strings on whitespace (documented limitation)", () => {
      expect(parseCommandParts("grep 'hello world' file.txt")).toEqual([
        "grep",
        "'hello",
        "world'",
        "file.txt"
      ]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", () => {
      expect(parseCommandParts("")).toEqual([]);
    });

    it("returns empty array for whitespace only", () => {
      expect(parseCommandParts("   ")).toEqual([]);
    });
  });
});

describe("validateCommandAllowlist", () => {
  describe("valid commands", () => {
    it("allows 'ls' (in allowlist)", () => {
      expect(validateCommandAllowlist("ls")).toEqual(["ls"]);
    });

    it("allows 'grep pattern file' (in allowlist)", () => {
      expect(validateCommandAllowlist("grep pattern file")).toEqual(["grep", "pattern", "file"]);
    });

    it("allows all commands in the allowlist", () => {
      const allowedCommands = ["cat", "head", "tail", "grep", "find", "ls", "tree", "wc"];
      for (const cmd of allowedCommands) {
        expect(() => validateCommandAllowlist(cmd)).not.toThrow();
      }
    });
  });

  describe("blocked commands", () => {
    it("throws for 'rm' (not in allowlist)", () => {
      expect(() => validateCommandAllowlist("rm -rf /")).toThrow(/not in allowed list/);
    });

    it("throws for 'curl' (not in allowlist)", () => {
      expect(() => validateCommandAllowlist("curl http://evil.com")).toThrow(/not in allowed list/);
    });

    it("throws for 'wget' (not in allowlist)", () => {
      expect(() => validateCommandAllowlist("wget http://evil.com")).toThrow(/not in allowed list/);
    });

    it("error message includes the blocked command name", () => {
      try {
        validateCommandAllowlist("evil_command");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("evil_command");
      }
    });

    it("error message lists allowed commands", () => {
      try {
        validateCommandAllowlist("rm");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Allowed:");
        expect((error as Error).message).toContain("ls");
      }
    });
  });

  describe("empty command", () => {
    it("throws for empty string", () => {
      expect(() => validateCommandAllowlist("")).toThrow(/cannot be empty/);
    });

    it("throws for whitespace only", () => {
      expect(() => validateCommandAllowlist("   ")).toThrow(/cannot be empty/);
    });
  });

  describe("ENV_ALLOW_ANY_COMMAND override", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("allows any command when SYNAPSE_ALLOW_ANY_COMMAND=true", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      expect(() => validateCommandAllowlist("rm -rf /")).not.toThrow();
    });

    it("still validates normally when SYNAPSE_ALLOW_ANY_COMMAND is not set", () => {
      delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      expect(() => validateCommandAllowlist("rm")).toThrow(/not in allowed list/);
    });

    it("still validates normally when SYNAPSE_ALLOW_ANY_COMMAND=false", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "false";
      expect(() => validateCommandAllowlist("rm")).toThrow(/not in allowed list/);
    });
  });
});

describe("buildSafeShellCommand", () => {
  describe("command without arguments", () => {
    it("returns just the command for 'ls'", () => {
      expect(buildSafeShellCommand("ls")).toBe("ls");
    });

    it("returns just the command for 'pwd'", () => {
      expect(buildSafeShellCommand("pwd")).toBe("pwd");
    });
  });

  describe("command with arguments", () => {
    it("escapes arguments with single quotes", () => {
      const result = buildSafeShellCommand("grep pattern file.txt");
      expect(result).toBe("grep 'pattern' 'file.txt'");
    });

    it("escapes paths with spaces in arguments", () => {
      const result = buildSafeShellCommand("cat /path/with spaces/file.txt");
      expect(result).toBe("cat '/path/with' 'spaces/file.txt'");
    });

    it("escapes shell metacharacters in arguments", () => {
      const result = buildSafeShellCommand("grep $HOME file.txt");
      expect(result).toBe("grep '$HOME' 'file.txt'");
    });
  });

  describe("base command validation (P1 fix)", () => {
    it("allows alphanumeric command names", () => {
      expect(() => buildSafeShellCommand("ls")).not.toThrow();
      expect(() => buildSafeShellCommand("cat")).not.toThrow();
      expect(() => buildSafeShellCommand("grep")).not.toThrow();
    });

    it("allows command names with underscores", () => {
      // Would need to be in allowlist or ENV_ALLOW_ANY_COMMAND=true to actually work
      // This test verifies the character pattern accepts underscores
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("my_command")).not.toThrow();
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("allows command names with hyphens", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("my-command")).not.toThrow();
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("allows full paths like /usr/bin/grep", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("/usr/bin/grep pattern")).not.toThrow();
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with semicolon", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("ls;rm")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with pipe", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("ls|cat")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with dollar sign", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("$HOME/bin/evil")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with backtick", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("`whoami`")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with subshell syntax", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("$(id)")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("parses 'my command' as command='my' with arg='command' (spaces are separators)", () => {
      // Note: parseCommandParts splits on whitespace, so "my command" becomes ["my", "command"]
      // The base command "my" is valid (alphanumeric only)
      // This is expected behavior - spaces are never part of the base command name
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        const result = buildSafeShellCommand("my command");
        expect(result).toBe("my 'command'");
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with ampersand", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("cmd&bg")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("throws for command with parentheses", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        expect(() => buildSafeShellCommand("cmd(evil)")).toThrow(/unsafe characters/i);
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });

    it("error message indicates the issue is with the command name", () => {
      process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
      try {
        buildSafeShellCommand("evil;cmd");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("command");
        expect((error as Error).message).toContain("unsafe");
      } finally {
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
      }
    });
  });

  describe("blocked commands", () => {
    it("throws for commands not in allowlist", () => {
      expect(() => buildSafeShellCommand("rm -rf /")).toThrow(/not in allowed list/);
    });
  });
});
