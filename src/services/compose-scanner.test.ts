import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComposeScanner } from "./compose-scanner.js";
import type { HostConfig } from "../types.js";
import type { ISSHService } from "./interfaces.js";
import type { ILocalExecutorService } from "./interfaces.js";

describe("ComposeScanner", () => {
  let mockSSHService: ISSHService;
  let mockLocalExecutor: ILocalExecutorService;
  let scanner: ComposeScanner;

  const remoteHost: HostConfig = {
    name: "remote-host",
    host: "192.168.1.10",
    protocol: "ssh",
    sshUser: "admin",
    composeSearchPaths: ["/opt/docker", "/home/admin/compose"]
  };

  const localHost: HostConfig = {
    name: "localhost",
    host: "localhost",
    protocol: "ssh"
  };

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn()
    } as unknown as ISSHService;

    mockLocalExecutor = {
      executeLocalCommand: vi.fn()
    } as unknown as ILocalExecutorService;

    scanner = new ComposeScanner(mockSSHService, mockLocalExecutor);
  });

  describe("findComposeFiles", () => {
    it("should find compose files via SSH on remote host", async () => {
      const findOutput = "/opt/docker/jellyfin/docker-compose.yml\n/opt/docker/plex/compose.yaml\n/home/admin/compose/nginx/docker-compose.yaml";

      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(findOutput);

      const result = await scanner.findComposeFiles(remoteHost);

      expect(result).toEqual([
        "/opt/docker/jellyfin/docker-compose.yml",
        "/opt/docker/plex/compose.yaml",
        "/home/admin/compose/nginx/docker-compose.yaml"
      ]);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        remoteHost,
        "find",
        expect.arrayContaining([
          "/opt/docker",
          "/home/admin/compose",
          "-type",
          "f",
          "(",
          "-name",
          "docker-compose.yml",
          "-o",
          "-name",
          "docker-compose.yaml",
          "-o",
          "-name",
          "compose.yml",
          "-o",
          "-name",
          "compose.yaml",
          ")",
          "-print"
        ]),
        expect.any(Object)
      );
    });

    it("should find compose files locally on localhost", async () => {
      const findOutput = "/var/lib/docker/app1/docker-compose.yml\n/var/lib/docker/app2/compose.yaml";

      vi.mocked(mockLocalExecutor.executeLocalCommand).mockResolvedValue(findOutput);

      const result = await scanner.findComposeFiles(localHost);

      expect(result).toEqual([
        "/var/lib/docker/app1/docker-compose.yml",
        "/var/lib/docker/app2/compose.yaml"
      ]);

      expect(mockLocalExecutor.executeLocalCommand).toHaveBeenCalledWith(
        "find",
        expect.arrayContaining([
          "/var/lib/docker",
          "-type",
          "f"
        ]),
        expect.any(Object)
      );
    });

    it("should use default search paths if none configured", async () => {
      const hostWithoutPaths: HostConfig = {
        name: "default-host",
        host: "192.168.1.20",
        protocol: "ssh"
      };

      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      await scanner.findComposeFiles(hostWithoutPaths);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        hostWithoutPaths,
        "find",
        expect.arrayContaining(["/var/lib/docker"]),
        expect.any(Object)
      );
    });

    it("should handle empty results", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("");

      const result = await scanner.findComposeFiles(remoteHost);

      expect(result).toEqual([]);
    });
  });

  describe("extractProjectName", () => {
    it("should extract project name from file path", () => {
      const result = scanner.extractProjectName("/opt/docker/jellyfin/docker-compose.yml");
      expect(result).toBe("jellyfin");
    });

    it("should handle compose.yaml filename", () => {
      const result = scanner.extractProjectName("/home/user/myapp/compose.yaml");
      expect(result).toBe("myapp");
    });

    it("should handle root-level compose file", () => {
      const result = scanner.extractProjectName("/docker-compose.yml");
      expect(result).toBe("");
    });
  });

  describe("parseComposeName", () => {
    it("should parse explicit name field from compose file via SSH", async () => {
      const composeContent = `
name: my-custom-project
services:
  web:
    image: nginx
`;

      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(composeContent);

      const result = await scanner.parseComposeName(
        remoteHost,
        "/opt/docker/app/docker-compose.yml"
      );

      expect(result).toBe("my-custom-project");
      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        remoteHost,
        "cat",
        ["/opt/docker/app/docker-compose.yml"],
        expect.any(Object)
      );
    });

    it("should parse explicit name field locally", async () => {
      const composeContent = `
name: local-project
services:
  db:
    image: postgres
`;

      vi.mocked(mockLocalExecutor.executeLocalCommand).mockResolvedValue(composeContent);

      const result = await scanner.parseComposeName(
        localHost,
        "/var/lib/docker/myapp/compose.yaml"
      );

      expect(result).toBe("local-project");
    });

    it("should return null if no name field exists", async () => {
      const composeContent = `
services:
  web:
    image: nginx
`;

      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(composeContent);

      const result = await scanner.parseComposeName(
        remoteHost,
        "/opt/docker/app/docker-compose.yml"
      );

      expect(result).toBeNull();
    });

    it("should return null on parse errors", async () => {
      const invalidYaml = "invalid: yaml: content: [";

      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(invalidYaml);

      const result = await scanner.parseComposeName(
        remoteHost,
        "/opt/docker/app/docker-compose.yml"
      );

      expect(result).toBeNull();
    });
  });
});
