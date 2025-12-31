# Synapse MCP

MCP (Model Context Protocol) server providing **Flux** (Docker management) and **Scout** (SSH operations) tools for homelab infrastructure. The neural connection point for your distributed systems.

Designed for use with Claude Code and other MCP-compatible clients.

## Features

### Flux Tool (Docker Infrastructure Management)
- **Container lifecycle**: Start, stop, restart, pause/resume, pull, recreate, exec
- **Docker Compose**: Full project management (up, down, restart, logs, build, pull, recreate)
- **Image operations**: List, pull, build, remove Docker images
- **Host operations**: Status checks, resource monitoring, systemd services, network info
- **Log retrieval**: Advanced filtering with time ranges, grep (safe patterns only), stream selection
- **Resource monitoring**: Real-time CPU, memory, network, I/O statistics
- **Smart search**: Find containers by name, image, or labels across all hosts
- **Pagination & filtering**: All list operations support limits, offsets, and filtering

### Scout Tool (SSH Remote Operations)
- **File operations**: Read files, directory trees, file transfer (beam), diff comparison
- **Remote execution**: Execute commands with allowlist security
- **Process monitoring**: List and filter processes by user, CPU, memory
- **ZFS management**: Pools, datasets, snapshots with health monitoring
- **System logs**: Access syslog, journald, dmesg, auth logs with filtering (safe grep patterns only)
- **Disk monitoring**: Filesystem usage across all mounts
- **Multi-host operations**: Execute commands or read files across multiple hosts (emit)

### Infrastructure
- **Multi-host support**: Manage Docker and SSH across Unraid, Proxmox, bare metal
- **Auto-detect local Docker**: Automatically adds local Docker socket if available
- **Dual transport**: stdio for Claude Code, HTTP for remote access
- **O(1) validation**: Discriminated union pattern for instant schema validation
- **SSH connection pooling**: 50× faster repeated operations

## Tools

The server provides two powerful tools with discriminated union schemas for O(1) validation:

### Available Tools

#### flux

Docker infrastructure management - container, compose, docker, and host operations

#### scout

SSH remote operations - file, process, and system inspection

### Getting Help

Both tools include auto-generated help:

```json
{ "action": "help" }
{ "action": "help", "topic": "container:resume" }
{ "action": "help", "format": "json" }
```

**Breaking change from V2:** The unified tool has been completely removed and replaced with `flux` and `scout`.

---

### Tool 1: `flux` - Docker Infrastructure Management

**4 actions, 40 subactions** - State changes, lifecycle control, destructive operations.

#### Container Operations (`action: "container"`) - 14 subactions

| Subaction | Description |
| ---------|-------------|
| `list` | List containers with filtering by state, name, image, labels |
| `start` | Start a stopped container |
| `stop` | Stop a running container |
| `restart` | Restart a container |
| `pause` | Pause a running container |
| `resume` | Resume a paused container (was `unpause`) |
| `logs` | Retrieve container logs with time and grep filters |
| `stats` | Get real-time CPU, memory, network, I/O statistics |
| `inspect` | Detailed container configuration and state (with summary mode) |
| `search` | Search containers by name, image, or labels |
| `pull` | Pull latest image for a container |
| `recreate` | Recreate container with latest image |
| `exec` | Execute command inside a container (allowlist validated) |
| `top` | Show running processes in a container |

#### Docker Compose Operations (`action: "compose"`) - 10 subactions

| Subaction | Description |
| ---------|-------------|
| `list` | List Docker Compose projects (host optional, auto-discovers if omitted) |
| `status` | Get status of services in a project (host optional, auto-discovers if omitted) |
| `up` | Start a compose project (host optional, auto-discovers if omitted) |
| `down` | Stop a compose project (host optional, auto-discovers if omitted) |
| `restart` | Restart a compose project (host optional, auto-discovers if omitted) |
| `logs` | Get logs from compose project services (host optional, auto-discovers if omitted) |
| `build` | Build images for a compose project (host optional, auto-discovers if omitted) |
| `pull` | Pull images for a compose project (host optional, auto-discovers if omitted) |
| `recreate` | Force recreate containers in a project (host optional, auto-discovers if omitted) |
| `refresh` | Refresh compose project cache (force rescan) |

#### Docker System Operations (`action: "docker"`) - 9 subactions

