/**
 * DEPRECATED: This file is deprecated in favor of ssh-service.ts
 *
 * This module previously provided a global SSH pool singleton.
 * Use SSHService class with dependency injection instead.
 *
 * @deprecated Use SSHService from ssh-service.ts
 */

// Re-export SSHCommandOptions for backward compatibility
export type { SSHCommandOptions } from "./ssh-service.js";
