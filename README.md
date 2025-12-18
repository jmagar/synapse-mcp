# homelab-mcp-server

MCP (Model Context Protocol) server for managing Docker infrastructure across multiple homelab hosts. Designed for use with Claude Code and other MCP-compatible clients.

## Features

- **Multi-host support**: Manage containers across Unraid, Proxmox, bare metal servers, and more
- **Auto-detect local Docker**: Automatically adds local Docker socket if available
- **Container lifecycle**: Start, stop, restart, pause/unpause containers
- **Log retrieval**: Fetch logs with time filters, grep, and stream selection
- **Resource monitoring**: Real-time CPU, memory, network, and I/O statistics
- **Smart search**: Find containers by name, image, or labels across all hosts
- **Detailed inspection**: Full container configuration and state information
- **Dual transport**: stdio for Claude Code, HTTP for remote access

## Tools

| Tool | Description |
|------|-------------|
| `homelab_list_containers` | List containers with filtering by state, name, image, labels |
| `homelab_container_action` | Start/stop/restart/pause/unpause containers |
| `homelab_get_logs` | Retrieve container logs with time and grep filters |
| `homelab_container_stats` | Get CPU, memory, network, I/O statistics |
| `homelab_inspect_container` | Detailed container configuration and state |
| `homelab_host_status` | Check connectivity and container counts per host |
| `homelab_search_containers` | Search containers by name, image, or labels |
| `homelab_docker_info` | Get Docker version, resources, and system info per host |
| `homelab_docker_df` | Get Docker disk usage (images, containers, volumes, cache) |
| `homelab_prune` | Remove unused Docker resources (requires force=true) |
| `homelab_host_resources` | Get host CPU, memory, disk usage via SSH |

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
| `protocol` | "http" \| "https" | Connection protocol |
| `dockerSocketPath` | string | Path to Docker socket (for local connections) |
| `tags` | string[] | Optional tags for filtering |

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

Claude: [calls homelab_list_containers with state="running"]

I found 47 running containers across your hosts:

🟢 plex (unraid) - Image: linuxserver/plex | Up 3 days
🟢 sonarr (unraid) - Image: linuxserver/sonarr | Up 3 days
🟢 radarr (unraid) - Image: linuxserver/radarr | Up 3 days
...
```

### Check logs
```
User: Show me any errors from nginx in the last hour

Claude: [calls homelab_get_logs with container_id="nginx", since="1h", grep="error"]

Found 3 error entries in nginx logs:
[14:23:15] 2024/12/15 14:23:15 [error] connect() failed...
```

### Resource monitoring
```
User: Which containers are using the most CPU?

Claude: [calls homelab_container_stats]

Top CPU consumers:
| Container | Host | CPU% | Memory |
|-----------|------|------|--------|
| plex | unraid | 45.2% | 2.1 GB |
| handbrake | unraid | 23.8% | 1.4 GB |
```

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
│   ├── index.ts          # Entry point, transport setup
│   ├── types.ts          # TypeScript interfaces
│   ├── constants.ts      # Configuration constants
│   ├── tools/
│   │   └── index.ts      # MCP tool definitions
│   ├── services/
│   │   ├── docker.ts     # Docker API client
│   │   └── ssh.ts        # SSH host resource monitoring
│   └── schemas/
│       └── index.ts      # Zod validation schemas
├── dist/                  # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
