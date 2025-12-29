import { vi } from "vitest";

export const mockGetHostResources = vi.fn();

export function setupSSHMocks(): void {
  mockGetHostResources.mockResolvedValue({
    cpu_percent: 25.5,
    memory_used_mb: 4096,
    memory_total_mb: 8192,
    memory_percent: 50.0,
    disk_used_gb: 100,
    disk_total_gb: 500,
    disk_percent: 20.0,
    load_avg: [1.5, 1.2, 1.0],
    uptime_seconds: 86400
  });
}

export function resetSSHMocks(): void {
  vi.clearAllMocks();
  setupSSHMocks();
}
