import { describe, it, expect } from "vitest";
import {
  formatContainersMarkdown,
  formatLogsMarkdown,
  formatHostStatusMarkdown,
  truncateIfNeeded,
  formatScoutReadMarkdown,
  formatScoutListMarkdown,
  formatScoutTreeMarkdown,
  formatScoutExecMarkdown,
  formatScoutFindMarkdown,
  formatScoutTransferMarkdown,
  formatScoutDiffMarkdown
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

describe("scout formatters", () => {
  describe("formatScoutReadMarkdown", () => {
    it("formats file content with path header", () => {
      const result = formatScoutReadMarkdown(
        "tootie",
        "/etc/hosts",
        "127.0.0.1 localhost",
        100,
        false
      );
      expect(result).toContain("tootie:/etc/hosts");
      expect(result).toContain("127.0.0.1 localhost");
    });

    it("shows truncation notice when truncated", () => {
      const result = formatScoutReadMarkdown(
        "tootie",
        "/var/log/big.log",
        "partial content...",
        1000000,
        true
      );
      expect(result).toContain("truncated");
    });
  });

  describe("formatScoutListMarkdown", () => {
    it("formats directory listing", () => {
      const listing = "total 4\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 test";
      const result = formatScoutListMarkdown("tootie", "/var/log", listing);
      expect(result).toContain("tootie:/var/log");
      expect(result).toContain("total 4");
    });
  });

  describe("formatScoutTreeMarkdown", () => {
    it("formats tree output", () => {
      const tree = ".\n├── dir1\n└── file.txt";
      const result = formatScoutTreeMarkdown("tootie", "/home", tree, 3);
      expect(result).toContain("tootie:/home");
      expect(result).toContain("├── dir1");
    });
  });

  describe("formatScoutExecMarkdown", () => {
    it("formats command result", () => {
      const result = formatScoutExecMarkdown("tootie", "/tmp", "ls -la", "file1\nfile2", 0);
      expect(result).toContain("ls -la");
      expect(result).toContain("file1");
      expect(result).toContain("**Exit:** 0");
    });
  });

  describe("formatScoutFindMarkdown", () => {
    it("formats find results", () => {
      const files = "/var/log/syslog\n/var/log/auth.log";
      const result = formatScoutFindMarkdown("tootie", "/var", "*.log", files);
      expect(result).toContain("*.log");
      expect(result).toContain("/var/log/syslog");
    });
  });

  describe("formatScoutTransferMarkdown", () => {
    it("formats transfer result", () => {
      const result = formatScoutTransferMarkdown(
        "tootie",
        "/tmp/file.txt",
        "shart",
        "/backup/file.txt",
        1024
      );
      expect(result).toContain("tootie:/tmp/file.txt");
      expect(result).toContain("shart:/backup/file.txt");
      expect(result).toContain("1.0 KB");
    });

    it("includes warning if present", () => {
      const result = formatScoutTransferMarkdown(
        "tootie",
        "/tmp/file.txt",
        "shart",
        "/etc/config",
        512,
        "Warning: system path"
      );
      expect(result).toContain("Warning");
    });
  });

  describe("formatScoutDiffMarkdown", () => {
    it("formats diff output", () => {
      const diff = "--- a/hosts\n+++ b/hosts\n@@ -1 +1 @@\n-old\n+new";
      const result = formatScoutDiffMarkdown("tootie", "/etc/hosts", "shart", "/etc/hosts", diff);
      expect(result).toContain("tootie:/etc/hosts");
      expect(result).toContain("shart:/etc/hosts");
      expect(result).toContain("---");
    });
  });
});
