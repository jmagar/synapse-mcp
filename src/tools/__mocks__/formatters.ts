import { vi } from "vitest";

export const mockTruncateIfNeeded = vi.fn((text: string) => text);
export const mockFormatContainersMarkdown = vi.fn(() => "# Containers");
export const mockFormatLogsMarkdown = vi.fn(() => "# Logs");
export const mockFormatStatsMarkdown = vi.fn(() => "# Stats");
export const mockFormatMultiStatsMarkdown = vi.fn(() => "# Multi Stats");
export const mockFormatInspectMarkdown = vi.fn(() => "# Inspect");
export const mockFormatInspectSummaryMarkdown = vi.fn(() => "# Inspect Summary");
export const mockFormatHostStatusMarkdown = vi.fn(() => "# Host Status");
export const mockFormatSearchResultsMarkdown = vi.fn(() => "# Search Results");
export const mockFormatDockerInfoMarkdown = vi.fn(() => "# Docker Info");
export const mockFormatDockerDfMarkdown = vi.fn(() => "# Docker Df");
export const mockFormatPruneMarkdown = vi.fn(() => "# Prune Results");
export const mockFormatHostResourcesMarkdown = vi.fn(() => "# Host Resources");
export const mockFormatImagesMarkdown = vi.fn(() => "# Images");
export const mockFormatComposeListMarkdown = vi.fn(() => "# Compose List");
export const mockFormatComposeStatusMarkdown = vi.fn(() => "# Compose Status");

export function setupFormatterMocks(): void {
  // Already set up with default implementations
}

export function resetFormatterMocks(): void {
  vi.clearAllMocks();
  setupFormatterMocks();
}