| Subaction | Description |
| ---------|-------------|
| `info` | Get Docker daemon information |
| `df` | Get Docker disk usage (images, containers, volumes, cache) |
| `prune` | Remove unused Docker resources (requires `force: true`) |
| `images` | List Docker images on a host |
| `pull` | Pull a Docker image |
| `build` | Build a Docker image from Dockerfile |
| `rmi` | Remove a Docker image |
| `networks` | List Docker networks |
| `volumes` | List Docker volumes |

#### Host Operations (`action: "host"`) - 7 subactions

| Subaction | Description |
| ---------|-------------|
| `status` | Check Docker connectivity to host |
| `resources` | Get CPU, memory, disk usage via SSH |
| `info` | Get OS, kernel, architecture, hostname |
| `uptime` | Get system uptime |
| `services` | Get systemd service status |
| `network` | Get network interfaces and IP addresses |
| `mounts` | Get mounted filesystems |

---

### Tool 2: `scout` - SSH Remote Operations

**11 actions, 16 operations** - Read-mostly remote file and system operations.

#### Simple Actions (9)

| Action | Description |
| ------|-------------|
| `nodes` | List all configured SSH hosts |
| `peek` | Read file or directory contents (with tree mode) |
| `exec` | Execute command on remote host (allowlist validated) |
| `find` | Find files by glob pattern |
| `delta` | Compare files or content between locations |
| `emit` | Multi-host operations (read files or execute commands) |
| `beam` | File transfer between local/remote or remote/remote |
| `ps` | List and search processes with filtering |
| `df` | Disk usage information |

#### ZFS Operations (`action: "zfs"`) - 3 subactions

| Subaction | Description |
| ---------|-------------|
| `pools` | List ZFS storage pools with health status |
| `datasets` | List ZFS datasets (filesystems and volumes) |
| `snapshots` | List ZFS snapshots |

#### Log Operations (`action: "logs"`) - 4 subactions

| Subaction | Description |
| ---------|-------------|
| `syslog` | Access system log files (/var/log) |
| `journal` | Access systemd journal logs with unit filtering |
| `dmesg` | Access kernel ring buffer logs |
| `auth` | Access authentication logs |

---

## Compose Auto-Discovery

The MCP server automatically discovers and caches Docker Compose project locations, eliminating the need to specify file paths for every operation.

### How It Works

The discovery system uses a multi-layer approach:

1. **Cache Check**: Looks up project in local cache (`.cache/compose-projects/`)
2. **Docker List**: Queries `docker compose ls` for running projects
3. **Filesystem Scan**: Scans configured search paths for compose files
4. **Error**: Returns error if project not found in any layer

Discovery results are cached for 24 hours (configurable via `COMPOSE_CACHE_TTL_HOURS` environment variable).

### Configuration

Add optional `composeSearchPaths` to your host configuration:

```json
{
  "hosts": [
    {
      "name": "my-host",
      "host": "192.168.1.100",
      "protocol": "ssh",
      "composeSearchPaths": ["/opt/stacks", "/srv/docker"]
    }
  ]
}
```

**Default search paths**: `["/compose", "/mnt/cache/compose", "/mnt/cache/code"]` if not specified.

### Optional Host Parameter

Most compose operations accept an optional `host` parameter. When omitted, the system automatically searches all configured hosts in parallel to find the project:

```json
// Explicit host (faster - no search needed)
{ "action": "compose", "subaction": "up", "project": "plex", "host": "server1" }

// Auto-discover (searches all hosts in parallel)
{ "action": "compose", "subaction": "up", "project": "plex" }
```

Auto-discovery times out after 30 seconds if the project cannot be found on any host. If a project exists on multiple hosts, you'll receive an error asking you to specify the `host` parameter explicitly.

### Cache Management

- **TTL**: 24 hours (default, configurable)
- **Storage**: `.cache/compose-projects/` directory (gitignored)
- **Invalidation**: Automatic when operations fail due to stale paths
- **Manual Refresh**: Use `compose:refresh` subaction

### Manual Cache Refresh

Force a cache refresh by scanning the filesystem:

```json
// Refresh all hosts
{ "action": "compose", "subaction": "refresh" }

// Refresh specific host
{ "action": "compose", "subaction": "refresh", "host": "server1" }
```

