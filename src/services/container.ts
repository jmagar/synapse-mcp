import { DockerService } from "./docker.js";
import { SSHConnectionPoolImpl } from "./ssh-pool.js";
import { SSHService } from "./ssh-service.js";
import { ComposeService } from "./compose.js";
import { FileService } from "./file-service.js";
import { LocalExecutorService } from "./local-executor.js";
import { ComposeProjectCache } from "./compose-cache.js";
import { ComposeScanner } from "./compose-scanner.js";
import { ComposeDiscovery } from "./compose-discovery.js";
import type {
  IDockerService,
  ISSHService,
  IComposeService,
  ISSHConnectionPool,
  IFileService,
  ILocalExecutorService
} from "./interfaces.js";

/**
 * Service container for dependency injection.
 * Manages service lifecycle and dependencies.
 *
 * Dependency chain:
 * - LocalExecutorService (no dependencies)
 * - SSHConnectionPool (no dependencies)
 * - SSHService (requires SSHConnectionPool)
 * - ComposeService (requires SSHService, LocalExecutorService)
 * - ComposeProjectCache (no dependencies)
 * - ComposeScanner (requires SSHService, LocalExecutorService)
 * - ComposeDiscovery (requires ComposeService, ComposeProjectCache, ComposeScanner)
 * - ComposeServiceWithDiscovery (requires SSHService, LocalExecutorService, ComposeDiscovery)
 * - FileService (requires SSHService)
 * - DockerService (no dependencies)
 */
export class ServiceContainer {
  private dockerService?: IDockerService;
  private sshService?: ISSHService;
  private composeService?: IComposeService;
  private sshPool?: ISSHConnectionPool;
  private fileService?: IFileService;
  private localExecutor?: ILocalExecutorService;
  private composeCache?: ComposeProjectCache;
  private composeScanner?: ComposeScanner;
  private composeDiscovery?: ComposeDiscovery;
  private composeServiceWithDiscovery?: ComposeService;

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
   * Get Local executor service instance (lazy initialization)
   */
  getLocalExecutor(): ILocalExecutorService {
    if (!this.localExecutor) this.localExecutor = new LocalExecutorService();
    return this.localExecutor;
  }

  /**
   * Set Local executor service instance (for testing/overrides)
   */
  setLocalExecutor(service: ILocalExecutorService): void {
    this.localExecutor = service;
  }

  /**
   * Get Compose service instance (lazy initialization with dependencies)
   */
  getComposeService(): IComposeService {
    if (!this.composeService) {
      this.composeService = new ComposeService(this.getSSHService(), this.getLocalExecutor());
    }
    return this.composeService;
  }

  /**
   * Set Compose service instance (for testing/overrides)
   */
  setComposeService(service: IComposeService): void {
    this.composeService = service;
  }

  /**
   * Get File service instance (lazy initialization with dependencies)
   */
  getFileService(): IFileService {
    if (!this.fileService) this.fileService = new FileService(this.getSSHService());
    return this.fileService;
  }

  /**
   * Set File service instance (for testing/overrides)
   */
  setFileService(service: IFileService): void {
    this.fileService = service;
  }

  /**
   * Get Compose project cache instance (lazy initialization)
   */
  getComposeCache(): ComposeProjectCache {
    if (!this.composeCache) {
      this.composeCache = new ComposeProjectCache();
    }
    return this.composeCache;
  }

  /**
   * Get Compose scanner instance (lazy initialization with dependencies)
   */
  getComposeScanner(): ComposeScanner {
    if (!this.composeScanner) {
      this.composeScanner = new ComposeScanner(
        this.getSSHService(),
        this.getLocalExecutor()
      );
    }
    return this.composeScanner;
  }

  /**
   * Get Compose discovery instance (lazy initialization with dependencies)
   */
  getComposeDiscovery(): ComposeDiscovery {
    if (!this.composeDiscovery) {
      this.composeDiscovery = new ComposeDiscovery(
        this.getComposeService(),
        this.getComposeCache(),
        this.getComposeScanner()
      );
    }
    return this.composeDiscovery;
  }

  /**
   * Get Compose service with discovery enabled (lazy initialization with dependencies).
   * Use this instead of getComposeService() when you want auto-discovery enabled.
   */
  getComposeServiceWithDiscovery(): ComposeService {
    if (!this.composeServiceWithDiscovery) {
      this.composeServiceWithDiscovery = new ComposeService(
        this.getSSHService(),
        this.getLocalExecutor(),
        this.getComposeDiscovery()
      );
    }
    return this.composeServiceWithDiscovery;
  }

  /**
   * Cleanup all services and close connections.
   * Call during shutdown to ensure clean termination.
   */
  async cleanup(): Promise<void> {
    if (this.sshPool) await this.sshPool.closeAll();
    if (this.dockerService) {
      this.dockerService.clearClients();
    }
  }
}

/**
 * Create a default service container with lazy initialization
 */
export function createDefaultContainer(): ServiceContainer {
  return new ServiceContainer();
}
