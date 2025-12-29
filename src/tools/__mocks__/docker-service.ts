import { vi } from "vitest";
import type { HostConfig } from "../../types.js";

export const mockListContainers = vi.fn();
export const mockContainerAction = vi.fn();
export const mockGetContainerLogs = vi.fn();
export const mockGetContainerStats = vi.fn();
export const mockInspectContainer = vi.fn();
export const mockFindContainerHost = vi.fn();
export const mockGetDockerInfo = vi.fn();
export const mockGetDockerDiskUsage = vi.fn();
export const mockPruneDocker = vi.fn();
export const mockListImages = vi.fn();
export const mockPullImage = vi.fn();
export const mockRemoveImage = vi.fn();
export const mockBuildImage = vi.fn();
export const mockRecreateContainer = vi.fn();
export const mockGetHostStatus = vi.fn();
export const mockLoadHostConfigs = vi.fn();

export function setupDockerMocks(): void {
  mockLoadHostConfigs.mockReturnValue([
    { name: "host1", host: "localhost", port: 2375 },
    { name: "host2", host: "192.168.1.100", port: 2375 }
  ] as HostConfig[]);

  mockListContainers.mockResolvedValue([]);
  mockContainerAction.mockResolvedValue(undefined);
  mockGetContainerLogs.mockResolvedValue([]);
  mockGetContainerStats.mockResolvedValue({
    name: "test-container",
    cpu_percent: 1.5,
    memory_usage_mb: 128,
    memory_limit_mb: 512,
    memory_percent: 25,
    network_rx_mb: 10,
    network_tx_mb: 5,
    block_read_mb: 1,
    block_write_mb: 2,
    pids: 10
  });
  mockInspectContainer.mockResolvedValue({ Id: "abc123", Config: { Image: "nginx" } });
  mockFindContainerHost.mockResolvedValue({ host: mockLoadHostConfigs()[0] });
  mockGetDockerInfo.mockResolvedValue({
    dockerVersion: "24.0.0",
    apiVersion: "1.43",
    os: "linux",
    arch: "x86_64",
    kernelVersion: "6.0.0",
    cpus: 4,
    memoryBytes: 8589934592,
    storageDriver: "overlay2",
    rootDir: "/var/lib/docker",
    containersTotal: 10,
    containersRunning: 5,
    containersPaused: 0,
    containersStopped: 5,
    images: 20
  });
  mockGetDockerDiskUsage.mockResolvedValue({
    images: { active: 10, size: 1000000000, reclaimable: 500000000 },
    containers: { active: 5, size: 100000000, reclaimable: 50000000 },
    volumes: { active: 3, size: 200000000, reclaimable: 100000000 },
    buildCache: { active: 2, size: 50000000, reclaimable: 25000000 }
  });
  mockPruneDocker.mockResolvedValue([
    { type: "images", spaceReclaimed: 500000000, itemsDeleted: 5, details: [] }
  ]);
  mockListImages.mockResolvedValue([]);
  mockPullImage.mockResolvedValue(undefined);
  mockRemoveImage.mockResolvedValue(undefined);
  mockBuildImage.mockResolvedValue(undefined);
  mockRecreateContainer.mockResolvedValue({ status: "Recreated", containerId: "new123" });
  mockGetHostStatus.mockResolvedValue([{ host: "host1", status: "ok", error: null }]);
}

export function resetDockerMocks(): void {
  vi.clearAllMocks();
  setupDockerMocks();
}