Returns a list of discovered projects with their paths and discovery source (docker-ls or filesystem scan).

### Architecture

```
┌─────────────┐
│   Handler   │
└──────┬──────┘
       │
       v
┌──────────────┐      ┌──────────────┐
│ HostResolver │─────>│  Discovery   │
└──────────────┘      └──────┬───────┘
                             │
                    ┌────────┴────────┐
                    v                 v
             ┌──────────┐      ┌──────────┐
             │  Cache   │      │ Scanner  │
             └──────────┘      └──────────┘
```

**Components**:
- **HostResolver**: Finds which host contains the project (parallel search)
- **ComposeDiscovery**: Orchestrates cache, docker-ls, and filesystem scanning
- **ComposeProjectCache**: File-based cache with TTL validation
- **ComposeScanner**: Filesystem scanning for compose files (respects max depth of 3)

---

## Example Usage

### Flux Tool Examples

```json
// List running containers
{ "tool": "flux", "action": "container", "subaction": "list", "state": "running" }

// Restart a container
{ "tool": "flux", "action": "container", "subaction": "restart", "container_id": "plex", "host": "tootie" }

// Start a compose project (auto-discovers location and host)
{ "tool": "flux", "action": "compose", "subaction": "up", "project": "media-stack" }

// Start a compose project on specific host
{ "tool": "flux", "action": "compose", "subaction": "up", "host": "tootie", "project": "media-stack" }

// Refresh compose project cache
{ "tool": "flux", "action": "compose", "subaction": "refresh" }

// Get host resources
{ "tool": "flux", "action": "host", "subaction": "resources", "host": "tootie" }

// Pull an image
{ "tool": "flux", "action": "docker", "subaction": "pull", "host": "tootie", "image": "nginx:latest" }

// Execute command in container
{ "tool": "flux", "action": "container", "subaction": "exec", "container_id": "nginx", "command": "nginx -t" }
```

### Scout Tool Examples

```json
// List configured SSH hosts
{ "tool": "scout", "action": "nodes" }

// Read a remote file
{ "tool": "scout", "action": "peek", "target": "tootie:/etc/nginx/nginx.conf" }

// Show directory tree
{ "tool": "scout", "action": "peek", "target": "dookie:/var/log", "tree": true }

// Execute remote command
{ "tool": "scout", "action": "exec", "target": "tootie:/var/www", "command": "du -sh *" }

// Transfer file between hosts
{ "tool": "scout", "action": "beam", "source": "tootie:/tmp/backup.tar.gz", "destination": "dookie:/backup/" }

// Check ZFS pool health
{ "tool": "scout", "action": "zfs", "subaction": "pools", "host": "dookie" }

// View systemd journal
{ "tool": "scout", "action": "logs", "subaction": "journal", "host": "tootie", "unit": "docker.service" }

// Multi-host command execution
{ "tool": "scout", "action": "emit", "targets": ["tootie:/tmp", "dookie:/tmp"], "command": "df -h" }
```

## Installation

```bash
# Clone or copy the server files
cd synapse-mcp

# Install dependencies
pnpm install

# Build
pnpm run build
```

The server will create a `.cache/compose-projects/` directory for storing discovered project locations. This directory is automatically gitignored.

## Configuration

### SSH Config Auto-Loading

**Zero configuration required!** Synapse-MCP automatically discovers hosts from your `~/.ssh/config` file.

All SSH hosts with a `HostName` directive are automatically available for Docker management via SSH tunneling to the remote Docker socket. Manual configuration is completely optional.

**Priority order:**
1. Manual config file (highest) - `synapse.config.json`
2. `SYNAPSE_HOSTS_CONFIG` environment variable
3. **SSH config auto-discovery** - `~/.ssh/config`
4. Local Docker socket (fallback)

**Example SSH config:**

```ssh-config
Host production
  HostName 192.168.1.100
  User admin
  Port 22
  IdentityFile ~/.ssh/id_ed25519

Host staging
  HostName 192.168.1.101
  User deploy
  Port 2222
  IdentityFile ~/.ssh/staging_key
```

Both hosts are immediately available as `flux` targets with SSH tunneling to `/var/run/docker.sock`. No additional configuration needed!

**Manual override:** If you create a `synapse.config.json` entry with the same name as an SSH host, the manual config completely replaces the SSH config (no merging).

### Manual Configuration (Optional)

