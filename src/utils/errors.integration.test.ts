// src/utils/errors.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HostOperationError, SSHCommandError, ComposeOperationError, logError } from "./errors.js";

describe("Error Handling Integration", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should preserve full error chain through multiple layers", () => {
    const rootCause = new Error("ECONNREFUSED");
    const sshError = new SSHCommandError(
      "SSH failed",
      "docker-01",
      "docker ps",
      255,
      "Connection refused",
      "",
      rootCause
    );
    const hostError = new HostOperationError(
      "List containers failed",
      "docker-01",
      "listContainers",
      sshError
    );

    // Verify chain
    expect(hostError.cause).toBe(sshError);
    expect(sshError.cause).toBe(rootCause);

    // Verify stack includes all layers
    expect(hostError.stack).toContain("HostOperationError");
    expect(hostError.stack).toContain("Caused by:");
  });

  it("should log complete context for chained errors", () => {
    const rootCause = new Error("Network timeout");
    const error = new ComposeOperationError(
      "Service start failed",
      "web-01",
      "production",
      "up",
      rootCause
    );

    logError(error, {
      requestId: "req-456",
      metadata: { retryAttempt: 3 }
    });

    // Verify all context logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("req-456"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("web-01"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("production"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("up"));
  });
});
