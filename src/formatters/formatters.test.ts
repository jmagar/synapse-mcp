import { describe, it, expect } from "vitest";
import {
  formatContainersMarkdown,
  formatLogsMarkdown,
  formatHostStatusMarkdown,
  truncateIfNeeded
} from "./index.js";

describe("truncateIfNeeded", () => {
  it("should return text unchanged if under limit", () => {
    const text = "short text";
    expect(truncateIfNeeded(text)).toBe(text);
  });

  it("should truncate text exceeding CHARACTER_LIMIT", () => {
    const longText = "x".repeat(50001);
    const result = truncateIfNeeded(longText);
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain("truncated");
  });
});

describe("formatContainersMarkdown", () => {
  it("should return 'No containers found' for empty array", () => {
    const result = formatContainersMarkdown([], 0, 0, false);
    expect(result).toContain("No containers found");
  });

  it("should format container list with state emojis", () => {
    const containers = [
      {
        id: "abc123",
        name: "test-container",
        image: "nginx:latest",
        state: "running" as const,
        status: "Up 2 hours",
        hostName: "tootie",
        ports: [],
        labels: {},
        created: "2024-01-01T00:00:00Z"
      }
    ];
    const result = formatContainersMarkdown(containers, 1, 0, false);
    expect(result).toContain("🟢");
    expect(result).toContain("test-container");
    expect(result).toContain("nginx:latest");
  });

  it("should show pagination info when hasMore is true", () => {
    const containers = [
      {
        id: "abc123",
        name: "test",
        image: "nginx",
        state: "running" as const,
        status: "Up",
        hostName: "tootie",
        ports: [],
        labels: {},
        created: "2024-01-01T00:00:00Z"
      }
    ];
    const result = formatContainersMarkdown(containers, 10, 0, true);
    expect(result).toContain("More results available");
  });
});

describe("formatLogsMarkdown", () => {
  it("should return 'No logs found' for empty array", () => {
    const result = formatLogsMarkdown([], "test", "host");
    expect(result).toContain("No logs found");
  });

  it("should format log entries with timestamps", () => {
    const logs = [{ timestamp: "2024-01-01T12:00:00Z", message: "Test log message" }];
    const result = formatLogsMarkdown(logs, "container", "host");
    expect(result).toContain("12:00:00");
    expect(result).toContain("Test log message");
  });
});

describe("formatHostStatusMarkdown", () => {
  it("should show online status with green emoji", () => {
    const status = [
      {
        name: "tootie",
        connected: true,
        containerCount: 10,
        runningCount: 8
      }
    ];
    const result = formatHostStatusMarkdown(status);
    expect(result).toContain("🟢");
    expect(result).toContain("Online");
    expect(result).toContain("tootie");
  });

  it("should show offline status with red emoji", () => {
    const status = [
      {
        name: "offline-host",
        connected: false,
        containerCount: 0,
        runningCount: 0,
        error: "Connection refused"
      }
    ];
    const result = formatHostStatusMarkdown(status);
    expect(result).toContain("🔴");
    expect(result).toContain("Offline");
  });
});