Create a config file at one of these locations (checked in order):

1. Path in `SYNAPSE_CONFIG_FILE` env var
2. `./synapse.config.json` (current directory)
3. `~/.config/synapse-mcp/config.json`
4. `~/.synapse-mcp.json`

### Example Config

```json
{
  "hosts": [
    {
      "name": "local",
      "host": "localhost",
      "protocol": "ssh",
      "dockerSocketPath": "/var/run/docker.sock",
      "tags": ["development"]
    },
    {
      "name": "production",
      "host": "192.168.1.100",
      "port": 22,
      "protocol": "ssh",
      "sshUser": "admin",
      "sshKeyPath": "~/.ssh/id_rsa",
      "tags": ["production"]
    },
    {
      "name": "unraid",
      "host": "unraid.local",
      "port": 2375,
      "protocol": "http",
      "tags": ["media", "storage"]
    }
  ]
}
```

Copy `synapse.config.example.json` as a starting point:
```bash
cp synapse.config.example.json ~/.config/synapse-mcp/config.json
# or
cp synapse.config.example.json ~/.synapse-mcp.json
```

> **Note:** If `/var/run/docker.sock` exists and isn't already in your config, it will be automatically added as a host using your machine's hostname. This means the server works out-of-the-box for local Docker without any configuration.

### Host Configuration Options

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | `string` | Unique identifier for the host |
| `host` | `string` | Hostname or IP address |
| `port` | `number` | Docker API port (default: 2375) |
| `protocol` | `"http"` / `"https"` / `"ssh"` | Connection protocol |
| `dockerSocketPath` | `string` | Path to Docker socket (for local connections) |
| `sshUser` | `string` | SSH username for remote connections (protocol: "ssh") |
| `sshKeyPath` | `string` | Path to SSH private key for authentication |
| `tags` | `string[]` | Optional tags for filtering |

### Local vs Remote Execution

The server automatically determines whether to use **local execution** or **SSH** based on your host configuration:

#### Local Execution (No SSH)

Commands run directly on localhost using Node.js for best performance:

```json
{
  "name": "local",
  "host": "localhost",
  "protocol": "ssh",
  "dockerSocketPath": "/var/run/docker.sock"
}
```

**Requirements**: Host must be `localhost`/`127.x.x.x`/`::1` AND no `sshUser` specified.

**Benefits**:
- ~10x faster than SSH for Compose and host operations
- No SSH key management needed
- Works out of the box

#### Remote Execution (SSH)

Commands run via SSH on remote hosts or when `sshUser` is specified:

```json
{
  "name": "production",
  "host": "192.168.1.100",
  "protocol": "ssh",
  "sshUser": "admin",
  "sshKeyPath": "~/.ssh/id_rsa"
}
```

**When SSH is used**:
- Host is NOT localhost/127.x.x.x
- `sshUser` is specified (even for localhost)
- For all Scout operations (file operations always use SSH)

#### Docker API vs Command Execution

These are independent:

| Operation | Local Host | Remote Host |
|-----------|-----------|-------------|
| Docker API (container list, stats) | Unix socket | HTTP |
| Commands (compose, systemctl) | Local `execFile` | SSH |

See [.docs/local-vs-remote-execution.md](.docs/local-vs-remote-execution.md) for detailed architecture documentation.

### Resource Limits & Defaults

| Setting | Value | Description |
| -------|-------|-------------|
| `CHARACTER_LIMIT` | 40,000 | Maximum response size (~12.5k tokens) |
| `DEFAULT_LIMIT` | 20 | Default pagination limit for list operations |
| `MAX_LIMIT` | 100 | Maximum pagination limit |
| `DEFAULT_LOG_LINES` | 50 | Default number of log lines to fetch |
| `MAX_LOG_LINES` | 500 | Maximum log lines allowed |
| `API_TIMEOUT` | 30s | Docker API operation timeout |
| `STATS_TIMEOUT` | 5s | Stats collection timeout |

### Enabling Docker API on Hosts

#### Unraid
Docker API is typically available at port 2375 by default.

#### Standard Docker (systemd)
Edit `/etc/docker/daemon.json`:
```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"]
}
```

Or override the systemd service:
```bash
sudo systemctl edit docker.service
```
```ini
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
```

