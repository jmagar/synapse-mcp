import { describe, it, expect } from "vitest";
import { validateSecurePath } from "./path-security.js";

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
      expect(() => validateSecurePath(".", "context")).toThrow(
        /absolute path required/i
      );
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
      expect(() => validateSecurePath("/very/deep/nested/directory/structure/build", "context")).not.toThrow();
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
      expect(() => validateSecurePath("/path;rm -rf /", "context")).toThrow(
        /invalid characters/i
      );
    });

    it("should reject paths with backticks", () => {
      expect(() => validateSecurePath("/path/`whoami`", "context")).toThrow(
        /invalid characters/i
      );
    });
  });

  describe("error messages", () => {
    it("should include parameter name in error message", () => {
      expect(() => validateSecurePath("../etc/passwd", "buildContext")).toThrow(
        /buildContext/
      );
    });

    it("should include parameter name for character errors", () => {
      expect(() => validateSecurePath("/path with spaces", "dockerfile")).toThrow(
        /dockerfile/
      );
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
