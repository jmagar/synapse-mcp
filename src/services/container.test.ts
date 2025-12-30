import { describe, it, expect, vi } from "vitest";
import { ServiceContainer } from "./container.js";
import type { IDockerService, ISSHService, IComposeService, IFileService } from "./interfaces.js";

describe("ServiceContainer", () => {
  it("creates default services lazily", () => {
    const container = new ServiceContainer();
    expect(container.getDockerService()).toBeDefined();
    expect(container.getSSHService()).toBeDefined();
    expect(container.getComposeService()).toBeDefined();
  });

  it("allows service overrides", () => {
    const container = new ServiceContainer();
    const docker = {} as IDockerService;
    const ssh = {} as ISSHService;
    const compose = {} as IComposeService;

    container.setDockerService(docker);
    container.setSSHService(ssh);
    container.setComposeService(compose);

    expect(container.getDockerService()).toBe(docker);
    expect(container.getSSHService()).toBe(ssh);
    expect(container.getComposeService()).toBe(compose);
  });

  describe("getFileService", () => {
    it("returns FileService instance", () => {
      const container = new ServiceContainer();
      const fileService = container.getFileService();
      expect(fileService).toBeDefined();
      expect(typeof fileService.readFile).toBe("function");
      expect(typeof fileService.listDirectory).toBe("function");
      expect(typeof fileService.treeDirectory).toBe("function");
      expect(typeof fileService.executeCommand).toBe("function");
      expect(typeof fileService.findFiles).toBe("function");
      expect(typeof fileService.transferFile).toBe("function");
      expect(typeof fileService.diffFiles).toBe("function");
    });

    it("lazily initializes on first call", () => {
      const container = new ServiceContainer();
      // First call creates instance
      const first = container.getFileService();
      // Second call returns same instance
      const second = container.getFileService();
      expect(first).toBe(second);
    });
  });

  describe("setFileService", () => {
    it("allows injecting mock for testing", () => {
      const container = new ServiceContainer();
      const mockFileService: IFileService = {
        readFile: vi.fn(),
        listDirectory: vi.fn(),
        treeDirectory: vi.fn(),
        executeCommand: vi.fn(),
        findFiles: vi.fn(),
        transferFile: vi.fn(),
        diffFiles: vi.fn()
      };

      container.setFileService(mockFileService);

      expect(container.getFileService()).toBe(mockFileService);
    });
  });
});