⚠️ **Security Note**: Exposing Docker API without TLS is insecure. Use on trusted networks only, or set up TLS certificates.

## Usage

### With Claude Code

Add to `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["/absolute/path/to/synapse-mcp/dist/index.js"],
      "env": {
        "SYNAPSE_CONFIG_FILE": "/home/youruser/.config/synapse-mcp/config.json"
      }
    }
  }
}
```

Or if your config is in one of the default locations, you can skip the env entirely:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["/absolute/path/to/synapse-mcp/dist/index.js"]
    }
  }
}
```

Then in Claude Code:
```
> List all running containers on tootie (uses flux tool)
> Restart the plex container (uses flux tool)
> Show me the logs from sonarr with errors in the last hour (uses flux tool)
> Which containers are using the most memory? (uses flux tool)
> Read the nginx config on tootie (uses scout tool)
> Check ZFS pool health on dookie (uses scout tool)
> Show me systemd journal errors from the last hour (uses scout tool)
```

### HTTP Mode

For remote access or multi-client scenarios:

```bash
# Start HTTP server
node dist/index.js --http

# Server runs on http://127.0.0.1:3000/mcp
# Health check: http://127.0.0.1:3000/health
```

Environment variables for HTTP mode:
- `PORT`: Server port (default: 3000)
- `HOST`: Bind address (default: 127.0.0.1)

### CLI Help

```bash
node dist/index.js --help
```

## Example Interactions

### Flux Tool - Container Management
```
User: What containers are running on tootie?

Claude: [calls flux with action="container", subaction="list", host="tootie", state="running"]

I found 23 running containers on tootie:

🟢 plex (tootie) - Image: linuxserver/plex | Up 3 days
🟢 sonarr (tootie) - Image: linuxserver/sonarr | Up 3 days
🟢 radarr (tootie) - Image: linuxserver/radarr | Up 3 days
...
```

### Flux Tool - Log Analysis
```
User: Show me any errors from nginx in the last hour

Claude: [calls flux with action="container", subaction="logs",
        container_id="nginx", since="1h", grep="error"]

Found 3 error entries in nginx logs:
[14:23:15] 2024/12/15 14:23:15 [error] connect() failed...
```

### Scout Tool - Remote File Access
```
User: Read the nginx config on tootie

Claude: [calls scout with action="peek", target="tootie:/etc/nginx/nginx.conf"]

Here's the nginx configuration from tootie:

user nginx;
worker_processes auto;
...
```

### Scout Tool - ZFS Health Check
```
User: Check ZFS pool health on dookie

Claude: [calls scout with action="zfs", subaction="pools", host="dookie"]

ZFS Pools on dookie:

tank - ONLINE | Size: 24TB | Free: 8.2TB | Health: 100%
backup - ONLINE | Size: 12TB | Free: 5.1TB | Health: 100%
```

### Scout Tool - System Logs
```
User: Show me Docker service errors from systemd journal

Claude: [calls scout with action="logs", subaction="journal",
        host="tootie", unit="docker.service", priority="err"]

Recent errors from docker.service:

[15:42:10] Failed to allocate directory watch: Too many open files
[15:42:15] containerd: connection error: desc = "transport: error while dialing"
```

## Security

### Path Traversal Protection (CWE-22)

The `image_build` tool implements strict path validation to prevent directory traversal attacks:

- **Absolute paths required**: All paths (context, dockerfile) must start with `/`
- **Traversal blocked**: Paths containing `..` or `.` components are rejected
- **Character validation**: Only alphanumeric, dots (in filenames), hyphens, underscores, and forward slashes allowed
- **Pre-execution validation**: Paths validated before SSH commands are executed

Example of rejected paths:
```bash
# Rejected: Directory traversal
../../../etc/passwd
/app/../../../etc/passwd

# Rejected: Relative paths
./build
relative/path

# Accepted: Absolute paths without traversal
/home/user/docker/build
/opt/myapp/Dockerfile.prod
```

### General Security Notes

- Docker API on port 2375 is insecure without TLS
- Always use execFile for shell commands (prevents injection)
- Validate host config fields with regex
- Require force=true for destructive operations

## Development

```bash
# Watch mode for development
pnpm run dev

# Build
pnpm run build

# Run tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

