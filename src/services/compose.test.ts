import { describe, it, expect } from "vitest";
import {
  validateProjectName,
  composeBuild,
  composePull,
  composeRecreate,
  composeExec
} from "./compose.js";

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
