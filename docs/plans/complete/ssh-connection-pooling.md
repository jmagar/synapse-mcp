# SSH Connection Pooling

## Overview

The SSH connection pool eliminates connection overhead by reusing SSH connections across operations. This provides a **50× performance improvement** for repeated SSH operations.

## Performance Impact

- **Without pooling:** 250ms connection overhead per operation
- **With pooling:** <5ms per operation (connection reuse)
- **Improvement:** 50× faster for repeated operations

## Configuration

Configure the connection pool via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SSH_POOL_MAX_CONNECTIONS` | `5` | Max connections per host |
| `SSH_POOL_IDLE_TIMEOUT_MS` | `60000` | Idle timeout before closing (ms) |
| `SSH_POOL_CONNECTION_TIMEOUT_MS` | `5000` | Connection timeout (ms) |
| `SSH_POOL_HEALTH_CHECKS` | `true` | Enable periodic health checks |
| `SSH_POOL_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval (ms) |

### Example Configuration

```bash
# Increase pool size for high-concurrency scenarios
export SSH_POOL_MAX_CONNECTIONS=10

# Reduce idle timeout for memory-constrained environments
export SSH_POOL_IDLE_TIMEOUT_MS=30000

# Disable health checks for testing
export SSH_POOL_HEALTH_CHECKS=false
```

## Architecture

### Connection Pool Key

Connections are keyed by: `${host.name}:${host.port || 22}`

This ensures connections are reused for the same host, even if the IP address changes.

### Lifecycle

1. **Request Connection:** `getConnection(host)` retrieves idle connection or creates new one
2. **Execute Command:** Connection executes SSH command
3. **Release Connection:** `releaseConnection(host, connection)` marks connection idle
4. **Idle Timeout:** After 60s of inactivity, connection is closed automatically
5. **Health Check:** Periodic checks verify idle connections are still alive

### Pool Exhaustion

When `maxConnections` is reached, new connection requests will fail with:

```
Connection pool exhausted for ${host}:${port} (max: ${maxConnections})
```

Increase `SSH_POOL_MAX_CONNECTIONS` or wait for idle connections to be released.

## Monitoring

Get pool statistics via the global pool:

```typescript
import { getGlobalPool } from "./services/ssh-pool-exec.js";

const pool = getGlobalPool();
const stats = pool.getStats();

console.log(stats);
// {
//   poolHits: 42,
//   poolMisses: 3,
//   activeConnections: 2,
//   idleConnections: 1,
//   totalConnections: 3,
//   healthCheckFailures: 0,
//   healthChecksPassed: 15
// }
```

### Metrics

- **poolHits:** Successful connection reuse (higher is better)
- **poolMisses:** New connections created
- **activeConnections:** Currently executing commands
- **idleConnections:** Available for reuse
- **totalConnections:** Total in pool
- **healthCheckFailures:** Failed health checks (indicates network issues)
- **healthChecksPassed:** Successful health checks

## Usage

The connection pool is used automatically by all SSH operations:

```typescript
import { executeSSHCommand } from "./services/ssh-pool-exec.js";

// First call creates connection (pool miss)
await executeSSHCommand(host, "docker compose ps");

// Second call reuses connection (pool hit)
await executeSSHCommand(host, "docker compose logs");
```

All `compose.ts` and `ssh.ts` functions automatically use the pool.

## Graceful Shutdown

The pool automatically closes all connections on process exit:

```typescript
process.on("SIGINT", async () => {
  const pool = getGlobalPool();
  await pool.closeAll();
  process.exit(0);
});
```

Registered for: `SIGINT`, `SIGTERM`, `exit`

## Health Checks

Idle connections are checked every 30s (configurable) with:

```bash
echo ok
```

Failed connections are automatically removed from the pool.

## Troubleshooting

### Connection Refused

- Verify SSH access: `ssh ${host} echo ok`
- Check SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Ensure host is in `~/.ssh/known_hosts`

### Pool Exhausted

- Increase `SSH_POOL_MAX_CONNECTIONS`
- Check for leaked connections (not released after use)
- Monitor `activeConnections` metric

### Health Check Failures

- Network connectivity issues
- SSH service restarted on remote host
- Firewall blocking connections

Check `healthCheckFailures` metric and logs for details.
