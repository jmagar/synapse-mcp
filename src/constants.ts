// Character limit for responses to prevent context overflow (~12.5k tokens)
export const CHARACTER_LIMIT = 40000;

// Default pagination settings
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Log retrieval defaults
export const DEFAULT_LOG_LINES = 50;
export const MAX_LOG_LINES = 500;

// Timeout settings (ms)
export const API_TIMEOUT = 30000;
export const STATS_TIMEOUT = 5000;

// Default Docker socket path
export const DEFAULT_DOCKER_SOCKET = "/var/run/docker.sock";

// Environment variable names for config
export const ENV_HOSTS_CONFIG = "HOMELAB_HOSTS_CONFIG";
export const ENV_DEFAULT_HOST = "HOMELAB_DEFAULT_HOST";

// ===== Scout File Operations Constants =====

// File size limits (bytes)
export const DEFAULT_MAX_FILE_SIZE = 1048576; // 1MB
export const MAX_FILE_SIZE_LIMIT = 10485760; // 10MB

// Command timeout limits (milliseconds)
export const DEFAULT_COMMAND_TIMEOUT = 30000; // 30s
export const MAX_COMMAND_TIMEOUT = 300000; // 300s (5 min)

// Container exec timeout limits (milliseconds)
export const DEFAULT_EXEC_TIMEOUT = 30000; // 30s
export const MAX_EXEC_TIMEOUT = 300000; // 300s (5 min)

// Container exec buffer limits (bytes)
export const DEFAULT_EXEC_MAX_BUFFER = 10485760; // 10MB per stream

// Tree depth limits
export const DEFAULT_TREE_DEPTH = 3;
export const MAX_TREE_DEPTH = 10;

// Find result limits
export const DEFAULT_FIND_LIMIT = 100;
export const MAX_FIND_LIMIT = 1000;

// Diff context lines limits
export const DEFAULT_DIFF_CONTEXT_LINES = 3;
export const MAX_DIFF_CONTEXT_LINES = 50;

// Allowed commands for exec subaction (read-only operations)
export const ALLOWED_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "ls",
  "tree",
  "wc",
  "sort",
  "uniq",
  "diff",
  "stat",
  "file",
  "du",
  "df",
  "pwd",
  "hostname",
  "uptime",
  "whoami"
]);

// Environment variable to disable command allowlist
export const ENV_ALLOW_ANY_COMMAND = "HOMELAB_ALLOW_ANY_COMMAND";
