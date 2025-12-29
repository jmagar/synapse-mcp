import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HostOperationError, SSHCommandError, ComposeOperationError, logError } from "./errors.js";

describe("HostOperationError", () => {
  it("should chain error causes and preserve stack", () => {
    const rootCause = new Error("Connection timeout");
    const wrapped = new HostOperationError(
      "Failed to connect to host",
      "docker-01",
      "getDockerInfo",
      rootCause
    );

    expect(wrapped.message).toContain("Failed to connect to host");
    expect(wrapped.message).toContain("docker-01");
    expect(wrapped.message).toContain("getDockerInfo");
    expect(wrapped.cause).toBe(rootCause);
    expect(wrapped.hostName).toBe("docker-01");
    expect(wrapped.operation).toBe("getDockerInfo");
  });

  it("should handle non-Error cause types", () => {
    const wrapped = new HostOperationError("Operation failed", "host-1", "test", "string error");

    expect(wrapped.message).toContain("Operation failed");
    expect(wrapped.cause).toBe("string error");
  });
});

describe("SSHCommandError", () => {
  it("should include command, exit code, and stderr in message", () => {
    const error = new SSHCommandError(
      "Command failed",
      "web-01",
      "docker ps",
      127,
      "command not found",
      ""
    );

    expect(error.message).toContain("Command failed");
    expect(error.message).toContain("web-01");
    expect(error.message).toContain("docker ps");
    expect(error.message).toContain("127");
    expect(error.message).toContain("command not found");
    expect(error.command).toBe("docker ps");
    expect(error.exitCode).toBe(127);
  });

  it("should chain original error cause", () => {
    const rootCause = new Error("Network timeout");
    const error = new SSHCommandError(
      "SSH failed",
      "db-01",
      "uptime",
      undefined,
      undefined,
      undefined,
      rootCause
    );

    expect(error.cause).toBe(rootCause);
    expect(error.stack).toContain("Caused by:");
  });
});

describe("ComposeOperationError", () => {
  it("should include project and action in message", () => {
    const error = new ComposeOperationError(
      "Service failed to start",
      "docker-01",
      "production-db",
      "up",
      new Error("Port already in use")
    );

    expect(error.message).toContain("Service failed to start");
    expect(error.message).toContain("docker-01");
    expect(error.message).toContain("production-db");
    expect(error.message).toContain("up");
    expect(error.project).toBe("production-db");
    expect(error.action).toBe("up");
  });
});

describe("logError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should log structured error with context", () => {
    const error = new HostOperationError(
      "Connection failed",
      "docker-01",
      "listContainers",
      new Error("ECONNREFUSED")
    );

    logError(error, { requestId: "req-123" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("HostOperationError"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("docker-01"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("listContainers"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("req-123"));
  });

  it("should handle non-Error types", () => {
    logError("string error", { operation: "test" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("string error"));
  });

  it("should include stack trace for Error instances", () => {
    const error = new Error("Test error");
    logError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(error.stack || ""));
  });
});
