// Character limit for responses to prevent context overflow
export const CHARACTER_LIMIT = 50000;

// Default pagination settings
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Log retrieval defaults
export const DEFAULT_LOG_LINES = 100;
export const MAX_LOG_LINES = 1000;

// Timeout settings (ms)
export const API_TIMEOUT = 30000;
export const STATS_TIMEOUT = 5000;

// Default Docker socket path
export const DEFAULT_DOCKER_SOCKET = "/var/run/docker.sock";

// Environment variable names for config
export const ENV_HOSTS_CONFIG = "HOMELAB_HOSTS_CONFIG";
export const ENV_DEFAULT_HOST = "HOMELAB_DEFAULT_HOST";
