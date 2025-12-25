import { DockerService } from "./docker.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import { SSHService } from "./ssh-service.js";
import { ComposeService } from "./compose.js";
import type { IDockerService, ISSHService, IComposeService, ISSHConnectionPool } from "./interfaces.js";

/**
 * Service container for dependency injection.
 * Manages service lifecycle and dependencies.
 *
 * Dependency chain:
 * - SSHConnectionPool (no dependencies)
 * - SSHService (requires SSHConnectionPool)
 * - ComposeService (requires SSHService)
 * - DockerService (no dependencies)
 */
export class ServiceContainer {
  private dockerService?: IDockerService;
  private sshService?: ISSHService;
  private composeService?: IComposeService;
  private sshPool?: ISSHConnectionPool;

  /**
   * Get Docker service instance (lazy initialization)
   */
  getDockerService(): IDockerService {
    if (!this.dockerService) this.dockerService = new DockerService();
    return this.dockerService;
  }

  /**
   * Set Docker service instance (for testing/overrides)
   */
  setDockerService(service: IDockerService): void {
    this.dockerService = service;
  }

  /**
   * Get SSH connection pool instance (lazy initialization)
   */
  getSSHConnectionPool(): ISSHConnectionPool {
    if (!this.sshPool) this.sshPool = new SSHConnectionPoolImpl();
    return this.sshPool;
  }

  /**
   * Set SSH connection pool instance (for testing/overrides)
   */
  setSSHConnectionPool(pool: ISSHConnectionPool): void {
    this.sshPool = pool;
  }

  /**
   * Get SSH service instance (lazy initialization with dependencies)
   */
  getSSHService(): ISSHService {
    if (!this.sshService) this.sshService = new SSHService(this.getSSHConnectionPool());
    return this.sshService;
  }

  /**
   * Set SSH service instance (for testing/overrides)
   */
  setSSHService(service: ISSHService): void {
    this.sshService = service;
  }

  /**
   * Get Compose service instance (lazy initialization with dependencies)
   */
  getComposeService(): IComposeService {
    if (!this.composeService) this.composeService = new ComposeService(this.getSSHService());
    return this.composeService;
  }

  /**
   * Set Compose service instance (for testing/overrides)
   */
  setComposeService(service: IComposeService): void {
    this.composeService = service;
  }

  /**
   * Cleanup all services and close connections.
   * Call during shutdown to ensure clean termination.
   */
  async cleanup(): Promise<void> {
    if (this.sshPool) await this.sshPool.closeAll();
    if (this.dockerService && "clearClients" in this.dockerService) {
      (this.dockerService as DockerService).clearClients();
    }
  }
}

/**
 * Create a default service container with lazy initialization
 */
export function createDefaultContainer(): ServiceContainer {
  return new ServiceContainer();
}
