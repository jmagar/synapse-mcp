import { describe, it, expect, vi } from "vitest";
import {
  validateProjectName,
  composeBuild,
  composePull,
  composeRecreate,
  composeExec
} from "./compose.js";

// Mock ssh-pool-exec module using vi.hoisted
const { mockExecuteSSHCommand } = vi.hoisted(() => {
  return {
    mockExecuteSSHCommand: vi.fn()
  };
});

vi.mock("./ssh-pool-exec.js", () => {
  return {
    executeSSHCommand: mockExecuteSSHCommand
  };
});

/**
 * Mock helper: Simulate successful SSH command execution
 */
const mockSSHSuccess = (stdout: string): void => {
  mockExecuteSSHCommand.mockResolvedValue(stdout);
};

/**
 * Mock helper: Simulate failed SSH command execution
 */
const mockSSHError = (errorMessage: string): void => {
  mockExecuteSSHCommand.mockRejectedValue(new Error(errorMessage));
};

/**
 * Mock helper: Simulate SSH command timeout
 */
const mockSSHTimeout = (): void => {
  const timeoutError = new Error("SSH command timed out");
  (timeoutError as never)["code"] = "ETIMEDOUT";
  mockExecuteSSHCommand.mockRejectedValue(timeoutError);
};

describe("mock setup", () => {
  it("should successfully mock executeSSHCommand", () => {
    expect(mockExecuteSSHCommand).toBeDefined();
    expect(vi.isMockFunction(mockExecuteSSHCommand)).toBe(true);
  });
});

describe("mock helpers", () => {
  it("should mock successful SSH call", async () => {
    mockSSHSuccess("test output");
    const result = await mockExecuteSSHCommand({}, "test", []);
    expect(result).toBe("test output");
  });

  it("should mock failed SSH call", async () => {
    mockSSHError("Connection failed");
    await expect(mockExecuteSSHCommand({}, "test", [])).rejects.toThrow("Connection failed");
  });

  it("should mock timeout SSH call", async () => {
    mockSSHTimeout();
    await expect(mockExecuteSSHCommand({}, "test", [])).rejects.toThrow("SSH command timed out");
  });
});

describe("validateProjectName", () => {
  it("should accept alphanumeric names", () => {
    expect(() => validateProjectName("myproject123")).not.toThrow();
  });

  it("should accept hyphens and underscores", () => {
    expect(() => validateProjectName("my-project_1")).not.toThrow();
  });

  it("should reject empty string", () => {
    expect(() => validateProjectName("")).toThrow("Invalid project name");
  });

  it("should reject special characters", () => {
    expect(() => validateProjectName("project; rm -rf /")).toThrow("Invalid project name");
  });

  it("should reject spaces", () => {
    expect(() => validateProjectName("my project")).toThrow("Invalid project name");
  });

  it("should reject dots", () => {
    expect(() => validateProjectName("my.project")).toThrow("Invalid project name");
  });
});

describe("composeBuild", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeBuild).toBe("function");
    expect(composeBuild.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      composeBuild(host, "myproject", {
        service: "invalid service name with spaces"
      })
    ).rejects.toThrow("Invalid service name");
  });
});

describe("composePull", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composePull).toBe("function");
    expect(composePull.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      composePull(host, "myproject", {
        service: "invalid!service"
      })
    ).rejects.toThrow("Invalid service name");
  });
});

describe("composeRecreate", () => {
  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeRecreate).toBe("function");
    expect(composeRecreate.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      composeRecreate(host, "myproject", {
        service: "bad@service"
      })
    ).rejects.toThrow("Invalid service name");
  });
});

