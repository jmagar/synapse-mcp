/**
 * Formatting utilities for homelab MCP responses
 *
 * Provides consistent markdown formatting for container, host, and Docker data.
 */

import { CHARACTER_LIMIT } from "../constants.js";
import { formatBytes } from "../services/docker.js";
import type { ContainerInfo, ImageInfo } from "../types.js";
import type { ComposeProject } from "../services/compose.js";

// Re-export formatBytes for convenience
export { formatBytes };

/**
 * Truncate text if it exceeds CHARACTER_LIMIT
 */
export function truncateIfNeeded(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT - 100) +
    "\n\n... [Output truncated. Use pagination or filters to reduce results.]"
  );
}

/**
 * Format container list as markdown
 */
export function formatContainersMarkdown(
  containers: ContainerInfo[],
  total: number,
  offset: number,
  hasMore: boolean
): string {
  if (containers.length === 0) {
    return "No containers found matching the specified criteria.";
  }

  const lines = [`## Containers (${offset + 1}-${offset + containers.length} of ${total})`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    const ports = c.ports
      .filter((p) => p.hostPort)
      .map((p) => `${p.hostPort}→${p.containerPort}`)
      .join(", ");

    lines.push(`${stateEmoji} **${c.name}** (${c.hostName})`);
    lines.push(`   Image: ${c.image} | Status: ${c.status}`);
    if (ports) lines.push(`   Ports: ${ports}`);
    lines.push("");
  }

  if (hasMore) {
    lines.push(
      `*More results available. Use offset=${offset + containers.length} to see next page.*`
    );
  }

  return lines.join("\n");
}

/**
 * Format container logs as markdown
 */
export function formatLogsMarkdown(
  logs: Array<{ timestamp: string; message: string }>,
  container: string,
  host: string
): string {
  if (logs.length === 0) {
    return `No logs found for container '${container}' on ${host}.`;
  }

  const lines = [`## Logs: ${container} (${host})`, "", "```"];
  for (const log of logs) {
    const ts = log.timestamp.slice(11, 19);
    lines.push(`[${ts}] ${log.message}`);
  }
  lines.push("```");

  return lines.join("\n");
}

/**
 * Container stats type for formatting
 */
