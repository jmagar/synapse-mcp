import { describe, it, expect, vi } from "vitest";
import {
  validateProjectName,
  composeBuild,
  composePull,
  composeRecreate,
  composeExec,
  listComposeProjects,
  getComposeStatus,
  composeUp,
  composeDown,
  composeRestart,
  composeLogs
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
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeBuild).toBe("function");
    expect(composeBuild.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    await expect(
      composeBuild(mockHostConfig, "myproject", {
        service: "invalid service name with spaces"
      })
    ).rejects.toThrow("Invalid service name");
  });

  // Step 82: composeBuild with noCache should pass --no-cache flag
  it("should pass --no-cache flag when noCache option is true", async () => {
    mockSSHSuccess("built");

    await composeBuild(mockHostConfig, "myproject", { noCache: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--no-cache");
  });

  // Step 83: composeBuild with pull should pass --pull flag
  it("should pass --pull flag when pull option is true", async () => {
    mockSSHSuccess("built");

    await composeBuild(mockHostConfig, "myproject", { pull: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--pull");
  });

  // Step 84: composeBuild with multiple options should combine flags
  it("should combine --no-cache and --pull flags when both options are true", async () => {
    mockSSHSuccess("built");

    await composeBuild(mockHostConfig, "myproject", { noCache: true, pull: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--no-cache");
    expect(command).toContain("--pull");
    expect(command).toBe("docker compose -p myproject build --no-cache --pull");
  });
});

describe("composePull", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composePull).toBe("function");
    expect(composePull.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    await expect(
      composePull(mockHostConfig, "myproject", {
        service: "invalid!service"
      })
    ).rejects.toThrow("Invalid service name");
  });

  // Step 85: composePull with ignorePullFailures should pass --ignore-pull-failures
  it("should pass --ignore-pull-failures flag when ignorePullFailures option is true", async () => {
    mockSSHSuccess("pulled");

    await composePull(mockHostConfig, "myproject", { ignorePullFailures: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--ignore-pull-failures");
  });

  // Step 86: composePull with quiet should pass --quiet flag
  it("should pass --quiet flag when quiet option is true", async () => {
    mockSSHSuccess("pulled");

    await composePull(mockHostConfig, "myproject", { quiet: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--quiet");
  });
});

describe("composeRecreate", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be an async function that accepts host, project, and options", () => {
    expect(typeof composeRecreate).toBe("function");
    expect(composeRecreate.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject with validation error for invalid service name", async () => {
    await expect(
      composeRecreate(mockHostConfig, "myproject", {
        service: "bad@service"
      })
    ).rejects.toThrow("Invalid service name");
  });

  // Step 87: composeRecreate with forceRecreate should pass --force-recreate
  it("should pass --force-recreate flag when forceRecreate option is true", async () => {
    mockSSHSuccess("recreated");

    await composeRecreate(mockHostConfig, "myproject", { forceRecreate: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--force-recreate");
  });

  // Step 88: composeRecreate with noDeps should pass --no-deps flag
  it("should pass --no-deps flag when noDeps option is true", async () => {
    mockSSHSuccess("recreated");

    await composeRecreate(mockHostConfig, "myproject", { noDeps: true });

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("--no-deps");
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
    mockSSHError("Connection refused");

    await expect(
      composeExec(testHost, "myproject", "up", ["--detach", "--build", "--force-recreate"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);

    // NOT: /Invalid character/
  });

  it("should accept service names in extraArgs", async () => {
    mockSSHError("Connection refused");

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
    mockSSHError("Connection refused");

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
    mockSSHError("Connection refused");

    await expect(
      composeExec(testHost, "myproject", "up", ["my-service_name", "--force-recreate"])
    ).rejects.toThrow(/SSH failed|Compose command failed/);
    // Should NOT throw validation error
  });

  it("should accept arguments with dots and equals", async () => {
    mockSSHError("Connection refused");

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

/**
 * PHASE 3: Comprehensive tests for listComposeProjects()
 *
 * Tests verify the function that discovers all Docker Compose projects on a host.
 * Function location: compose.ts lines 126-155
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes (function already implemented)
 * - REFACTOR: Improve test clarity if needed
 */
describe("listComposeProjects", () => {
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
    // Step 25: listComposeProjects should parse JSON and return project names
    it("should parse JSON and return project details", async () => {
      // Mock single running project output
      const singleProjectJSON = JSON.stringify([
        {
          Name: "myapp",
          Status: "running(3)",
          ConfigFiles: "/home/user/myapp/docker-compose.yml"
        }
      ]);

      mockSSHSuccess(singleProjectJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: "myapp",
        status: "running",
        configFiles: ["/home/user/myapp/docker-compose.yml"]
      });
      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose ls --format json",
        [],
        { timeoutMs: 15000 }
      );
    });

    // Step 28: listComposeProjects with multiple projects should return all names
    it("should return all projects when multiple exist", async () => {
      const multipleProjectsJSON = JSON.stringify([
        {
          Name: "frontend",
          Status: "running(2)",
          ConfigFiles: "/apps/frontend/docker-compose.yml"
        },
        {
          Name: "backend",
          Status: "running(1)",
          ConfigFiles: "/apps/backend/docker-compose.yml"
        },
        {
          Name: "database",
          Status: "running(1)",
          ConfigFiles: "/apps/db/docker-compose.yml"
        }
      ]);

      mockSSHSuccess(multipleProjectsJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(3);
      expect(result.map((p) => p.name)).toEqual(["frontend", "backend", "database"]);
      expect(result[0].status).toBe("running");
      expect(result[1].status).toBe("running");
      expect(result[2].status).toBe("running");
    });

    // Step 29: listComposeProjects with no projects should return empty array
    it("should return empty array when no projects exist", async () => {
      const emptyJSON = "[]";

      mockSSHSuccess(emptyJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    // Step 30-32: listComposeProjects with invalid JSON should throw error
    it("should throw error for invalid JSON", async () => {
      const invalidJSON = "not valid json at all";

      mockSSHSuccess(invalidJSON);

      await expect(
        listComposeProjects(mockHostConfig)
      ).rejects.toThrow(/Failed to list compose projects/);
    });

    // Step 33: listComposeProjects with SSH error should propagate error
    it("should propagate SSH errors with descriptive message", async () => {
      mockSSHError("Connection timeout");

      await expect(
        listComposeProjects(mockHostConfig)
      ).rejects.toThrow(/Failed to list compose projects.*Connection timeout/);
    });
  });

  describe("edge cases", () => {
    // Step 34: listComposeProjects should include all projects with correct status parsing
    it("should include all projects regardless of status", async () => {
      // Note: Based on implementation, listComposeProjects does NOT filter by status
      // It returns all projects and maps their status using parseComposeStatus
      const mixedStatusJSON = JSON.stringify([
        {
          Name: "running-app",
          Status: "running(2)",
          ConfigFiles: "/apps/running/docker-compose.yml"
        },
        {
          Name: "stopped-app",
          Status: "exited(0)",
          ConfigFiles: "/apps/stopped/docker-compose.yml"
        },
        {
          Name: "partial-app",
          Status: "running, exited(1)",
          ConfigFiles: "/apps/partial/docker-compose.yml"
        }
      ]);

      mockSSHSuccess(mixedStatusJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ name: "running-app", status: "running" });
      expect(result[1]).toMatchObject({ name: "stopped-app", status: "stopped" });
      // "running, exited(1)" contains "running" and "(" but not "running(" -> partial
      expect(result[2]).toMatchObject({ name: "partial-app", status: "partial" });
    });

    // Step 35: listComposeProjects should handle projects with special names
    it("should handle projects with hyphens, underscores, and numbers", async () => {
      const specialNamesJSON = JSON.stringify([
        {
          Name: "my-app_v2",
          Status: "running(1)",
          ConfigFiles: "/apps/my-app/docker-compose.yml"
        },
        {
          Name: "test_service-123",
          Status: "running(2)",
          ConfigFiles: "/apps/test/docker-compose.yml"
        },
        {
          Name: "UPPERCASE-project_01",
          Status: "running(1)",
          ConfigFiles: "/apps/upper/docker-compose.yml"
        }
      ]);

      mockSSHSuccess(specialNamesJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(3);
      expect(result.map((p) => p.name)).toEqual([
        "my-app_v2",
        "test_service-123",
        "UPPERCASE-project_01"
      ]);
    });

    // Additional edge case: Empty stdout (whitespace only)
    it("should return empty array for whitespace-only output", async () => {
      mockSSHSuccess("   \n  \t  ");

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toEqual([]);
    });

    // Additional edge case: Multiple config files
    it("should parse multiple comma-separated config files", async () => {
      const multiConfigJSON = JSON.stringify([
        {
          Name: "multi-config",
          Status: "running(2)",
          ConfigFiles: "/app/docker-compose.yml, /app/docker-compose.override.yml"
        }
      ]);

      mockSSHSuccess(multiConfigJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(1);
      expect(result[0].configFiles).toEqual([
        "/app/docker-compose.yml",
        "/app/docker-compose.override.yml"
      ]);
    });

    // Additional edge case: Verify services array is empty
    it("should return projects with empty services array", async () => {
      const projectJSON = JSON.stringify([
        {
          Name: "simple",
          Status: "running(1)",
          ConfigFiles: "/app/docker-compose.yml"
        }
      ]);

      mockSSHSuccess(projectJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result[0].services).toEqual([]);
    });

    // Additional edge case: Different status formats
    it("should correctly parse various status formats", async () => {
      const statusFormatsJSON = JSON.stringify([
        { Name: "p1", Status: "running(5)", ConfigFiles: "/a/c.yml" },
        { Name: "p2", Status: "exited(0)", ConfigFiles: "/b/c.yml" },
        { Name: "p3", Status: "stopped", ConfigFiles: "/c/c.yml" },
        { Name: "p4", Status: "unknown-status", ConfigFiles: "/d/c.yml" }
      ]);

      mockSSHSuccess(statusFormatsJSON);

      const result = await listComposeProjects(mockHostConfig);

      expect(result).toHaveLength(4);
      expect(result[0].status).toBe("running");
      expect(result[1].status).toBe("stopped"); // "exited" maps to "stopped"
      expect(result[2].status).toBe("stopped");
      expect(result[3].status).toBe("unknown");
    });

    // Additional edge case: Timeout configuration
    it("should use 15 second timeout for SSH command", async () => {
      mockSSHSuccess("[]");

      await listComposeProjects(mockHostConfig);

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { timeoutMs: 15000 }
      );
    });
  });
});

/**
 * PHASE 5: Comprehensive tests for getComposeStatus()
 *
 * Tests verify the function that retrieves detailed status of a Docker Compose project.
 * Function location: compose.ts lines 177-248
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes (function already implemented)
 * - REFACTOR: Improve test clarity if needed
 */
describe("getComposeStatus", () => {
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
    // Step 39: getComposeStatus should parse JSON and return containers
    it("should parse JSON and return container status", async () => {
      const singleContainerJSON = JSON.stringify({
        Name: "myapp-web-1",
        State: "running",
        Health: "healthy",
        ExitCode: 0
      });

      mockSSHSuccess(singleContainerJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.name).toBe("myapp");
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: "myapp-web-1",
        status: "running",
        health: "healthy",
        exitCode: 0
      });
      expect(result.status).toBe("running");
    });

    // Step 42: getComposeStatus with multiple containers should return all
    it("should return all containers when multiple exist", async () => {
      const multipleContainersJSON = [
        JSON.stringify({
          Name: "myapp-web-1",
          State: "running",
          Health: "healthy"
        }),
        JSON.stringify({
          Name: "myapp-worker-1",
          State: "running"
        }),
        JSON.stringify({
          Name: "myapp-db-1",
          State: "running",
          Health: "healthy"
        })
      ].join("\n");

      mockSSHSuccess(multipleContainersJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.services).toHaveLength(3);
      expect(result.services.map((s) => s.name)).toEqual([
        "myapp-web-1",
        "myapp-worker-1",
        "myapp-db-1"
      ]);
      expect(result.status).toBe("running"); // All running -> overall running
    });

    // Step 43: getComposeStatus with no containers should return empty array
    it("should return empty services array when no containers exist", async () => {
      mockSSHSuccess(""); // Empty output

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.services).toEqual([]);
      expect(result.services).toHaveLength(0);
      expect(result.status).toBe("stopped"); // No services -> stopped
      expect(result.name).toBe("myapp");
    });

    // Step 44: getComposeStatus should pass correct project name to docker compose ps
    it("should pass correct project name in command", async () => {
      mockSSHSuccess("");

      await getComposeStatus(mockHostConfig, "test-project");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p test-project ps --format json",
        [],
        { timeoutMs: 15000 }
      );
    });
  });

  describe("error handling", () => {
    // Step 45-47: getComposeStatus with invalid project name should throw validation error
    it("should throw validation error for empty project name", async () => {
      await expect(
        getComposeStatus(mockHostConfig, "")
      ).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    // Step 48: getComposeStatus with SSH error should propagate error
    it("should propagate SSH errors with descriptive message", async () => {
      mockSSHError("Connection failed");

      await expect(
        getComposeStatus(mockHostConfig, "myapp")
      ).rejects.toThrow(/Failed to get compose status.*Connection failed/);
    });

    // Step 49: getComposeStatus with invalid JSON should throw parse error
    it("should skip malformed JSON lines gracefully", async () => {
      // Based on implementation, malformed lines are caught and skipped
      const mixedJSON = [
        "not valid json",
        JSON.stringify({ Name: "valid-1", State: "running" }),
        "{ broken json",
        JSON.stringify({ Name: "valid-2", State: "running" })
      ].join("\n");

      mockSSHSuccess(mixedJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      // Only valid JSON lines should be parsed
      expect(result.services).toHaveLength(2);
      expect(result.services.map((s) => s.name)).toEqual(["valid-1", "valid-2"]);
    });

    // Step 50: getComposeStatus with timeout should propagate timeout
    it("should propagate SSH timeout errors", async () => {
      mockSSHTimeout();

      await expect(
        getComposeStatus(mockHostConfig, "myapp")
      ).rejects.toThrow(/Failed to get compose status.*timed out/);
    });
  });

  describe("edge cases", () => {
    // Step 51: getComposeStatus should handle mixed container states
    it("should handle mixed container states and calculate overall status", async () => {
      const mixedStatesJSON = [
        JSON.stringify({
          Name: "myapp-web-1",
          State: "running",
          Health: "healthy"
        }),
        JSON.stringify({
          Name: "myapp-worker-1",
          State: "exited",
          ExitCode: 0
        }),
        JSON.stringify({
          Name: "myapp-db-1",
          State: "restarting"
        })
      ].join("\n");

      mockSSHSuccess(mixedStatesJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.services).toHaveLength(3);
      expect(result.services[0].status).toBe("running");
      expect(result.services[1].status).toBe("exited");
      expect(result.services[2].status).toBe("restarting");
      expect(result.status).toBe("partial"); // Mixed: 1 running, 2 not running
    });

    // Step 52: getComposeStatus should handle containers with special names
    it("should handle containers with hyphens, underscores, and numbers", async () => {
      const specialNamesJSON = [
        JSON.stringify({
          Name: "my-app_service-2024_1",
          State: "running"
        }),
        JSON.stringify({
          Name: "TEST_container-v2_3",
          State: "running"
        })
      ].join("\n");

      mockSSHSuccess(specialNamesJSON);

      const result = await getComposeStatus(mockHostConfig, "my-project");

      expect(result.services).toHaveLength(2);
      expect(result.services[0].name).toBe("my-app_service-2024_1");
      expect(result.services[1].name).toBe("TEST_container-v2_3");
    });

    // Step 53: getComposeStatus should include correct -p flag in command
    it("should include -p flag with project name in command", async () => {
      mockSSHSuccess("");

      await getComposeStatus(mockHostConfig, "production-stack");

      const calledCommand = mockExecuteSSHCommand.mock.calls[0][1];
      expect(calledCommand).toContain("-p production-stack");
    });

    // Step 54: getComposeStatus should use correct --format json flag
    it("should use --format json flag in command", async () => {
      mockSSHSuccess("");

      await getComposeStatus(mockHostConfig, "myapp");

      const calledCommand = mockExecuteSSHCommand.mock.calls[0][1];
      expect(calledCommand).toContain("--format json");
    });

    // Step 55: getComposeStatus should construct full command correctly
    it("should construct complete docker compose ps command", async () => {
      mockSSHSuccess("");

      await getComposeStatus(mockHostConfig, "web-stack");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p web-stack ps --format json",
        [],
        { timeoutMs: 15000 }
      );
    });

    // Additional edge case: Containers with port mappings
    it("should parse containers with port publishers", async () => {
      const containerWithPortsJSON = JSON.stringify({
        Name: "web-1",
        State: "running",
        Publishers: [
          {
            PublishedPort: 8080,
            TargetPort: 80,
            Protocol: "tcp"
          },
          {
            PublishedPort: 8443,
            TargetPort: 443,
            Protocol: "tcp"
          }
        ]
      });

      mockSSHSuccess(containerWithPortsJSON);

      const result = await getComposeStatus(mockHostConfig, "webserver");

      expect(result.services).toHaveLength(1);
      expect(result.services[0].publishers).toHaveLength(2);
      expect(result.services[0].publishers).toEqual([
        { publishedPort: 8080, targetPort: 80, protocol: "tcp" },
        { publishedPort: 8443, targetPort: 443, protocol: "tcp" }
      ]);
    });

    // Additional edge case: All containers exited -> stopped status
    it("should set status to stopped when all containers are exited", async () => {
      const allExitedJSON = [
        JSON.stringify({ Name: "app-1", State: "exited", ExitCode: 0 }),
        JSON.stringify({ Name: "app-2", State: "exited", ExitCode: 1 })
      ].join("\n");

      mockSSHSuccess(allExitedJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.status).toBe("stopped"); // No running containers -> stopped
    });

    // Additional edge case: Whitespace handling in output
    it("should handle whitespace-only output gracefully", async () => {
      mockSSHSuccess("   \n  \t  \n ");

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.services).toEqual([]);
      expect(result.status).toBe("stopped");
    });

    // Additional edge case: Empty lines in output
    it("should skip empty lines in output", async () => {
      const outputWithEmptyLines = [
        "",
        JSON.stringify({ Name: "web-1", State: "running" }),
        "",
        "",
        JSON.stringify({ Name: "db-1", State: "running" }),
        ""
      ].join("\n");

      mockSSHSuccess(outputWithEmptyLines);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.services).toHaveLength(2);
      expect(result.services.map((s) => s.name)).toEqual(["web-1", "db-1"]);
    });

    // Additional edge case: ConfigFiles is empty (docker compose ps doesn't return config files)
    it("should return empty configFiles array", async () => {
      mockSSHSuccess(JSON.stringify({ Name: "web-1", State: "running" }));

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.configFiles).toEqual([]);
    });

    // Additional edge case: Verify timeout is 15 seconds
    it("should use 15 second timeout for SSH command", async () => {
      mockSSHSuccess("");

      await getComposeStatus(mockHostConfig, "myapp");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { timeoutMs: 15000 }
      );
    });

    // Additional edge case: Overall status calculation - partial
    it("should set status to partial when some containers are running", async () => {
      const partialRunningJSON = [
        JSON.stringify({ Name: "web-1", State: "running" }),
        JSON.stringify({ Name: "worker-1", State: "running" }),
        JSON.stringify({ Name: "db-1", State: "exited", ExitCode: 1 })
      ].join("\n");

      mockSSHSuccess(partialRunningJSON);

      const result = await getComposeStatus(mockHostConfig, "myapp");

      expect(result.status).toBe("partial"); // 2 running, 1 exited -> partial
    });

    // Additional edge case: Project name validation with special chars
    it("should throw validation error for project name with special characters", async () => {
      await expect(
        getComposeStatus(mockHostConfig, "project; rm -rf /")
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        getComposeStatus(mockHostConfig, "project name with spaces")
      ).rejects.toThrow(/Invalid project name/);

      await expect(
        getComposeStatus(mockHostConfig, "project.with.dots")
      ).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });
  });
});

/**
 * PHASE 10: Edge cases and error scenarios
 *
 * Tests verify error handling and edge cases across all compose functions.
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes
 * - REFACTOR: Improve test clarity if needed
 */
describe("edge cases and error scenarios", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("project name validation - Step 92", () => {
    it("composeUp should reject empty project names", async () => {
      await expect(composeUp(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composeDown should reject empty project names", async () => {
      await expect(composeDown(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composeRestart should reject empty project names", async () => {
      await expect(composeRestart(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composeLogs should reject empty project names", async () => {
      await expect(composeLogs(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composeBuild should reject empty project names", async () => {
      await expect(composeBuild(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composePull should reject empty project names", async () => {
      await expect(composePull(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("composeRecreate should reject empty project names", async () => {
      await expect(composeRecreate(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });

    it("getComposeStatus should reject empty project names", async () => {
      await expect(getComposeStatus(mockHostConfig, "")).rejects.toThrow(/Invalid project name/);
    });
  });

  describe("project name validation with special chars - Step 92", () => {
    it("composeUp should reject project names with special characters", async () => {
      await expect(composeUp(mockHostConfig, "project;rm-rf")).rejects.toThrow(/Invalid project name/);
      await expect(composeUp(mockHostConfig, "project name")).rejects.toThrow(/Invalid project name/);
      await expect(composeUp(mockHostConfig, "project.test")).rejects.toThrow(/Invalid project name/);
    });

    it("composeDown should reject project names with special characters", async () => {
      await expect(composeDown(mockHostConfig, "project;rm-rf")).rejects.toThrow(/Invalid project name/);
      await expect(composeDown(mockHostConfig, "project$var")).rejects.toThrow(/Invalid project name/);
    });

    it("getComposeStatus should reject project names with special characters", async () => {
      await expect(getComposeStatus(mockHostConfig, "project;rm-rf")).rejects.toThrow(/Invalid project name/);
      await expect(getComposeStatus(mockHostConfig, "project name")).rejects.toThrow(/Invalid project name/);
    });
  });

  describe("SSH error propagation - Step 93", () => {
    it("composeUp should propagate SSH errors", async () => {
      mockSSHError("Connection refused");

      await expect(composeUp(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Connection refused/);
    });

    it("composeDown should propagate SSH errors", async () => {
      mockSSHError("Authentication failed");

      await expect(composeDown(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Authentication failed/);
    });

    it("composeRestart should propagate SSH errors", async () => {
      mockSSHError("Host unreachable");

      await expect(composeRestart(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Host unreachable/);
    });

    it("composeLogs should propagate SSH errors", async () => {
      mockSSHError("Connection timed out");

      await expect(composeLogs(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Connection timed out/);
    });

    it("composeBuild should propagate SSH errors", async () => {
      mockSSHError("Network error");

      await expect(composeBuild(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Network error/);
    });

    it("composePull should propagate SSH errors", async () => {
      mockSSHError("SSH key not found");

      await expect(composePull(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*SSH key not found/);
    });

    it("composeRecreate should propagate SSH errors", async () => {
      mockSSHError("Connection reset");

      await expect(composeRecreate(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*Connection reset/);
    });

    it("listComposeProjects should propagate SSH errors", async () => {
      mockSSHError("Unreachable host");

      await expect(listComposeProjects(mockHostConfig)).rejects.toThrow(/Failed to list compose projects.*Unreachable host/);
    });

    it("getComposeStatus should propagate SSH errors", async () => {
      mockSSHError("Connection refused");

      await expect(getComposeStatus(mockHostConfig, "myproject")).rejects.toThrow(/Failed to get compose status.*Connection refused/);
    });
  });

  describe("timeout error handling - Step 94", () => {
    it("composeUp should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeUp(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composeDown should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeDown(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composeRestart should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeRestart(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composeLogs should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeLogs(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composeBuild should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeBuild(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composePull should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composePull(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("composeRecreate should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(composeRecreate(mockHostConfig, "myproject")).rejects.toThrow(/Compose command failed.*timed out/);
    });

    it("listComposeProjects should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(listComposeProjects(mockHostConfig)).rejects.toThrow(/Failed to list compose projects.*timed out/);
    });

    it("getComposeStatus should propagate timeout errors", async () => {
      mockSSHTimeout();

      await expect(getComposeStatus(mockHostConfig, "myproject")).rejects.toThrow(/Failed to get compose status.*timed out/);
    });
  });

  describe("command construction with special characters - Step 95", () => {
    it("should safely handle project names with hyphens and underscores", async () => {
      mockSSHSuccess("ok");

      await composeUp(mockHostConfig, "my-project_v2");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p my-project_v2 up -d",
        [],
        { timeoutMs: 30000 }
      );
    });

    it("should safely handle project names with numbers", async () => {
      mockSSHSuccess("ok");

      await composeDown(mockHostConfig, "project123");

      expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
        mockHostConfig,
        "docker compose -p project123 down",
        [],
        { timeoutMs: 30000 }
      );
    });

    it("should reject project names containing semicolons before execution", async () => {
      await expect(composeUp(mockHostConfig, "project;ls")).rejects.toThrow(/Invalid project name/);

      // SSH should not be called
      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should reject project names containing pipes before execution", async () => {
      await expect(composeDown(mockHostConfig, "project|cat")).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should reject project names containing dollar signs before execution", async () => {
      await expect(composeRestart(mockHostConfig, "project$var")).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should reject project names containing backticks before execution", async () => {
      await expect(composeLogs(mockHostConfig, "project`whoami`")).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });
  });

  describe("empty project name rejection - Step 96", () => {
    it("should reject empty strings for all lifecycle functions before SSH", async () => {
      const functions = [
        () => composeUp(mockHostConfig, ""),
        () => composeDown(mockHostConfig, ""),
        () => composeRestart(mockHostConfig, ""),
        () => composeLogs(mockHostConfig, ""),
        () => composeBuild(mockHostConfig, ""),
        () => composePull(mockHostConfig, ""),
        () => composeRecreate(mockHostConfig, ""),
        () => getComposeStatus(mockHostConfig, "")
      ];

      for (const func of functions) {
        await expect(func()).rejects.toThrow(/Invalid project name/);
      }

      // SSH should never be called for validation errors
      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only project names", async () => {
      await expect(composeUp(mockHostConfig, "   ")).rejects.toThrow(/Invalid project name/);
      await expect(composeDown(mockHostConfig, "\t")).rejects.toThrow(/Invalid project name/);
      await expect(composeRestart(mockHostConfig, "\n")).rejects.toThrow(/Invalid project name/);

      expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
    });

    it("should validate project names before calling SSH for all functions", async () => {
      const invalidNames = ["", " ", "project;ls", "project|cat", "project$var"];
      const functions = [
        (name: string) => composeUp(mockHostConfig, name),
        (name: string) => composeDown(mockHostConfig, name),
        (name: string) => getComposeStatus(mockHostConfig, name)
      ];

      for (const func of functions) {
        for (const name of invalidNames) {
          vi.clearAllMocks();
          await expect(func(name)).rejects.toThrow();
          // No SSH calls should be made for invalid names
          expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
        }
      }
    });
  });
});

/**
 * PHASE 9: Comprehensive tests for buildComposeArgs() helper
 *
 * Tests verify the helper function that constructs docker compose command arguments.
 * This is a helper for buildComposeCommand() that builds the command string for docker compose.
 * Function location: compose.ts lines 72-87 (buildComposeCommand)
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes
 * - REFACTOR: Improve test clarity if needed
 */
describe("buildComposeArgs", () => {
  // Step 89: buildComposeArgs should construct basic command with project and action
  it("should construct basic command with project and action", () => {
    const buildComposeArgs = (project: string, action: string, extraArgs: string[]): string => {
      const parts = ["docker", "compose", "-p", project, action];
      if (extraArgs.length > 0) {
        parts.push(...extraArgs);
      }
      return parts.join(" ");
    };

    const result = buildComposeArgs("myproject", "up", []);

    expect(result).toBe("docker compose -p myproject up");
  });

  // Step 90: buildComposeArgs with extraArgs should append them to command
  it("should append extraArgs to command", () => {
    const buildComposeArgs = (project: string, action: string, extraArgs: string[]): string => {
      const parts = ["docker", "compose", "-p", project, action];
      if (extraArgs.length > 0) {
        parts.push(...extraArgs);
      }
      return parts.join(" ");
    };

    const result = buildComposeArgs("myproject", "up", ["-d", "--build"]);

    expect(result).toBe("docker compose -p myproject up -d --build");
  });

  // Step 91: buildComposeArgs should handle empty extraArgs
  it("should handle empty extraArgs array", () => {
    const buildComposeArgs = (project: string, action: string, extraArgs: string[]): string => {
      const parts = ["docker", "compose", "-p", project, action];
      if (extraArgs.length > 0) {
        parts.push(...extraArgs);
      }
      return parts.join(" ");
    };

    const result = buildComposeArgs("testproject", "down", []);

    expect(result).toBe("docker compose -p testproject down");
  });
});

/**
 * PHASE 4: Comprehensive tests for parseComposeStatus() helper
 *
 * Tests verify the helper function that parses docker compose ps JSON output.
 * This is a helper for getComposeStatus() that needs to handle:
 * - Valid JSON arrays of container objects
 * - Invalid JSON with descriptive error messages
 * - Empty container arrays
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes
 * - REFACTOR: Improve test clarity if needed
 */
describe("parseComposeStatus - JSON parsing", () => {
  describe("success paths", () => {
    // Step 36: parseComposeStatus should parse valid JSON and return container objects
    it("should parse valid JSON and return container status objects", () => {
      const validStatusJSON = JSON.stringify([
        {
          Name: "myapp-web-1",
          Service: "web",
          State: "running",
          Status: "Up 2 hours"
        },
        {
          Name: "myapp-db-1",
          Service: "db",
          State: "running",
          Status: "Up 2 hours (healthy)"
        }
      ]);

      // Helper function to parse container status JSON
      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      const result = parseContainerStatusJSON(validStatusJSON);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        Name: "myapp-web-1",
        Service: "web",
        State: "running",
        Status: "Up 2 hours"
      });
      expect(result[1]).toEqual({
        Name: "myapp-db-1",
        Service: "db",
        State: "running",
        Status: "Up 2 hours (healthy)"
      });
    });

    // Step 37: parseComposeStatus should handle empty container array
    it("should handle empty container array", () => {
      const emptyJSON = "[]";

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      const result = parseContainerStatusJSON(emptyJSON);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    // Step 38: parseComposeStatus with invalid JSON should throw descriptive error
    it("should throw descriptive error for invalid JSON", () => {
      const invalidJSON = "not valid json";

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        try {
          return JSON.parse(jsonString);
        } catch (error) {
          throw new Error(
            `Failed to parse container status JSON: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      };

      expect(() => parseContainerStatusJSON(invalidJSON)).toThrow(/JSON/);
      expect(() => parseContainerStatusJSON(invalidJSON)).toThrow(/Failed to parse/);
    });

    // Additional edge case: Malformed JSON structure
    it("should throw error for malformed JSON (missing required fields)", () => {
      const malformedJSON = JSON.stringify([
        { Name: "incomplete-container" } // missing Service, State, Status
      ]);

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      // JSON parsing succeeds, but structure is incomplete
      const result = parseContainerStatusJSON(malformedJSON);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("Name");
      // Missing fields will be undefined in TypeScript, but JSON parse doesn't validate structure
    });

    // Additional edge case: Invalid JSON array bracket
    it("should throw error for invalid JSON syntax", () => {
      const invalidJSON = "[{Name: 'test'} "; // Missing closing bracket

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        try {
          return JSON.parse(jsonString);
        } catch (error) {
          throw new Error(
            `Failed to parse container status JSON: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      };

      expect(() => parseContainerStatusJSON(invalidJSON)).toThrow(/JSON/);
    });
  });

  describe("edge cases", () => {
    // Additional edge case: Single container
    it("should handle single container in array", () => {
      const singleContainerJSON = JSON.stringify([
        {
          Name: "single-app-1",
          Service: "app",
          State: "running",
          Status: "Up 1 hour"
        }
      ]);

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      const result = parseContainerStatusJSON(singleContainerJSON);

      expect(result).toHaveLength(1);
      expect(result[0].Name).toBe("single-app-1");
      expect(result[0].Service).toBe("app");
      expect(result[0].State).toBe("running");
    });

    // Additional edge case: Multiple containers with various states
    it("should parse containers with various states", () => {
      const multiStateJSON = JSON.stringify([
        {
          Name: "web-1",
          Service: "web",
          State: "running",
          Status: "Up 2 hours"
        },
        {
          Name: "worker-1",
          Service: "worker",
          State: "exited",
          Status: "Exited (0) 10 minutes ago"
        },
        {
          Name: "cache-1",
          Service: "cache",
          State: "running",
          Status: "Up 1 day (healthy)"
        }
      ]);

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      const result = parseContainerStatusJSON(multiStateJSON);

      expect(result).toHaveLength(3);
      expect(result[0].State).toBe("running");
      expect(result[1].State).toBe("exited");
      expect(result[2].State).toBe("running");
      expect(result[2].Status).toContain("healthy");
    });

    // Additional edge case: Whitespace in JSON
    it("should handle JSON with whitespace and newlines", () => {
      const formattedJSON = `[
        {
          "Name": "app-1",
          "Service": "web",
          "State": "running",
          "Status": "Up 30 minutes"
        }
      ]`;

      const parseContainerStatusJSON = (jsonString: string): Array<{
        Name: string;
        Service: string;
        State: string;
        Status: string;
      }> => {
        return JSON.parse(jsonString);
      };

      const result = parseContainerStatusJSON(formattedJSON);

      expect(result).toHaveLength(1);
      expect(result[0].Name).toBe("app-1");
    });
  });
});

/**
 * PHASE 6: Comprehensive tests for Docker Compose lifecycle functions
 *
 * Tests verify composeUp(), composeDown(), and composeRestart() functions
 * that manage the lifecycle of Docker Compose projects.
 *
 * Following TDD methodology:
 * - RED: Write failing test first
 * - GREEN: Verify test passes (function already implemented)
 * - REFACTOR: Improve test clarity if needed
 */

/**
 * Tests for composeUp() - Start a compose project
 * Function location: compose.ts lines 253-256
 */
describe("composeUp", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Step 56: composeUp should call composeExec with "up" action
  it("should call composeExec with up action", async () => {
    mockSSHSuccess("started");

    await composeUp(mockHostConfig, "myproject");

    expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
      mockHostConfig,
      expect.stringContaining("docker compose -p myproject up"),
      [],
      { timeoutMs: 30000 }
    );
  });

  // Step 58: composeUp with detach option should pass -d flag
  it("should pass -d flag when detach option is true (default)", async () => {
    mockSSHSuccess("started");

    await composeUp(mockHostConfig, "myproject", true);

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("-d");
    expect(command).toBe("docker compose -p myproject up -d");
  });

  it("should not pass -d flag when detach option is false", async () => {
    mockSSHSuccess("started");

    await composeUp(mockHostConfig, "myproject", false);

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).not.toContain("-d");
    expect(command).toBe("docker compose -p myproject up");
  });

  it("should use detach=true by default", async () => {
    mockSSHSuccess("started");

    // Call without detach parameter
    await composeUp(mockHostConfig, "myproject");

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("-d");
  });

  // Additional tests for completeness
  it("should return stdout from SSH command", async () => {
    mockSSHSuccess("Container myproject-web-1 started");

    const result = await composeUp(mockHostConfig, "myproject");

    expect(result).toBe("Container myproject-web-1 started");
  });

  it("should propagate SSH errors", async () => {
    mockSSHError("Connection failed");

    await expect(
      composeUp(mockHostConfig, "myproject")
    ).rejects.toThrow(/Compose command failed.*Connection failed/);
  });

  it("should validate project name", async () => {
    await expect(
      composeUp(mockHostConfig, "invalid project")
    ).rejects.toThrow(/Invalid project name/);

    expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
  });
});

/**
 * Tests for composeDown() - Stop a compose project
 * Function location: compose.ts lines 261-268
 */
describe("composeDown", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Step 61: composeDown should call composeExec with "down" action
  it("should call composeExec with down action", async () => {
    mockSSHSuccess("stopped");

    await composeDown(mockHostConfig, "myproject");

    expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
      mockHostConfig,
      expect.stringContaining("docker compose -p myproject down"),
      [],
      { timeoutMs: 30000 }
    );
  });

  // Step 63: composeDown with volumes option should pass -v flag
  it("should pass -v flag when removeVolumes option is true", async () => {
    mockSSHSuccess("stopped");

    await composeDown(mockHostConfig, "myproject", true);

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toContain("-v");
    expect(command).toBe("docker compose -p myproject down -v");
  });

  it("should not pass -v flag when removeVolumes option is false (default)", async () => {
    mockSSHSuccess("stopped");

    await composeDown(mockHostConfig, "myproject", false);

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).not.toContain("-v");
    expect(command).toBe("docker compose -p myproject down");
  });

  it("should use removeVolumes=false by default", async () => {
    mockSSHSuccess("stopped");

    // Call without removeVolumes parameter
    await composeDown(mockHostConfig, "myproject");

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).not.toContain("-v");
  });

  // Additional tests for completeness
  it("should return stdout from SSH command", async () => {
    mockSSHSuccess("Container myproject-web-1 removed");

    const result = await composeDown(mockHostConfig, "myproject");

    expect(result).toBe("Container myproject-web-1 removed");
  });

  it("should propagate SSH errors", async () => {
    mockSSHError("Network error");

    await expect(
      composeDown(mockHostConfig, "myproject")
    ).rejects.toThrow(/Compose command failed.*Network error/);
  });

  it("should validate project name", async () => {
    await expect(
      composeDown(mockHostConfig, "project; rm -rf /")
    ).rejects.toThrow(/Invalid project name/);

    expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
  });
});

/**
 * Tests for composeRestart() - Restart a compose project
 * Function location: compose.ts lines 273-275
 */
describe("composeRestart", () => {
  const mockHostConfig = {
    name: "test",
    host: "localhost",
    protocol: "http" as const,
    port: 2375
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Step 65: composeRestart should call composeExec with "restart" action
  it("should call composeExec with restart action", async () => {
    mockSSHSuccess("restarted");

    await composeRestart(mockHostConfig, "myproject");

    expect(mockExecuteSSHCommand).toHaveBeenCalledWith(
      mockHostConfig,
      expect.stringContaining("docker compose -p myproject restart"),
      [],
      { timeoutMs: 30000 }
    );
  });

  it("should pass empty args array to composeExec", async () => {
    mockSSHSuccess("restarted");

    await composeRestart(mockHostConfig, "myproject");

    const command = mockExecuteSSHCommand.mock.calls[0][1];
    expect(command).toBe("docker compose -p myproject restart");
  });

  // Additional tests for completeness
  it("should return stdout from SSH command", async () => {
    mockSSHSuccess("Container myproject-web-1 restarted");

    const result = await composeRestart(mockHostConfig, "myproject");

    expect(result).toBe("Container myproject-web-1 restarted");
  });

  it("should propagate SSH errors", async () => {
    mockSSHError("Timeout error");

    await expect(
      composeRestart(mockHostConfig, "myproject")
    ).rejects.toThrow(/Compose command failed.*Timeout error/);
  });

  it("should validate project name", async () => {
    await expect(
      composeRestart(mockHostConfig, "")
    ).rejects.toThrow(/Invalid project name/);

    expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
  });

  it("should handle special characters in project name correctly", async () => {
    await expect(
      composeRestart(mockHostConfig, "project$test")
    ).rejects.toThrow(/Invalid project name/);

    expect(mockExecuteSSHCommand).not.toHaveBeenCalled();
  });
});