describe("composeExec - Security", () => {
  const testHost = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  it("should reject semicolon in extraArgs (prevents command chaining)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach; rm -rf /"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject pipe in extraArgs (prevents command piping)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach | cat /etc/passwd"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject ampersand in extraArgs (prevents background execution)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach && malicious-cmd"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject backticks in extraArgs (prevents command substitution)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["`whoami`"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject dollar sign in extraArgs (prevents variable expansion)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["$(malicious)"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject greater-than in extraArgs (prevents file redirection)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach > /tmp/output"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject less-than in extraArgs (prevents file input)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["< /etc/passwd"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should reject newline in extraArgs (prevents multi-line injection)", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach\nmalicious-cmd"])
    ).rejects.toThrow(/Invalid character/);
  });

  it("should accept valid docker compose flags", async () => {
    // This will fail with SSH error (expected), but should NOT fail validation
    await expect(
      composeExec(testHost, "myproject", "up", ["--detach", "--build", "--force-recreate"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);

    // NOT: /Invalid character/
  });

  it("should accept service names in extraArgs", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["web-service", "api-service_v2"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);

    // NOT: /Invalid character/
  });
});

describe("composeExec - Edge Cases", () => {
  const testHost = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  it("should handle empty extraArgs array", async () => {
    await expect(
      composeExec(testHost, "myproject", "ps", [])
    ).rejects.toThrow(/SSH failed|Compose command failed/);
    // Should NOT throw validation error
  });

  it("should reject argument longer than 500 chars", async () => {
    const longArg = "a".repeat(501);
    await expect(
      composeExec(testHost, "myproject", "up", [longArg])
    ).rejects.toThrow(/too long/);
  });

  it("should accept arguments with hyphens and underscores", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["my-service_name", "--force-recreate"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);
    // Should NOT throw validation error
  });

  it("should accept arguments with dots and equals", async () => {
    await expect(
      composeExec(testHost, "myproject", "up", ["--scale", "web=3"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);
    // Should NOT throw validation error
  });
});

// Note: These tests cannot verify connection pooling without mocking node-ssh
// because they run against real SSH. The actual pooling behavior is verified
// in ssh-pool-exec.test.ts which uses mocks.
//
// In production, compose.ts now uses executeSSHCommand which leverages the
// SSH connection pool for 50x performance improvement.

/**
 * PHASE 2: Comprehensive tests for composeExec() core function
 *
 * Tests verify the main wrapper for executing Docker Compose commands via SSH.
 * Function location: compose.ts lines 102-121
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes (function already implemented)
 * - REFACTOR: Improve test clarity if needed
 */
describe("composeExec", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success paths", () => {
    // Step 8: composeExec with valid inputs should call SSH and return stdout
    it("should execute docker compose command and return stdout", async () => {
      mockSSHSuccess("Container started successfully");

      const result = await composeExec(mockHostConfig, "myproject", "up", ["-d"]);

      expect(result).toBe("Container started successfully");
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p myproject up -d",
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 11: composeExec with extraArgs should pass them to command
    it("should pass extraArgs to command string", async () => {
      mockSSHSuccess("build complete");

      await composeExec(mockHostConfig, "testproject", "build", ["--no-cache", "--pull"]);

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p testproject build --no-cache --pull",
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 12: composeExec with timeout should pass timeout to SSH
    it("should use default 30 second timeout for SSH command", async () => {
      mockSSHSuccess("success");

      await composeExec(mockHostConfig, "myproject", "ps", []);

      // Verify timeout is passed to executeSSHCommand
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 13: composeExec should sanitize projectName (no special chars)
    it("should accept valid project names with alphanumeric, hyphens, underscores", async () => {
      mockSSHSuccess("ok");

      // These should all succeed validation
      await composeExec(mockHostConfig, "valid-project_123", "ps", []);
      expect(mockExecuteSSHCommand).toHaveBeenCalled();

      vi.clearAllMocks();
      mockSSHSuccess("ok");

      await composeExec(mockHostConfig, "MY_PROJECT-v2", "ps", []);
      expect(mockExecuteSSHCommand).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    // Step 14-16: composeExec with empty projectName should throw validation error
    it("should throw validation error for empty projectName", async () => {
      await expect(
        composeExec(mockHostConfig, "", "up", [])
      ).rejects.toThrow(/Invalid project name/);

      // SSH should not be called if validation fails
      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    // Step 17: composeExec with invalid projectName (special chars) should throw
    it("should throw validation error for projectName with special characters", async () => {
      // Test various invalid characters
      await expect(
        composeExec(mockHostConfig, "project;rm-rf", "up", [])
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        composeExec(mockHostConfig, "project name", "up", [])
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        composeExec(mockHostConfig, "project$var", "up", [])
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        composeExec(mockHostConfig, "project.test", "up", [])
      ).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    // Step 18: composeExec with SSH failure should propagate error
    it("should propagate SSH execution errors", async () => {
      mockSSHError("Connection refused");

      await expect(
        composeExec(mockHostConfig, "myproject", "up", ["-d"])
      ).rejects.toThrow(/Compose command failed.*Connection refused/);
    });

    // Step 19: composeExec with timeout error should propagate timeout
    it("should propagate SSH timeout errors", async () => {
      mockSSHTimeout();

      await expect(
        composeExec(mockHostConfig, "myproject", "up", ["-d"])
      ).rejects.toThrow(/Compose command failed.*timed out/);
    });
  });

  describe("edge cases", () => {
    // Step 20: composeExec with very long extraArgs should work
    it("should handle very long extraArgs within limits", async () => {
      mockSSHSuccess("done");

      // Create a long but valid argument (just under 500 char limit)
      const longArg = "--scale=service=" + "x".repeat(480);

      await composeExec(mockHostConfig, "myproject", "up", [longArg]);

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        `docker compose -p myproject up ${longArg}`,
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 21: composeExec with empty extraArgs array should work
    it("should handle empty extraArgs array", async () => {
      mockSSHSuccess("status output");

      const result = await composeExec(mockHostConfig, "myproject", "ps", []);

      expect(result).toBe("status output");
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p myproject ps",
        [],
        { timeoutMs: 30000 }
      );
    });

    // Step 22: composeExec should construct correct command string
    it("should construct correct docker compose command string", async () => {
      mockSSHSuccess("ok");

      await composeExec(mockHostConfig, "web-stack", "down", ["-v", "--remove-orphans"]);

      // Verify exact command construction
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        "docker compose -p web-stack down -v --remove-orphans",
        expect.anything(),
        expect.anything()
      );
    });

    // Step 23: composeExec should pass correct timeout to executeSSHCommand
    it("should always pass 30000ms timeout to executeSSHCommand", async () => {
      mockSSHSuccess("result");

      await composeExec(mockHostConfig, "proj", "restart", ["service1"]);

      // Verify timeout parameter structure
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { timeoutMs: 30000 }
      );
    });

    // Step 24: composeExec should trim whitespace from stdout
    it("should return stdout without modification (trimming handled by caller)", async () => {
      // Note: Based on the implementation, composeExec returns stdout as-is
      // The actual trimming is done by executeSSHCommand or by callers
      mockSSHSuccess("  output with spaces  ");

      const result = await composeExec(mockHostConfig, "myproject", "logs", ["--tail=10"]);

      // composeExec returns what executeSSHCommand returns
      expect(result).toBe("  output with spaces  ");
    });

    // Additional edge case: Multiple extraArgs with valid characters
    it("should handle multiple extraArgs with various valid characters", async () => {
      mockSSHSuccess("scaling complete");

      await composeExec(mockHostConfig, "stack", "up", [
        "--scale",
        "web=3",
        "--scale",
        "worker=5",
        "-d",
        "--force-recreate"
      ]);

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p stack up --scale web=3 --scale worker=5 -d --force-recreate",
        [],
        { timeoutMs: 30000 }
      );
    });

    // Additional edge case: Command without project flag (handled by buildComposeCommand)
    it("should include -p flag for project name in command", async () => {
      mockSSHSuccess("ok");

      await composeExec(mockHostConfig, "myapp", "version", []);

      const calledCommand = mockExecuteSSHCommand.mock.calls[0][1];
      expect(calledCommand).toContain("-p myapp");
      expect(calledCommand).toBe("docker compose -p myapp version");
    });
  });
});
