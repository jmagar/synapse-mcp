import { vi } from "vitest";

export const mockListComposeProjects = vi.fn();
export const mockGetComposeStatus = vi.fn();
export const mockComposeUp = vi.fn();
export const mockComposeDown = vi.fn();
export const mockComposeRestart = vi.fn();
export const mockComposeLogs = vi.fn();
export const mockComposeBuild = vi.fn();
export const mockComposePull = vi.fn();
export const mockComposeRecreate = vi.fn();

export function setupComposeMocks(): void {
  mockListComposeProjects.mockResolvedValue([
    { name: "project1", path: "/opt/project1", services: 3 }
  ]);
  mockGetComposeStatus.mockResolvedValue({
    project: "project1",
    services: [{ name: "web", state: "running", containers: 1 }]
  });
  mockComposeUp.mockResolvedValue(undefined);
  mockComposeDown.mockResolvedValue(undefined);
  mockComposeRestart.mockResolvedValue(undefined);
  mockComposeLogs.mockResolvedValue("log output");
  mockComposeBuild.mockResolvedValue(undefined);
  mockComposePull.mockResolvedValue(undefined);
  mockComposeRecreate.mockResolvedValue(undefined);
}

export function resetComposeMocks(): void {
  vi.clearAllMocks();
  setupComposeMocks();
}
