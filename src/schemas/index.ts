/**
 * Schema exports for homelab MCP server V3
 *
 * Exports common utilities and both tool schemas:
 * - Flux: Docker infrastructure management (39 subactions)
 * - Scout: SSH remote operations (11 actions)
 */
export * from "./common.js";
export * from "./flux/index.js";
export * from "./scout/index.js";
