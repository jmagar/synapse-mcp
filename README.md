# homelab-mcp-server

MCP (Model Context Protocol) server for managing Docker infrastructure across multiple homelab hosts. Designed for use with Claude Code and other MCP-compatible clients.

## Features

- **Multi-host support**: Manage containers across Unraid, Proxmox, bare metal servers, and more
- **Auto-detect local Docker**: Automatically adds local Docker socket if available
- **Container lifecycle**: Start, stop, restart, pause/unpause, pull, recreate containers
- **Docker Compose**: Full project management (up, down, restart, logs, build, pull, recreate)
- **Image operations**: List, pull, build, and remove Docker images
- **Log retrieval**: Fetch logs with time filters, grep, and stream selection
- **Resource monitoring**: Real-time CPU, memory, network, and I/O statistics
- **Smart search**: Find containers by name, image, or labels across all hosts
- **Detailed inspection**: Full container configuration and state information (with summary mode)
- **Pagination & filtering**: All list operations support limits, offsets, and filtering
- **Dual transport**: stdio for Claude Code, HTTP for remote access
- **SSH support**: Execute commands on remote hosts for resource monitoring

## Tool

The server provides a single unified tool `homelab` with multiple actions and subactions:

### Container Operations (`action: "container"`)

| Subaction | Description |
|-----------|-------------|
| `list` | List containers with filtering by state, name, image, labels |
| `start` | Start a stopped container |
| `stop` | Stop a running container |
| `restart` | Restart a container |
| `pause` | Pause a running container |
| `unpause` | Unpause a paused container |
| `logs` | Retrieve container logs with time and grep filters |
| `stats` | Get real-time CPU, memory, network, I/O statistics |
| `inspect` | Detailed container configuration and state (with summary mode) |
| `search` | Search containers by name, image, or labels |
| `pull` | Pull latest image for a container |
| `recreate` | Recreate container with latest image |

### Docker Compose Operations (`action: "compose"`)

| Subaction | Description |
|-----------|-------------|
| `list` | List Docker Compose projects on a host |
| `status` | Get status of services in a project |
| `up` | Start a compose project |
| `down` | Stop a compose project |
| `restart` | Restart a compose project |
| `logs` | Get logs from compose project services |
| `build` | Build images for a compose project |
| `pull` | Pull images for a compose project |
| `recreate` | Force recreate containers in a project |

### Host Operations (`action: "host"`)

| Subaction | Description |
|-----------|-------------|
| `status` | Check connectivity and container counts per host |
| `resources` | Get CPU, memory, disk usage via SSH |

### Docker System Operations (`action: "docker"`)

| Subaction | Description |
|-----------|-------------|
| `info` | Get Docker version, resources, and system info |
| `df` | Get Docker disk usage (images, containers, volumes, cache) |
| `prune` | Remove unused Docker resources (requires `force: true`) |

### Image Operations (`action: "image"`)

| Subaction | Description |
|-----------|-------------|
| `list` | List Docker images on a host |
| `pull` | Pull a Docker image |
| `build` | Build a Docker image from a Dockerfile |
| `remove` | Remove a Docker image (requires `force: true` if in use) |

### Example Usage

```typescript
// List running containers
{ action: "container", subaction: "list", state: "running" }

// Restart a container
{ action: "container", subaction: "restart", container_id: "plex", host: "unraid" }

// Start a compose project
{ action: "compose", subaction: "up", host: "unraid", project: "media-stack" }

// Get host resources
{ action: "host", subaction: "resources", host: "unraid" }

// Pull an image
{ action: "image", subaction: "pull", host: "unraid", image: "nginx:latest" }
```

## Installation

```bash
# Clone or copy the server files
cd homelab-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

Create a config file at one of these locations (checked in order):

1. Path in `HOMELAB_CONFIG_FILE` env var
2. `./homelab.config.json` (current directory)  
3. `~/.config/homelab-mcp/config.json`
4. `~/.homelab-mcp.json`

### Example Config

```json
{
  "hosts": [
    {
      "name": "unraid",
      "host": "unraid.local",
      "port": 2375,
      "protocol": "http",
      "tags": ["media", "storage"]
    },
    {
      "name": "proxmox-docker",
      "host": "192.168.1.100",
      "port": 2375,
      "protocol": "http",
      "tags": ["vms"]
    },
    {
      "name": "local",
      "host": "localhost",
      "protocol": "http",
      "dockerSocketPath": "/var/run/docker.sock"
    }
  ]
}
```

Copy `homelab.config.example.json` as a starting point:
```bash
cp homelab.config.example.json ~/.config/homelab-mcp/config.json
# or
cp homelab.config.example.json ~/.homelab-mcp.json
```

> **Note:** If `/var/run/docker.sock` exists and isn't already in your config, it will be automatically added as a host using your machine's hostname. This means the server works out-of-the-box for local Docker without any configuration.

### Host Configuration Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier for the host |
| `host` | string | Hostname or IP address |
| `port` | number | Docker API port (default: 2375) |
| `protocol` | "http" \| "https" \| "ssh" | Connection protocol |
| `dockerSocketPath` | string | Path to Docker socket (for local connections) |
| `sshUser` | string | SSH username for remote connections (protocol: "ssh") |
| `sshKeyPath` | string | Path to SSH private key for authentication |
| `tags` | string[] | Optional tags for filtering |

### Resource Limits & Defaults

| Setting | Value | Description |
|---------|-------|-------------|
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
    "homelab": {
      "command": "node",
      "args": ["/absolute/path/to/homelab-mcp-server/dist/index.js"],
      "env": {
        "HOMELAB_CONFIG_FILE": "/home/youruser/.config/homelab-mcp/config.json"
      }
    }
  }
}
```