```
synapse-mcp/
├── src/
│   ├── index.ts                         # Entry point, transport setup
│   ├── types.ts                         # TypeScript interfaces
│   ├── constants.ts                     # Configuration constants
│   ├── config/
│   │   └── command-allowlist.json       # Allowed commands for scout:exec
│   ├── formatters/
│   │   ├── index.ts                     # Response formatting utilities
│   │   └── formatters.test.ts           # Formatter tests
│   ├── tools/
│   │   ├── index.ts                     # Tool registration router
│   │   ├── flux.ts                      # Flux tool handler + routing
│   │   ├── scout.ts                     # Scout tool handler + routing
│   │   ├── container.ts                 # handleContainerAction()
│   │   ├── compose.ts                   # handleComposeAction()
│   │   ├── docker.ts                    # handleDockerAction()
│   │   └── host.ts                      # handleHostAction()
│   ├── services/
│   │   ├── docker.ts                    # DockerService
│   │   ├── compose.ts                   # ComposeService
│   │   ├── ssh.ts                       # SSHService
│   │   └── scout/                       # Scout-specific services
│   │       ├── pool.ts                  # SSH connection pool
│   │       ├── executors.ts             # Command execution
│   │       └── transfer.ts              # File transfer (beam)
│   ├── schemas/
│   │   ├── index.ts                     # FluxSchema + ScoutSchema exports
│   │   ├── common.ts                    # Shared schemas (pagination, response_format)
│   │   ├── container.ts                 # Container subaction schemas
│   │   ├── compose.ts                   # Compose subaction schemas
│   │   ├── docker.ts                    # Docker subaction schemas
│   │   ├── host.ts                      # Host subaction schemas
│   │   └── scout.ts                     # Scout action schemas
│   └── lint.test.ts                     # Linting tests
├── dist/                                 # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### Key Architectural Decisions

**V3 Schema Refactor - Two Tools Pattern**:
- **Flux**: 4 actions (container, compose, docker, host) with 40 total subactions
- **Scout**: 11 actions (9 simple + 2 with subactions) for 16 total operations
- Clean separation: Flux = Docker/state changes, Scout = SSH/read operations
- Total: 56 discriminator keys across both tools

**Discriminated Union for O(1) Validation**:
- **Flux**: Composite `action_subaction` discriminator (`container:list`, `compose:up`, etc.)
- **Scout**: Primary `action` discriminator with nested discriminators for `zfs` and `logs`
- Validation latency: <0.005ms average across all operations
- Zero performance degradation regardless of which operation is called

**Help System**:
- Auto-generated help handlers for both tools
- Introspects Zod schemas using `.describe()` metadata
- Supports topic-specific help (e.g., `flux help container:logs`)
- Available in markdown or JSON format

**SSH Connection Pooling**:
- 50× faster for repeated operations
- Automatic idle timeout and health checks
- Configurable pool size and connection reuse
- Transparent integration (no code changes required)

**Test Coverage**:
- Unit tests for all services, schemas, and tools
- Integration tests for end-to-end workflows
- Performance benchmarks for schema validation
- TDD approach for all new features

## Performance

### Schema Validation

Both Flux and Scout tools use Zod discriminated union for O(1) constant-time schema validation:

- **Validation latency**: <0.005ms average across all 55 operations
- **Flux optimization**: Composite `action_subaction` discriminator with preprocessor
- **Scout optimization**: Primary `action` discriminator with nested discriminators for zfs/logs
- **Consistency**: All operations perform identically fast (no worst-case scenarios)

Flux inputs are automatically preprocessed to inject the `action_subaction` discriminator key.

### SSH Connection Pooling

All SSH operations use connection pooling for optimal performance:

- **50× faster** for repeated operations
- Connections reused across compose operations
- Automatic idle timeout and health checks
- Configurable via environment variables

See [docs/ssh-connection-pooling.md](docs/ssh-connection-pooling.md) for details.

**Key Benefits:**
- Eliminate 250ms connection overhead per operation
- Support high-concurrency scenarios (configurable pool size)
- Automatic connection cleanup and health monitoring
- Zero code changes required (transparent integration)

### Benchmarks

Run performance benchmarks:

```bash
npm run test:bench
```

Expected results:
- Worst-case validation: <0.005ms (0.003ms typical)
- Average-case validation: <0.005ms (0.003ms typical)
- Performance variance: <0.001ms (proves O(1) consistency)

## License

MIT
