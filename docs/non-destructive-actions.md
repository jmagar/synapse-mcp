# Non-Destructive Actions - Synapse MCP

Complete reference of all read-only operations available in the Synapse MCP server.

## Overview

This document lists all non-destructive (read-only) actions that can be safely executed without modifying system state. These operations only read and display information.

**Total Non-Destructive Actions: 43**
- **flux**: 24 read-only operations
- **scout**: 19 read-only operations

---

## flux Tool - Docker Infrastructure Management

### Container Operations (Read-Only)

| Action | Description |
|--------|-------------|
| `container:list` | List all containers across configured hosts |
| `container:inspect` | Inspect detailed container configuration |
| `container:logs` | View container logs with filtering options |
| `container:stats` | View real-time container resource statistics |
| `container:top` | View processes running inside a container |
| `container:search` | Search Docker Hub for container images |

### Compose Operations (Read-Only)

| Action | Description |
|--------|-------------|
| `compose:list` | List all Docker Compose projects (supports optional host for multi-host aggregation) |
| `compose:status` | Get compose project status with service details (supports auto-discovery) |
| `compose:logs` | View compose project logs with filtering and grep support |

**Auto-Discovery Features:**
- `compose:list` without `host` parameter aggregates projects from all configured hosts
- `compose:status` without `host` parameter automatically discovers which host has the project

### Docker Operations (Read-Only)

| Action | Description |
|--------|-------------|
| `docker:df` | Show Docker disk usage breakdown |
| `docker:images` | List all Docker images |
| `docker:info` | Show Docker system information |
| `docker:networks` | List all Docker networks |
| `docker:volumes` | List all Docker volumes |

### Host Operations (All Read-Only)

| Action | Description |
|--------|-------------|
| `host:doctor` | Run diagnostic checks on Docker host configuration |
| `host:info` | Get comprehensive host system information |
| `host:mounts` | List all filesystem mounts |
| `host:network` | Show network configuration and interfaces |
| `host:ports` | List all container port mappings |
| `host:resources` | Show CPU, RAM, and disk usage statistics |
| `host:services` | List systemd services and their status |
| `host:status` | Show overall host health status |
| `host:uptime` | Show system uptime and load averages |

### Help

| Action | Description |
|--------|-------------|
| `help` | Show auto-generated documentation for all available actions |

---

## scout Tool - SSH Remote Operations

### Simple Actions (Read-Only)

| Action | Description |
|--------|-------------|
| `nodes` | List all available SSH nodes/hosts |
| `peek` | Read file contents from remote host |
| `find` | Search for files matching a pattern |
| `delta` | Compare differences between files |
| `ps` | List running processes on remote host |
| `df` | Show disk usage statistics |

### ZFS Operations (Read-Only)

| Action | Description |
|--------|-------------|
| `zfs:pools` | List all ZFS storage pools |
| `zfs:datasets` | List all ZFS datasets |
| `zfs:snapshots` | List all ZFS snapshots |

### Log Operations (All Read-Only)

| Action | Description |
|--------|-------------|
| `logs:syslog` | View system log files |
| `logs:journal` | View systemd journal entries |
| `logs:dmesg` | View kernel ring buffer messages |
| `logs:auth` | View authentication and security logs |

### Help

| Action | Description |
|--------|-------------|
| `help` | Show auto-generated documentation for all available actions |

---

## Usage Examples

### flux Tool Examples

```json
// List all compose projects across all hosts
{
  "action": "compose",
  "subaction": "list"
}

// Auto-discover which host has a project
{
  "action": "compose",
  "subaction": "status",
  "project": "myapp"
}

// View container logs
{
  "action": "container",
  "subaction": "logs",
  "host": "server1",
  "container": "nginx"
}

// Check host resources
{
  "action": "host",
  "subaction": "resources",
  "host": "server1"
}
```

### scout Tool Examples

```json
// List SSH nodes
{
  "action": "nodes"
}

// View file contents
{
  "action": "peek",
  "target": "/etc/hostname"
}

// View system logs
{
  "action": "logs",
  "subaction": "journal",
  "lines": 50
}

// List ZFS pools
{
  "action": "zfs",
  "subaction": "pools"
}
```

---

## Test Results (2025-12-31)

Tested against multiple hosts to verify cross-platform compatibility.

### flux Tool Status

| Category | Working | Notes |
|----------|---------|-------|
| Container (6) | 6/6 ✅ | All working |
| Compose (3) | 3/3 ✅ | All working |
| Docker (5) | 5/5 ✅ | All working |
| Host (9) | 7/9 ⚠️ | `services` works on systemd hosts; `ports`/`doctor` not implemented |
| Help (1) | 1/1 ✅ | Working |

### scout Tool Status

| Category | Working | Notes |
|----------|---------|-------|
| Simple (6) | 6/6 ✅ | nodes, peek, find, delta, ps, df all working |
| ZFS (3) | 3/3 ✅ | pools, datasets, snapshots all working |
| Logs (4) | 3/4 ⚠️ | `journal` works on systemd hosts; `auth` path varies by distro |
| Help (1) | 1/1 ✅ | Working |

### Cross-Platform Compatibility

| Action | squirts (Ubuntu) | tootie (Unraid/Slackware) |
|--------|------------------|---------------------------|
| `host:services` | ✅ Works | ❌ No systemd |
| `logs:journal` | ✅ Works | ❌ No journalctl |
| `logs:auth` | ✅ Works | ❌ Path differs |

### Not Implemented

| Action | Status |
|--------|--------|
| `host:ports` | Schema exists but handler missing |
| `host:doctor` | Schema exists but handler missing |

---

## Notes

### Optional Host Parameter

Many `flux` operations support an optional `host` parameter:

- **When specified**: Operation executes on that specific host
- **When omitted**:
  - `compose:list` - Aggregates results from all configured hosts
  - `compose:status` - Auto-discovers which host has the project
  - Other operations - May default to local host or return error

### Host Auto-Discovery

The system automatically discovers hosts from:
1. `synapse.config.json` (manual configuration)
2. `~/.ssh/config` (SSH configuration)
3. Local Docker socket (auto-detected)

### Response Formats

Most operations support `response_format` parameter:
- `markdown` (default) - Human-readable formatted output
- `json` - Machine-readable JSON output

---

## See Also

- [README.md](../README.md) - Full MCP server documentation
- [Compose Auto-Discovery](../README.md#compose-auto-discovery) - Auto-discovery feature details