Or if your config is in one of the default locations, you can skip the env entirely:

```json
{
  "mcpServers": {
    "homelab": {
      "command": "node",
      "args": ["/absolute/path/to/homelab-mcp-server/dist/index.js"]
    }
  }
}
```

Then in Claude Code:
```
> /mcp

> List all running containers on unraid
> Restart the plex container
> Show me the logs from sonarr with errors in the last hour
> Which containers are using the most memory?
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

### List containers
```
User: What containers are running on my homelab?

Claude: [calls homelab with action="container", subaction="list", state="running"]

I found 47 running containers across your hosts:

🟢 plex (unraid) - Image: linuxserver/plex | Up 3 days
🟢 sonarr (unraid) - Image: linuxserver/sonarr | Up 3 days
🟢 radarr (unraid) - Image: linuxserver/radarr | Up 3 days
...
```

### Check logs
```
User: Show me any errors from nginx in the last hour

Claude: [calls homelab with action="container", subaction="logs",
        container_id="nginx", since="1h", grep="error"]

Found 3 error entries in nginx logs:
[14:23:15] 2024/12/15 14:23:15 [error] connect() failed...
```

### Resource monitoring
```
User: Which containers are using the most CPU?

Claude: [calls homelab with action="container", subaction="stats"]

Top CPU consumers:
| Container | Host | CPU% | Memory |
|-----------|------|------|--------|
| plex | unraid | 45.2% | 2.1 GB |
| handbrake | unraid | 23.8% | 1.4 GB |
```

### Compose operations
```
User: Start my media stack

Claude: [calls homelab with action="compose", subaction="up",
        host="unraid", project="media-stack"]

Started media-stack compose project with 5 services:
✓ sonarr - Running
✓ radarr - Running
✓ jackett - Running
✓ transmission - Running
✓ plex - Running
```

### Image management
```
User: Pull the latest nginx image on unraid

Claude: [calls homelab with action="image", subaction="pull",
        host="unraid", image="nginx:latest"]

Successfully pulled nginx:latest
Digest: sha256:abc123...
Size: 142 MB
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
npm run dev

# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

```
homelab-mcp-server/
├── src/
│   ├── index.ts                         # Entry point, transport setup
│   ├── types.ts                         # TypeScript interfaces
│   ├── constants.ts                     # Configuration constants
│   ├── formatters/
│   │   ├── index.ts                     # Response formatting utilities
│   │   └── formatters.test.ts           # Formatter tests
│   ├── tools/
│   │   ├── index.ts                     # Tool registration router
│   │   ├── unified.ts                   # Unified homelab tool implementation
│   │   ├── unified.test.ts              # Unit tests
│   │   └── unified.integration.test.ts  # Integration tests
│   ├── services/
│   │   ├── docker.ts                    # Docker API client
│   │   ├── docker.test.ts               # Docker service tests
│   │   ├── compose.ts                   # Docker Compose management
│   │   ├── compose.test.ts              # Compose service tests
│   │   ├── ssh.ts                       # SSH host resource monitoring
│   │   └── ssh.test.ts                  # SSH service tests
│   ├── schemas/
│   │   ├── index.ts                     # Legacy schema exports
│   │   ├── unified.ts                   # Unified action/subaction schemas
│   │   └── unified.test.ts              # Schema validation tests
│   └── lint.test.ts                     # Linting tests
├── dist/                                 # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### Key Architectural Changes

**Unified Tool Pattern** (Commit 07fccbd, 12/18/2025):
- Consolidated 15 individual tools into a single `homelab` tool
- Action/subaction routing pattern for better organization
- Single entry point with type-safe parameter validation

**Formatting Module** (Commit 147d563):
- Extracted 40+ formatting helpers to dedicated `formatters/` module
- Markdown output for all tool responses
- Consistent formatting across all operations

**Docker Compose Support** (Commit ec88df9):
- Full compose project lifecycle management
- Service-level operations and filtering
- Build, pull, and recreate capabilities

**Discriminated Union Optimization** (Commit f8e6e27, 12/24/2025):
- Migrated schema validation from O(n) sequential to O(1) discriminated union
- Uses composite `action_subaction` discriminator for instant schema lookup
- Achieved <0.005ms validation latency across all 30 operations
- Zero performance degradation regardless of which operation is called

**Test Coverage**:
- Unit tests for all services, schemas, and tools
- Integration tests for end-to-end workflows
- Performance benchmarks for schema validation
- 8 test files covering core functionality

## Performance

### Schema Validation

The unified tool uses Zod discriminated union for O(1) constant-time schema validation:

- **Validation latency**: <0.005ms average across all 30 operations
- **Optimization**: Discriminated union with `action_subaction` composite key
- **Consistency**: All operations perform identically fast (no worst-case scenarios)

All inputs are automatically preprocessed to inject the discriminator key, maintaining backward compatibility.

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