export interface ContainerStats {
  containerName: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

/**
 * Format single container stats as markdown
 */
export function formatStatsMarkdown(stats: ContainerStats[], host: string): string {
  const s = stats[0];
  return `## Stats: ${s.containerName} (${host})

| Metric | Value |
|--------|-------|
| CPU | ${s.cpuPercent.toFixed(1)}% |
| Memory | ${formatBytes(s.memoryUsage)} / ${formatBytes(s.memoryLimit)} (${s.memoryPercent.toFixed(1)}%) |
| Network RX | ${formatBytes(s.networkRx)} |
| Network TX | ${formatBytes(s.networkTx)} |
| Block Read | ${formatBytes(s.blockRead)} |
| Block Write | ${formatBytes(s.blockWrite)} |`;
}

/**
 * Format multiple container stats as markdown table
 */
export function formatMultiStatsMarkdown(
  allStats: Array<{ stats: ContainerStats; host: string }>
): string {
  if (allStats.length === 0) return "No running containers found.";

  const lines = [
    "## Container Resource Usage",
    "",
    "| Container | Host | CPU% | Memory | Mem% |",
    "|-----------|------|------|--------|------|"
  ];

  for (const { stats, host } of allStats) {
    lines.push(
      `| ${stats.containerName} | ${host} | ${stats.cpuPercent.toFixed(1)}% | ${formatBytes(stats.memoryUsage)} | ${stats.memoryPercent.toFixed(1)}% |`
    );
  }

  return lines.join("\n");
}

/**
 * Container inspect info type for formatting
 */
export interface ContainerInspectInfo {
  Name: string;
  RestartCount: number;
  State: {
    Status: string;
    Running: boolean;
    StartedAt: string;
  };
  Config: {
    Image: string;
    Cmd?: string[];
    WorkingDir?: string;
    Env?: string[];
  };
  Mounts?: Array<{
    Source: string;
    Destination: string;
    Mode?: string;
  }>;
  NetworkSettings: {
    Ports?: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    Networks?: Record<string, unknown>;
  };
}

/**
 * Format container inspection as markdown
 */
export function formatInspectMarkdown(info: ContainerInspectInfo, host: string): string {
  const config = info.Config;
  const state = info.State;
  const mounts = info.Mounts || [];
  const network = info.NetworkSettings;

  const lines = [
    `## Container: ${info.Name.replace(/^\//, "")} (${host})`,
    "",
    "### State",
    `- Status: ${state.Status}`,
    `- Running: ${state.Running}`,
    `- Started: ${state.StartedAt}`,
    `- Restart Count: ${info.RestartCount}`,
    "",
    "### Configuration",
    `- Image: ${config.Image}`,
    `- Command: ${(config.Cmd || []).join(" ")}`,
    `- Working Dir: ${config.WorkingDir || "/"}`,
    ""
  ];

  if (config.Env && config.Env.length > 0) {
    lines.push("### Environment Variables");
    for (const env of config.Env.slice(0, 20)) {
      const [key] = env.split("=");
      const isSensitive = /password|secret|key|token|api/i.test(key);
      lines.push(`- ${isSensitive ? `${key}=****` : env}`);
    }
    if (config.Env.length > 20) lines.push(`- ... and ${config.Env.length - 20} more`);
    lines.push("");
  }

  if (mounts.length > 0) {
    lines.push("### Mounts");
    for (const m of mounts) {
      lines.push(`- ${m.Source} → ${m.Destination} (${m.Mode || "rw"})`);
    }
    lines.push("");
  }

  if (network.Ports) {
    lines.push("### Ports");
    for (const [containerPort, bindings] of Object.entries(network.Ports)) {
      if (bindings && bindings.length > 0) {
        for (const b of bindings) {
          lines.push(`- ${b.HostIp || "0.0.0.0"}:${b.HostPort} → ${containerPort}`);
        }
      }
    }
    lines.push("");
  }

  if (network.Networks && Object.keys(network.Networks).length > 0) {
    lines.push("### Networks");
    for (const networkName of Object.keys(network.Networks)) {
      lines.push(`- ${networkName}`);
    }
  }

  return lines.join("\n");
}

/**
 * Host status entry type
 */
export interface HostStatusEntry {
  name: string;
  connected: boolean;
  containerCount: number;
  runningCount: number;
  error?: string;
}

/**
 * Format host status as markdown table
 */
export function formatHostStatusMarkdown(status: HostStatusEntry[]): string {
  const lines = [
    "## Homelab Host Status",
    "",
    "| Host | Status | Containers | Running |",
    "|------|--------|------------|---------|"
  ];

  for (const h of status) {
    const statusEmoji = h.connected ? "🟢" : "🔴";
    const statusText = h.connected ? "Online" : `Offline (${h.error || "Unknown"})`;
    lines.push(
      `| ${h.name} | ${statusEmoji} ${statusText} | ${h.containerCount} | ${h.runningCount} |`
    );
  }

  return lines.join("\n");
}

/**
 * Format search results as markdown
 */
export function formatSearchResultsMarkdown(
  containers: ContainerInfo[],
  query: string,
  total: number
): string {
  if (containers.length === 0) return `No containers found matching '${query}'.`;

  const lines = [`## Search Results for '${query}' (${total} matches)`, ""];

  for (const c of containers) {
    const stateEmoji = c.state === "running" ? "🟢" : c.state === "paused" ? "🟡" : "🔴";
    lines.push(`${stateEmoji} **${c.name}** (${c.hostName})`);
    lines.push(`   Image: ${c.image} | State: ${c.state}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Docker info type for formatting
 */
export interface DockerInfoResult {
  dockerVersion: string;
  apiVersion: string;
  os: string;
  arch: string;
  kernelVersion: string;
  cpus: number;
  memoryBytes: number;
  storageDriver: string;
  rootDir: string;
  containersRunning: number;
  containersTotal: number;
  images: number;
}

/**
 * Format Docker info as markdown
 */
export function formatDockerInfoMarkdown(
  results: Array<{ host: string; info: DockerInfoResult }>
): string {
  const lines = ["## Docker System Info", ""];

  for (const { host, info } of results) {
    lines.push(`### ${host}`);
    if (info.dockerVersion === "error") {
      lines.push(`❌ Error: ${info.os}`);
    } else {
      lines.push(`- Docker: ${info.dockerVersion} (API ${info.apiVersion})`);
      lines.push(`- OS: ${info.os} (${info.arch})`);
      lines.push(`- Kernel: ${info.kernelVersion}`);
      lines.push(`- CPUs: ${info.cpus} | Memory: ${formatBytes(info.memoryBytes)}`);
      lines.push(`- Storage: ${info.storageDriver} @ ${info.rootDir}`);
      lines.push(`- Containers: ${info.containersRunning} running / ${info.containersTotal} total`);
      lines.push(`- Images: ${info.images}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Docker disk usage type for formatting
 */
export interface DockerDiskUsage {
  images: { total: number; active: number; size: number; reclaimable: number };
  containers: { total: number; running: number; size: number; reclaimable: number };
  volumes: { total: number; active: number; size: number; reclaimable: number };
  buildCache: { total: number; size: number; reclaimable: number };
  totalSize: number;
  totalReclaimable: number;
}

/**
 * Format Docker disk usage as markdown
 */
export function formatDockerDfMarkdown(
  results: Array<{ host: string; usage: DockerDiskUsage }>
): string {
  const lines = ["## Docker Disk Usage", ""];

  for (const { host, usage } of results) {
    lines.push(
      `### ${host}`,
      "",
      "| Type | Count | Size | Reclaimable |",
      "|------|-------|------|-------------|"
    );
    lines.push(
      `| Images | ${usage.images.total} (${usage.images.active} active) | ${formatBytes(usage.images.size)} | ${formatBytes(usage.images.reclaimable)} |`
    );
    lines.push(
      `| Containers | ${usage.containers.total} (${usage.containers.running} running) | ${formatBytes(usage.containers.size)} | ${formatBytes(usage.containers.reclaimable)} |`
    );
    lines.push(
      `| Volumes | ${usage.volumes.total} (${usage.volumes.active} active) | ${formatBytes(usage.volumes.size)} | ${formatBytes(usage.volumes.reclaimable)} |`
    );
    lines.push(
      `| Build Cache | ${usage.buildCache.total} | ${formatBytes(usage.buildCache.size)} | ${formatBytes(usage.buildCache.reclaimable)} |`
    );
    lines.push(
      `| **Total** | | **${formatBytes(usage.totalSize)}** | **${formatBytes(usage.totalReclaimable)}** |`
    );
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Prune result type for formatting
 */
export interface PruneResult {
  type: string;
  spaceReclaimed: number;
  itemsDeleted: number;
}

/**
 * Format prune results as markdown
 */
export function formatPruneMarkdown(
  allResults: Array<{ host: string; results: PruneResult[] }>
): string {
  const lines = ["## Prune Results", ""];

  let totalReclaimed = 0;
  let totalDeleted = 0;

  for (const { host, results } of allResults) {
    lines.push(
      `### ${host}`,
      "",
      "| Type | Items Deleted | Space Reclaimed |",
      "|------|---------------|-----------------|"
    );

    for (const r of results) {
      lines.push(`| ${r.type} | ${r.itemsDeleted} | ${formatBytes(r.spaceReclaimed)} |`);
      totalReclaimed += r.spaceReclaimed;
      totalDeleted += r.itemsDeleted;
    }
    lines.push("");
  }

  lines.push(`**Total: ${totalDeleted} items deleted, ${formatBytes(totalReclaimed)} reclaimed**`);

  return lines.join("\n");
}

/**
 * Host resources type for formatting
 */
export interface HostResources {
  hostname: string;
  uptime: string;
  loadAverage: number[];
  cpu: {
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalMB: number;
    usedMB: number;
    usagePercent: number;
  };
  disk: Array<{
    mount: string;
    totalGB: number;
    usedGB: number;
    usagePercent: number;
  }>;
}

/**
 * Format host resources as markdown
 */
export function formatHostResourcesMarkdown(
  results: Array<{ host: string; resources: HostResources | null; error?: string }>
): string {
  const lines = ["## Host Resources", ""];

  for (const { host, resources, error } of results) {
    lines.push(`### ${host}`);

    if (error || !resources) {
      lines.push(`❌ ${error || "Unknown error"}`);
      lines.push("");
      continue;
    }

    lines.push(`- **Hostname:** ${resources.hostname}`);
    lines.push(`- **Uptime:** ${resources.uptime}`);
    lines.push(`- **Load:** ${resources.loadAverage.join(", ")}`);
    lines.push(`- **CPU:** ${resources.cpu.cores} cores @ ${resources.cpu.usagePercent}%`);
    lines.push(
      `- **Memory:** ${resources.memory.usedMB} MB / ${resources.memory.totalMB} MB (${resources.memory.usagePercent}%)`
    );

    if (resources.disk.length > 0) {
      lines.push("", "**Disks:**");
      for (const d of resources.disk) {
        lines.push(`- ${d.mount}: ${d.usedGB}G / ${d.totalGB}G (${d.usagePercent}%)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format images list as markdown table
 */
export function formatImagesMarkdown(images: ImageInfo[], total: number, offset: number): string {
  if (images.length === 0) return "No images found.";

  const lines = [
    "## Docker Images",
    "",
    `Showing ${images.length} of ${total} images (offset: ${offset})`,
    "",
    "| ID | Tags | Size | Host | Containers |",
    "|-----|------|------|------|------------|"
  ];

  for (const img of images) {
    const tags = img.tags.slice(0, 2).join(", ") + (img.tags.length > 2 ? "..." : "");
    lines.push(
      `| ${img.id} | ${tags} | ${formatBytes(img.size)} | ${img.hostName} | ${img.containers} |`
    );
  }

  return lines.join("\n");
}

/**
 * Format compose project list as markdown
 */
export function formatComposeListMarkdown(
  projects: ComposeProject[],
  host: string,
  total?: number,
  offset?: number,
  hasMore?: boolean
): string {
  if (projects.length === 0) return `No compose projects found on ${host}.`;

  const header =
    total !== undefined
      ? `## Compose Projects on ${host} (${(offset || 0) + 1}-${(offset || 0) + projects.length} of ${total})`
      : `## Compose Projects on ${host}`;

  const lines = [header, "", "| Project | Status | Services |", "|---------|--------|----------|"];

  for (const p of projects) {
    const statusEmoji = p.status === "running" ? "🟢" : p.status === "partial" ? "🟡" : "🔴";
    lines.push(`| ${p.name} | ${statusEmoji} ${p.status} | ${p.services.length || "-"} |`);
  }

  if (hasMore) {
    lines.push("");
    lines.push(
      `*More results available. Use offset=${(offset || 0) + projects.length} to see next page.*`
    );
  }

  return lines.join("\n");
}

/**
 * Format compose project status as markdown
 */
export function formatComposeStatusMarkdown(
  project: ComposeProject,
  totalServices?: number,
  offset?: number,
  hasMore?: boolean
): string {
  const statusEmoji =
    project.status === "running" ? "🟢" : project.status === "partial" ? "🟡" : "🔴";

  const serviceInfo =
    totalServices !== undefined
      ? ` - Services ${(offset || 0) + 1}-${(offset || 0) + project.services.length} of ${totalServices}`
      : "";

  const lines = [`## ${project.name} (${statusEmoji} ${project.status})${serviceInfo}`, ""];

  if (project.services.length === 0) {
    lines.push("No services found.");
  } else {
    lines.push("| Service | Status | Health | Ports |", "|---------|--------|--------|-------|");

    for (const svc of project.services) {
      const health = svc.health || "-";
      const ports =
        svc.publishers?.map((p) => `${p.publishedPort}→${p.targetPort}`).join(", ") || "-";
      const svcEmoji = svc.status === "running" ? "🟢" : "🔴";
      lines.push(`| ${svc.name} | ${svcEmoji} ${svc.status} | ${health} | ${ports} |`);
    }
  }

  if (hasMore) {
    lines.push("");
    lines.push(
      `*More services available. Use offset=${(offset || 0) + project.services.length} to see next page.*`
    );
  }

  return lines.join("\n");
}

/**
 * Container inspect summary type
 */
export interface ContainerInspectSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  created: string;
  started: string;
  restartCount: number;
  ports: string[];
  mounts: Array<{ src?: string; dst?: string; type?: string }>;
  networks: string[];
  env_count: number;
  labels_count: number;
  host: string;
}

/**
 * Format container inspect summary as markdown (condensed version)
 */
export function formatInspectSummaryMarkdown(summary: ContainerInspectSummary): string {
  const lines = [
    `## ${summary.name} (${summary.host})`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| ID | ${summary.id} |`,
    `| Image | ${summary.image} |`,
    `| State | ${summary.state} |`,
    `| Started | ${summary.started?.slice(0, 19) || "-"} |`,
    `| Restarts | ${summary.restartCount} |`,
    `| Networks | ${summary.networks.join(", ") || "-"} |`,
    `| Ports | ${summary.ports.join(", ") || "-"} |`,
    `| Mounts | ${summary.mounts.length} |`,
    `| Env Vars | ${summary.env_count} |`,
    `| Labels | ${summary.labels_count} |`
  ];

  if (summary.mounts.length > 0 && summary.mounts.length <= 5) {
    lines.push("", "**Mounts:**");
    for (const m of summary.mounts) {
      lines.push(`- ${m.src} → ${m.dst} (${m.type})`);
    }
  }

  return lines.join("\n");
}

// ===== Scout Formatters =====

/**
 * Format file read result as markdown
 */
export function formatScoutReadMarkdown(
  host: string,
  path: string,
  content: string,
  size: number,
  truncated: boolean
): string {
  const lines = [
    `## 📄 ${host}:${path}`,
    "",
    `**Size:** ${formatBytes(size)}${truncated ? " (truncated)" : ""}`,
    "",
    "```",
    content,
    "```"
  ];

  if (truncated) {
    lines.push("");
    lines.push("⚠️ *File was truncated to fit size limit*");
  }

  return truncateIfNeeded(lines.join("\n"));
}

/**
 * Format directory listing as markdown
 */
export function formatScoutListMarkdown(
  host: string,
  path: string,
  listing: string
): string {
  return truncateIfNeeded([
    `## 📁 ${host}:${path}`,
    "",
    "```",
    listing,
    "```"
  ].join("\n"));
}

/**
 * Format tree output as markdown
 */
export function formatScoutTreeMarkdown(
  host: string,
  path: string,
  tree: string,
  depth: number
): string {
  return truncateIfNeeded([
    `## 🌳 ${host}:${path} (depth: ${depth})`,
    "",
    "```",
    tree,
    "```"
  ].join("\n"));
}

/**
 * Format command execution result as markdown
 */
export function formatScoutExecMarkdown(
  host: string,
  path: string,
  command: string,
  stdout: string,
  exitCode: number
): string {
  const statusEmoji = exitCode === 0 ? "✅" : "❌";

  return truncateIfNeeded([
    `## ${statusEmoji} Command: ${host}:${path}`,
    "",
    `**Command:** \`${command}\``,
    `**Exit:** ${exitCode}`,
    "",
    "**Output:**",
    "```",
    stdout,
    "```"
  ].join("\n"));
}

/**
 * Format find results as markdown
 */
export function formatScoutFindMarkdown(
  host: string,
  path: string,
  pattern: string,
  results: string
): string {
  const lines = results.split("\n").filter(l => l.trim());

  return truncateIfNeeded([
    `## 🔍 Find: ${host}:${path}`,
    "",
    `**Pattern:** \`${pattern}\``,
    `**Results:** ${lines.length} files`,
    "",
    "```",
    results,
    "```"
  ].join("\n"));
}

/**
 * Format file transfer result as markdown
 */
export function formatScoutTransferMarkdown(
  sourceHost: string,
  sourcePath: string,
  targetHost: string,
  targetPath: string,
  bytesTransferred: number,
  warning?: string
): string {
  const lines = [
    `## 📦 Transfer Complete`,
    "",
    `**From:** ${sourceHost}:${sourcePath}`,
    `**To:** ${targetHost}:${targetPath}`,
    `**Size:** ${formatBytes(bytesTransferred)}`
  ];

  if (warning) {
    lines.push("");
    lines.push(`⚠️ ${warning}`);
  }

  return lines.join("\n");
}

/**
 * Format file diff result as markdown
 */
export function formatScoutDiffMarkdown(
  host1: string,
  path1: string,
  host2: string,
  path2: string,
  diff: string
): string {
  return truncateIfNeeded([
    `## 📊 Diff`,
    "",
    `**File 1:** ${host1}:${path1}`,
    `**File 2:** ${host2}:${path2}`,
    "",
    "```diff",
    diff,
    "```"
  ].join("\n"));
}
