import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatUptime,
  isSocketPath,
  dockerClients,
  clearDockerClients,
  formatImageId,
  checkConnection,
  pullImage,
  recreateContainer,
  removeImage,
  buildImage
} from "./docker.js";

describe("formatBytes", () => {
  it("should return '0 B' for 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("should format bytes correctly", () => {
    expect(formatBytes(500)).toBe("500.0 B");
  });

  it("should format kilobytes correctly", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("should format megabytes correctly", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("should format gigabytes correctly", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("should format terabytes correctly", () => {
    expect(formatBytes(1099511627776)).toBe("1.0 TB");
  });
});

describe("formatUptime", () => {
  it("should format minutes only when less than 1 hour", () => {
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();
    expect(formatUptime(thirtyMinutesAgo)).toBe("30m");
  });

  it("should format hours and minutes when less than 1 day", () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000 - 15 * 60 * 1000).toISOString();
    expect(formatUptime(twoHoursAgo)).toBe("2h 15m");
  });

  it("should format days and hours when 1 day or more", () => {
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(threeDaysAgo)).toBe("3d 5h");
  });

  it("should handle 0 minutes", () => {
    const now = Date.now();
    const justNow = new Date(now - 30 * 1000).toISOString(); // 30 seconds ago
    expect(formatUptime(justNow)).toBe("0m");
  });
});

describe("isSocketPath", () => {
  it("should return true for standard Docker socket path", () => {
    expect(isSocketPath("/var/run/docker.sock")).toBe(true);
  });

  it("should return true for paths containing /docker", () => {
    expect(isSocketPath("/some/docker/path")).toBe(true);
  });

  it("should return true for paths containing /run/", () => {
    expect(isSocketPath("/run/user/1000/docker.sock")).toBe(true);
  });

  it("should return true for paths ending in .sock", () => {
    expect(isSocketPath("/custom/path/my.sock")).toBe(true);
  });

  it("should return false for non-socket paths", () => {
    expect(isSocketPath("localhost")).toBe(false);
    expect(isSocketPath("192.168.1.100")).toBe(false);
    expect(isSocketPath("http://example.com")).toBe(false);
  });

  it("should return false for paths not starting with /", () => {
    expect(isSocketPath("docker.sock")).toBe(false);
    expect(isSocketPath("run/docker.sock")).toBe(false);
  });
});

describe("clearDockerClients", () => {
  it("should clear all cached docker clients", () => {
    // Add a mock entry
    dockerClients.set("test-host", {} as never);
    expect(dockerClients.size).toBeGreaterThan(0);

    clearDockerClients();
    expect(dockerClients.size).toBe(0);
  });

  it("should be safe to call when no clients exist", () => {
    clearDockerClients();
    expect(dockerClients.size).toBe(0);

    // Should not throw
    clearDockerClients();
    expect(dockerClients.size).toBe(0);
  });
});

describe("formatImageId", () => {
  it("should truncate sha256 image ID to 12 characters", () => {
    const fullId = "sha256:abc123def456789012345678901234567890abcd";
    expect(formatImageId(fullId)).toBe("abc123def456");
  });

  it("should handle ID without sha256 prefix", () => {
    const shortId = "abc123def456789012345678";
    expect(formatImageId(shortId)).toBe("abc123def456");
  });

  it("should return full ID if shorter than 12 chars", () => {
    const shortId = "abc123";
    expect(formatImageId(shortId)).toBe("abc123");
  });

  it("should handle empty string", () => {
    expect(formatImageId("")).toBe("");
  });
});

describe("checkConnection", () => {
  it("should be a function", () => {
    expect(typeof checkConnection).toBe("function");
  });

  it("should return false for invalid host config", async () => {
    const result = await checkConnection({
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    });
    expect(result).toBe(false);
  });

  it("should clear client cache on connection failure", async () => {
    const hostConfig = {
      name: "test-fail",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };

    // Attempt connection (will fail)
    await checkConnection(hostConfig);

    // Verify client was removed from cache
    const cacheKey = `${hostConfig.name}-${hostConfig.host}`;
    expect(dockerClients.has(cacheKey)).toBe(false);
  });
});

describe("pullImage", () => {
  it("should be an async function that accepts imageName and host", () => {
    expect(typeof pullImage).toBe("function");
    expect(pullImage.length).toBe(2); // 2 parameters
  });

  it("should reject with error message when Docker connection fails", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(pullImage("nginx:latest", invalidHost)).rejects.toThrow(
      /Failed to pull image|ENOTFOUND|ECONNREFUSED/
    );
  });

  it("should reject with error for empty image name", async () => {
    const invalidHost = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(pullImage("", invalidHost)).rejects.toThrow();
  });
});

describe("recreateContainer", () => {
  it("should be an async function that accepts containerId, host, and options", () => {
    expect(typeof recreateContainer).toBe("function");
    expect(recreateContainer.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject when container does not exist", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(recreateContainer("nonexistent-container", invalidHost)).rejects.toThrow();
  });
});

describe("removeImage", () => {
  it("should be an async function that accepts imageId, host, and options", () => {
    expect(typeof removeImage).toBe("function");
    expect(removeImage.length).toBeGreaterThanOrEqual(2);
  });

  it("should reject when image does not exist", async () => {
    const invalidHost = {
      name: "invalid",
      host: "nonexistent.local",
      protocol: "http" as const,
      port: 9999
    };
    await expect(removeImage("nonexistent:image", invalidHost)).rejects.toThrow();
  });
});

describe("buildImage", () => {
  it("should be an async function that accepts host and options", () => {
    expect(typeof buildImage).toBe("function");
    expect(buildImage.length).toBe(2);
  });

  it("should reject with validation error for invalid tag characters", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "/valid/path",
        tag: "invalid tag with spaces"
      })
    ).rejects.toThrow("Invalid image tag");
  });

  it("should reject with validation error for invalid context path", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "path with spaces",
        tag: "valid:tag"
      })
    ).rejects.toThrow(/context.*invalid characters/i);
  });

  // Security tests for path traversal (CWE-22)
  it("should reject context path with .. directory traversal", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "../../../etc/passwd",
        tag: "valid:tag"
      })
    ).rejects.toThrow(/path traversal|invalid.*path|\.\..*not allowed/i);
  });

  it("should reject context path with hidden traversal (/./..)", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "/valid/./path/../../etc/passwd",
        tag: "valid:tag"
      })
    ).rejects.toThrow(/path traversal|invalid.*path|\.\..*not allowed/i);
  });

  it("should reject context path starting with ./ (relative)", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "./relative/path",
        tag: "valid:tag"
      })
    ).rejects.toThrow(/absolute path required|relative path|invalid.*path/i);
  });

  it("should reject dockerfile path with .. directory traversal", async () => {
    const host = {
      name: "test",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };
    await expect(
      buildImage(host, {
        context: "/valid/context",
        tag: "valid:tag",
        dockerfile: "../../etc/passwd"
      })
    ).rejects.toThrow(/path traversal|invalid.*path|\.\..*not allowed/i);
  });

  it("should accept valid absolute path without traversal", async () => {
    const host = {
      name: "test",
      host: "nonexistent.local", // Will fail connection, but validation should pass
      protocol: "http" as const,
      port: 9999
    };

    // This should pass validation but fail on connection
    await expect(
      buildImage(host, {
        context: "/home/user/docker/build",
        tag: "valid:tag"
      })
    ).rejects.toThrow(/ENOTFOUND|ECONNREFUSED|connection|Failed/i);

    // Should NOT throw validation error
    await expect(
      buildImage(host, {
        context: "/home/user/docker/build",
        tag: "valid:tag"
      })
    ).rejects.not.toThrow(/invalid.*path|path traversal/i);
  });
});
