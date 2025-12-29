# Flux & Scout — MCP Tools Schema (V2)

## Overview

Two MCP tools with discriminated union pattern for O(1) validation:

| Tool    | Actions | Subactions | Help Handler | Purpose                                      |
|---------|---------|------------|--------------|----------------------------------------------|
| `flux`  | 4       | 39         | ✅           | Docker infrastructure management (read/write) |
| `scout` | 11      | 7          | ✅           | SSH remote operations (read-mostly)           |

**Total: 15 actions, 55 operations (discriminator keys) + auto-generated help handlers**

**Breakdown**:
- **Flux**: 4 actions, each with multiple subactions (14 + 9 + 9 + 7 = 39 operations)
- **Scout**: 11 actions (9 simple + 2 with subactions: zfs=3, logs=4 → 7 total subactions = 16 operations)

---

## Tool 1: `flux`

Docker infrastructure management. State changes, lifecycle control, destructive operations.

| Action      | Subactions | Purpose                              |
|-------------|------------|--------------------------------------|
| `container` | 14         | Container lifecycle management       |
| `compose`   | 9          | Docker Compose project management    |
| `docker`    | 9          | Docker daemon ops + image management |
| `host`      | 7          | Host-level operations                |

**Total: 4 actions, 39 subactions**

---

### 1. `container` Action (14 subactions)

Container lifecycle and inspection operations.

| Subaction   | Purpose                  | Parameters                                                                               |
|-------------|--------------------------|------------------------------------------------------------------------------------------|
| `list`      | List containers          | `host?`, `state?`, `name_filter?`, `image_filter?`, `label_filter?`, `limit?`, `offset?` |
| `start`     | Start container          | `container_id`, `host?`                                                                  |
| `stop`      | Stop container           | `container_id`, `host?`                                                                  |
| `restart`   | Restart container        | `container_id`, `host?`                                                                  |
| `pause`     | Pause container          | `container_id`, `host?`                                                                  |
| `unpause`   | Unpause container        | `container_id`, `host?`                                                                  |
| `logs`      | Container logs           | `container_id`, `host?`, `lines?`, `since?`, `until?`, `grep?`, `stream?`               |
| `stats`     | Resource usage           | `container_id?`, `host?`                                                                 |
| `inspect`   | Container details        | `container_id`, `host?`, `summary?`                                                      |
| `search`    | Search containers        | `query`, `host?`, `limit?`, `offset?`                                                    |
| `pull`      | Pull latest image        | `container_id`, `host?`                                                                  |
| `recreate`  | Recreate container       | `container_id`, `host?`, `pull?`                                                         |
| `exec`      | Run command in container | `container_id`, `host?`, `command`, `user?`, `workdir?`                                  |
| `top`       | Show container processes | `container_id`, `host?`                                                                  |

#### Parameter Details

**container_id**: Container name or ID (Docker accepts either)

**host**: Target Docker host (optional, defaults to first configured host or all hosts)

**query** (search): Full-text search string across container names, IDs, images, and labels

**state** (list): `running` | `exited` | `paused` | `restarting` | `all` (default: `all`)

**name_filter** (list): Partial match on container name (case-insensitive)

**image_filter** (list): Partial match on image name (e.g., "nginx" matches "nginx:latest")

**label_filter** (list): Key-value pairs in format `key=value` or just `key` for existence check

**limit**: Maximum results to return (default: 10, max: 100) - applies to list, search, stats

**offset**: Skip N results for pagination (default: 0) - applies to list, search

**lines** (logs): Number of log lines to retrieve (default: 100, max: 10000)

**since** (logs): ISO 8601 timestamp (e.g., "2024-01-15T10:00:00Z") or relative (e.g., "1h", "30m")

**until** (logs): ISO 8601 timestamp or relative time

**grep** (logs): Filter log lines containing this string (case-sensitive)

**stream** (logs): Controls output streams - `stdout` | `stderr` | `both` (default: `both`)

**command** (exec): Shell command to execute inside container (security: validated against allowlist)

**user** (exec): Run as specific user (default: container's default user)

**workdir** (exec): Working directory for command execution (default: container's WORKDIR)

**summary** (inspect): `true` = basic info only, `false` = full details (default: `false`)

**pull** (recreate): `true` = pull latest image before recreate, `false` = use existing (default: `true`)

#### Examples
```json
// list - List all containers
{ "action": "container", "subaction": "list" }
{ "action": "container", "subaction": "list", "state": "running" }
{ "action": "container", "subaction": "list", "state": "exited", "limit": 20 }
{ "action": "container", "subaction": "list", "name_filter": "plex", "host": "tootie" }
{ "action": "container", "subaction": "list", "image_filter": "nginx", "state": "running" }
{ "action": "container", "subaction": "list", "label_filter": "app=web", "limit": 50 }

// start - Start a stopped container
{ "action": "container", "subaction": "start", "container_id": "plex" }
{ "action": "container", "subaction": "start", "container_id": "nginx", "host": "dookie" }

// stop - Stop a running container
{ "action": "container", "subaction": "stop", "container_id": "plex" }
{ "action": "container", "subaction": "stop", "container_id": "redis", "host": "tootie" }

// restart - Restart a container
{ "action": "container", "subaction": "restart", "container_id": "plex" }
{ "action": "container", "subaction": "restart", "container_id": "nginx", "host": "dookie" }

// pause - Pause a running container
{ "action": "container", "subaction": "pause", "container_id": "plex" }

// unpause - Unpause a paused container
{ "action": "container", "subaction": "unpause", "container_id": "plex" }

// logs - Get container logs
{ "action": "container", "subaction": "logs", "container_id": "nginx" }
{ "action": "container", "subaction": "logs", "container_id": "nginx", "lines": 100, "grep": "error" }
{ "action": "container", "subaction": "logs", "container_id": "plex", "since": "1h", "stream": "stderr" }
{ "action": "container", "subaction": "logs", "container_id": "postgres", "since": "2024-01-15T10:00:00Z", "until": "2024-01-15T11:00:00Z" }

// stats - Get resource usage stats
{ "action": "container", "subaction": "stats" }
{ "action": "container", "subaction": "stats", "host": "tootie" }
{ "action": "container", "subaction": "stats", "container_id": "plex" }

// inspect - Get detailed container info
{ "action": "container", "subaction": "inspect", "container_id": "plex" }
{ "action": "container", "subaction": "inspect", "container_id": "nginx", "summary": true }

// search - Search containers by query
{ "action": "container", "subaction": "search", "query": "web" }
{ "action": "container", "subaction": "search", "query": "plex", "host": "tootie", "limit": 10 }

// pull - Pull latest image for container
{ "action": "container", "subaction": "pull", "container_id": "nginx" }
{ "action": "container", "subaction": "pull", "container_id": "plex", "host": "dookie" }

// recreate - Recreate container with optional pull
{ "action": "container", "subaction": "recreate", "container_id": "nginx" }
{ "action": "container", "subaction": "recreate", "container_id": "plex", "pull": false }

// exec - Execute command in container
{ "action": "container", "subaction": "exec", "container_id": "nginx", "command": "nginx -t" }
{ "action": "container", "subaction": "exec", "container_id": "postgres", "command": "psql -U admin -c '\\dt'", "user": "postgres" }
{ "action": "container", "subaction": "exec", "container_id": "app", "command": "ls -la /app", "workdir": "/app" }

// top - Show running processes
{ "action": "container", "subaction": "top", "container_id": "plex" }
{ "action": "container", "subaction": "top", "container_id": "nginx", "host": "tootie" }
```

---

### 2. `compose` Action (9 subactions)

Docker Compose project management.

| Subaction   | Purpose             | Parameters                                                            |
|-------------|---------------------|-----------------------------------------------------------------------|
| `list`      | List projects       | `host`, `name_filter?`, `limit?`, `offset?`                           |
| `status`    | Project status      | `host`, `project`, `service_filter?`, `limit?`, `offset?`             |
| `up`        | Start project       | `host`, `project`, `detach?`                                          |
| `down`      | Stop project        | `host`, `project`, `remove_volumes?`                                  |
| `restart`   | Restart project     | `host`, `project`                                                     |
| `logs`      | Project logs        | `host`, `project`, `service?`, `lines?`, `since?`, `until?`, `grep?`  |
| `build`     | Build images        | `host`, `project`, `service?`, `no_cache?`                            |
| `pull`      | Pull images         | `host`, `project`, `service?`                                         |
| `recreate`  | Recreate containers | `host`, `project`, `service?`                                         |

#### Parameter Details

**host**: Target Docker host (required for compose operations)

**project**: Docker Compose project name (directory name or `-p` override)

**service**: Target specific service within project (optional, applies to all services if omitted)

**name_filter** (list): Partial match on project name (case-insensitive)

**service_filter** (status): Filter to specific service(s) within project

**limit**: Maximum results to return (default: 10, max: 100)

**offset**: Skip N results for pagination (default: 0)

**detach** (up): `true` = run in background (default), `false` = attach to output

**remove_volumes** (down): `true` = delete volumes (destructive!), `false` = preserve volumes (default: `false`)

**lines** (logs): Number of log lines to retrieve (default: 100, max: 10000)

**since** (logs): ISO 8601 timestamp or relative time (e.g., "1h", "30m")

**until** (logs): ISO 8601 timestamp or relative time

**grep** (logs): Filter log lines containing this string (case-sensitive)

**no_cache** (build): `true` = rebuild from scratch, `false` = use layer cache (default: `false`)

#### Examples
```json
// list - List all compose projects
{ "action": "compose", "subaction": "list", "host": "tootie" }
{ "action": "compose", "subaction": "list", "host": "dookie", "name_filter": "app", "limit": 20 }

// status - Get project status
{ "action": "compose", "subaction": "status", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "status", "host": "dookie", "project": "homelab", "service_filter": "web" }

// up - Start compose project
{ "action": "compose", "subaction": "up", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "up", "host": "dookie", "project": "app", "detach": false }

// down - Stop compose project
{ "action": "compose", "subaction": "down", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "down", "host": "dookie", "project": "temp", "remove_volumes": true }

// restart - Restart compose project
{ "action": "compose", "subaction": "restart", "host": "tootie", "project": "plex" }

// logs - Get compose project logs
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex", "service": "server", "lines": 50, "grep": "error" }
{ "action": "compose", "subaction": "logs", "host": "dookie", "project": "app", "since": "1h", "until": "30m" }

// build - Build compose project images
{ "action": "compose", "subaction": "build", "host": "tootie", "project": "app" }
{ "action": "compose", "subaction": "build", "host": "dookie", "project": "web", "service": "frontend", "no_cache": true }

// pull - Pull compose project images
{ "action": "compose", "subaction": "pull", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "pull", "host": "dookie", "project": "app", "service": "api" }

// recreate - Recreate compose project containers
{ "action": "compose", "subaction": "recreate", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "recreate", "host": "dookie", "project": "app", "service": "worker" }
```

---

### 3. `docker` Action (9 subactions)

Docker daemon operations and image management.

| Subaction  | Purpose                 | Parameters                                                |
|------------|-------------------------|-----------------------------------------------------------|
| `info`     | Daemon info             | `host`                                                    |
| `df`       | Disk usage              | `host`                                                    |
| `prune`    | Remove unused resources | `host`, `prune_target`, `force`                           |
| `images`   | List images             | `host?`, `dangling_only?`, `limit?`, `offset?`            |
| `pull`     | Pull image              | `host`, `image`                                           |
| `build`    | Build image             | `host`, `context`, `tag`, `dockerfile?`, `no_cache?`      |
| `rmi`      | Remove image            | `host`, `image`, `force?`                                 |
| `networks` | List networks           | `host?`, `limit?`, `offset?`                              |
| `volumes`  | List volumes            | `host?`, `limit?`, `offset?`                              |

#### Parameter Details

**host**: Target Docker host (required for daemon operations)

**prune_target**: `containers` | `images` | `volumes` | `networks` | `buildcache` | `all`

**force** (prune, rmi): `true` = skip confirmation, `false` = require confirmation (default: `false`)

**dangling_only** (images): `true` = only show untagged images, `false` = show all (default: `false`)

**limit**: Maximum results to return (default: 10, max: 100) - applies to images, networks, volumes

**offset**: Skip N results for pagination (default: 0) - applies to images, networks, volumes

**image**: Image name with optional tag (e.g., "nginx:latest" or just "nginx" for latest)

**context** (build): Path to build context directory (absolute or relative to compose project)

**tag** (build): Image name:tag for the built image (e.g., "myapp:v1.0")

**dockerfile** (build): Path to Dockerfile (default: "Dockerfile" in context root)

**no_cache** (build): `true` = rebuild from scratch, `false` = use layer cache (default: `false`)

#### Examples
```json
// info - Get Docker daemon info
{ "action": "docker", "subaction": "info", "host": "tootie" }
{ "action": "docker", "subaction": "info", "host": "dookie" }

// df - Get Docker disk usage
{ "action": "docker", "subaction": "df", "host": "tootie" }

// prune - Remove unused Docker resources
{ "action": "docker", "subaction": "prune", "host": "tootie", "prune_target": "containers", "force": true }
{ "action": "docker", "subaction": "prune", "host": "dookie", "prune_target": "images", "force": false }
{ "action": "docker", "subaction": "prune", "host": "tootie", "prune_target": "volumes", "force": true }
{ "action": "docker", "subaction": "prune", "host": "dookie", "prune_target": "all", "force": true }

// images - List Docker images
{ "action": "docker", "subaction": "images", "host": "tootie" }
{ "action": "docker", "subaction": "images", "host": "dookie", "dangling_only": true }
{ "action": "docker", "subaction": "images", "host": "tootie", "limit": 50, "offset": 10 }

// pull - Pull Docker image
{ "action": "docker", "subaction": "pull", "host": "tootie", "image": "nginx:latest" }
{ "action": "docker", "subaction": "pull", "host": "dookie", "image": "postgres:16" }

// build - Build Docker image
{ "action": "docker", "subaction": "build", "host": "tootie", "context": "/app", "tag": "myapp:v1" }
{ "action": "docker", "subaction": "build", "host": "dookie", "context": "/srv/web", "tag": "web:latest", "dockerfile": "Dockerfile.prod" }
{ "action": "docker", "subaction": "build", "host": "tootie", "context": "/code", "tag": "api:dev", "no_cache": true }

// rmi - Remove Docker image
{ "action": "docker", "subaction": "rmi", "host": "tootie", "image": "nginx:old" }
{ "action": "docker", "subaction": "rmi", "host": "dookie", "image": "myapp:v0.1", "force": true }

// networks - List Docker networks
{ "action": "docker", "subaction": "networks", "host": "tootie" }
{ "action": "docker", "subaction": "networks", "host": "dookie", "limit": 20 }

// volumes - List Docker volumes
{ "action": "docker", "subaction": "volumes", "host": "tootie" }
{ "action": "docker", "subaction": "volumes", "host": "dookie", "limit": 20, "offset": 5 }
```

---

### 4. `host` Action (7 subactions)

Host-level operations.

| Subaction   | Purpose                    | Parameters                       | Status |
|-------------|----------------------------|----------------------------------|--------|
| `status`    | Docker connectivity        | `host?`                          | ✅     |
| `resources` | CPU/memory/disk via SSH    | `host?`                          | ✅     |
| `info`      | OS, kernel, arch, hostname | `host?`                          | TODO   |
| `uptime`    | System uptime              | `host?`                          | TODO   |
| `services`  | Systemd service status     | `host?`, `service?`, `state?`    | TODO   |
| `network`   | Interfaces, IPs            | `host?`                          | TODO   |
| `mounts`    | Mounted filesystems        | `host?`                          | TODO   |

#### Parameter Details

**host**: Target Docker host (optional, defaults to first configured host or all hosts)

**service** (services): Specific systemd service name (e.g., "docker", "sshd")

**state** (services): `running` | `stopped` | `failed` | `all` (default: `all`)

#### Examples
```json
// status - Check Docker connectivity
{ "action": "host", "subaction": "status" }
{ "action": "host", "subaction": "status", "host": "tootie" }

// resources - Get CPU/memory/disk usage via SSH
{ "action": "host", "subaction": "resources" }
{ "action": "host", "subaction": "resources", "host": "dookie" }

// info - Get OS, kernel, arch, hostname
{ "action": "host", "subaction": "info" }
{ "action": "host", "subaction": "info", "host": "tootie" }

// uptime - Get system uptime
{ "action": "host", "subaction": "uptime" }
{ "action": "host", "subaction": "uptime", "host": "dookie" }

// services - Get systemd service status
{ "action": "host", "subaction": "services" }
{ "action": "host", "subaction": "services", "host": "tootie" }
{ "action": "host", "subaction": "services", "host": "dookie", "state": "failed" }
{ "action": "host", "subaction": "services", "host": "tootie", "service": "docker" }
{ "action": "host", "subaction": "services", "host": "dookie", "service": "nginx", "state": "running" }

// network - Get network interfaces and IPs
{ "action": "host", "subaction": "network" }
{ "action": "host", "subaction": "network", "host": "dookie" }

// mounts - Get mounted filesystems
{ "action": "host", "subaction": "mounts" }
{ "action": "host", "subaction": "mounts", "host": "tootie" }
```

### 5. Help Action

Auto-generated help system for flux tool. Returns action/subaction descriptions, parameters with types/defaults, and examples extracted from schema metadata.

```json
{ "action": "help" }
{ "action": "help", "topic": "container" }
{ "action": "help", "topic": "container:logs" }
{ "action": "help", "format": "json" }
```

**Implementation**: Help handlers run before schema validation, introspecting discriminated union schemas using Zod's `.describe()` metadata.

---

## Tool 2: `scout`

SSH remote file and system operations. Action-based structure with nested subactions for logs and zfs.

| Action  | Subactions | Purpose                   | Parameters                                    | Status                 |
|---------|------------|---------------------------|-----------------------------------------------|------------------------|
| `nodes` | —          | List SSH hosts            | —                                             | RENAME (was `hosts`)   |
| `peek`  | —          | Read file/directory       | `target`, `tree?`, `depth?`                   | RENAME (was `target`)  |
| `exec`  | —          | Execute command           | `target`, `command`, `timeout?`               | RENAME (was `query`)   |
| `find`  | —          | Find by glob pattern      | `target`, `pattern`, `depth?`                 | PORT                   |
| `delta` | —          | Compare files             | `source`, `target` OR `source`, `content`     | RENAME (was `diff`)    |
| `emit`  | —          | Multi-host operations     | `targets[]`, `command?`                       | RENAME (was `targets`) |
| `beam`  | —          | File transfer             | `source`, `destination`                       | PORT                   |
| `ps`    | —          | List/search processes     | `host`, `grep?`, `user?`, `sort?`, `limit?`   | NEW                    |
| `df`    | —          | Disk usage for path/mount | `host`, `path?`, `human_readable?`            | NEW                    |
| **`zfs`** | **3**    | ZFS pool/dataset info     | `subaction`, `host`, subaction-specific params | PORT (from resource)   |
| **`logs`** | **4**   | System logs               | `subaction`, `host`, subaction-specific params | PORT (from resource)   |

**Total: 11 actions (9 simple + 2 with subactions)**

### ZFS Subactions

| Subaction   | Purpose           | Parameters                                      |
|-------------|-------------------|-------------------------------------------------|
| `pools`     | List pools        | `host`, `pool?`, `health?`                      |
| `datasets`  | List datasets     | `host`, `pool?`, `type?`, `recursive?`          |
| `snapshots` | List snapshots    | `host`, `pool?`, `dataset?`, `limit?`           |

### Logs Subactions

| Subaction | Purpose              | Parameters                                      |
|-----------|----------------------|-------------------------------------------------|
| `syslog`  | System log (/var/log)| `host`, `lines?`, `grep?`                       |
| `journal` | Systemd journal      | `host`, `lines?`, `since?`, `until?`, `unit?`, `priority?`, `grep?` |
| `dmesg`   | Kernel ring buffer   | `host`, `lines?`, `grep?`                       |
| `auth`    | Authentication logs  | `host`, `lines?`, `grep?`                       |

### Parameter Formats

| Parameter              | Format                         | Example                                               |
|------------------------|--------------------------------|-------------------------------------------------------|
| `target`               | `hostname:/path`               | `tootie:/etc/nginx/nginx.conf`                        |
| `targets`              | `["hostname:/path", ...]`      | `["web1:/var/log/app.log", "web2:/var/log/app.log"]` |
| `source`/`destination` | local path OR `hostname:/path` | `/tmp/local.txt` or `tootie:/tmp/remote.txt`          |
| `host`                 | hostname only                  | `tootie`                                              |

### Parameter Details

**target**: Remote location in `hostname:/path` format (e.g., `tootie:/etc/nginx/nginx.conf`)

**targets**: Array of remote locations for multi-host operations (e.g., `["web1:/logs", "web2:/logs"]`)

**source**: File source - local path or remote `hostname:/path` (used in delta, beam)

**destination**: File destination - local path or remote `hostname:/path` (used in beam)

**content**: String content for comparison (alternative to target in delta action)

**host**: SSH hostname (used in ps, df, zfs, logs actions)

**command** (exec, emit): Shell command to execute (security: validated against allowlist)

**pattern** (find): Glob pattern for file matching (e.g., `*.conf`, `**/*.log`)

**tree** (peek): `true` = show directory tree, `false` = show file contents (default: `false`)

**depth** (peek, find): Maximum directory depth to traverse (default: 3, max: 10)

**timeout** (exec): Command timeout in seconds (default: 30, max: 120)

**grep** (ps, logs): Filter output containing this string (case-sensitive)

**user** (ps): Filter processes by username

**sort** (ps): Sort order - `cpu` | `mem` | `pid` | `time` (default: `cpu`)

**limit** (ps, zfs snapshots): Maximum results to return (ps: default 50, max 1000; snapshots: max 1000)

**path** (df): Specific filesystem path or mount point to check (default: all mounts)

**human_readable** (df): `true` = human-readable sizes (KB, MB, GB), `false` = bytes (default: `true`)

**subaction** (zfs): `pools` | `datasets` | `snapshots` (required for zfs action)

**subaction** (logs): `syslog` | `journal` | `dmesg` | `auth` (required for logs action)

**pool** (zfs): Pool name filter (optional for all zfs subactions)

**health** (zfs pools): Filter by health status - `online` | `degraded` | `faulted`

**type** (zfs datasets): Filter by type - `filesystem` | `volume`

**recursive** (zfs datasets): `true` = include child datasets, `false` = only direct children (default: `false`)

**dataset** (zfs snapshots): Filter snapshots to specific dataset name

**lines** (logs): Number of log lines to retrieve (default: 100, max: 10000)

**since** (logs journal): ISO 8601 timestamp or relative time (e.g., "2024-01-15T10:00:00Z", "1h", "30m")

**until** (logs journal): ISO 8601 timestamp or relative time

**unit** (logs journal): Systemd unit name to filter (e.g., "docker.service", "nginx.service")

**priority** (logs journal): Log level filter - `emerg` | `alert` | `crit` | `err` | `warning` | `notice` | `info` | `debug`

### Examples

```json
// nodes - List all configured SSH hosts
{ "action": "nodes" }

// peek - Read file or directory contents
{ "action": "peek", "target": "tootie:/etc/nginx/nginx.conf" }
{ "action": "peek", "target": "dookie:/var/log", "tree": true }
{ "action": "peek", "target": "tootie:/etc/systemd", "tree": true, "depth": 2 }

// exec - Execute command on remote host
{ "action": "exec", "target": "dookie:~/code", "command": "rg TODO" }
{ "action": "exec", "target": "tootie:/var/www", "command": "du -sh *" }
{ "action": "exec", "target": "dookie:/etc", "command": "find . -name '*.conf'", "timeout": 60 }

// find - Find files by glob pattern
{ "action": "find", "target": "tootie:/etc", "pattern": "*.conf" }
{ "action": "find", "target": "dookie:/var/log", "pattern": "**/*.log" }
{ "action": "find", "target": "tootie:/home", "pattern": ".bashrc", "depth": 3 }

// delta - Compare files or content
{ "action": "delta", "source": "host1:/etc/hosts", "target": "host2:/etc/hosts" }
{ "action": "delta", "source": "tootie:/etc/nginx/nginx.conf", "target": "dookie:/etc/nginx/nginx.conf" }
{ "action": "delta", "source": "tootie:/etc/hosts", "content": "127.0.0.1 localhost\n::1 localhost" }

// emit - Multi-host operations
{ "action": "emit", "targets": ["web1:/var/log/app.log", "web2:/var/log/app.log"] }
{ "action": "emit", "targets": ["host1:/etc", "host2:/etc"], "command": "ls -la" }
{ "action": "emit", "targets": ["tootie:/tmp", "dookie:/tmp"], "command": "df -h" }

// beam - File transfer between local and remote
{ "action": "beam", "source": "tootie:/tmp/backup.tar.gz", "destination": "/tmp/local.tar.gz" }
{ "action": "beam", "source": "/tmp/config.yaml", "destination": "tootie:/etc/app/config.yaml" }
{ "action": "beam", "source": "tootie:/var/log/app.log", "destination": "dookie:/backup/app.log" }

// ps - List and search processes
{ "action": "ps", "host": "tootie" }
{ "action": "ps", "host": "dookie", "grep": "nginx" }
{ "action": "ps", "host": "tootie", "user": "root", "sort": "mem" }
{ "action": "ps", "host": "dookie", "grep": "docker", "sort": "cpu", "limit": 20 }

// df - Disk usage information
{ "action": "df", "host": "tootie" }
{ "action": "df", "host": "dookie", "path": "/mnt/data" }
{ "action": "df", "host": "tootie", "human_readable": true }
{ "action": "df", "host": "dookie", "path": "/var/lib/docker", "human_readable": false }

// zfs:pools - List ZFS pools
{ "action": "zfs", "subaction": "pools", "host": "dookie" }
{ "action": "zfs", "subaction": "pools", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "pools", "host": "dookie", "health": "online" }
{ "action": "zfs", "subaction": "pools", "host": "tootie", "pool": "backup", "health": "degraded" }

// zfs:datasets - List ZFS datasets
{ "action": "zfs", "subaction": "datasets", "host": "dookie" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank", "type": "filesystem" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank", "recursive": true }
{ "action": "zfs", "subaction": "datasets", "host": "tootie", "pool": "backup", "type": "volume", "recursive": false }

// zfs:snapshots - List ZFS snapshots
{ "action": "zfs", "subaction": "snapshots", "host": "dookie" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "pool": "tank", "dataset": "tank/media" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "dataset": "tank/media", "limit": 50 }

// logs:syslog - System log files
{ "action": "logs", "subaction": "syslog", "host": "tootie" }
{ "action": "logs", "subaction": "syslog", "host": "dookie", "lines": 50 }
{ "action": "logs", "subaction": "syslog", "host": "tootie", "lines": 100, "grep": "error" }

// logs:journal - Systemd journal
{ "action": "logs", "subaction": "journal", "host": "tootie" }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "docker.service" }
{ "action": "logs", "subaction": "journal", "host": "tootie", "since": "1h" }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "nginx.service", "since": "2024-01-15T10:00:00Z", "until": "2024-01-15T11:00:00Z" }
{ "action": "logs", "subaction": "journal", "host": "tootie", "priority": "err", "lines": 50 }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "ssh.service", "priority": "warning", "grep": "Failed" }

// logs:dmesg - Kernel ring buffer
{ "action": "logs", "subaction": "dmesg", "host": "tootie" }
{ "action": "logs", "subaction": "dmesg", "host": "dookie", "lines": 100 }
{ "action": "logs", "subaction": "dmesg", "host": "tootie", "grep": "USB" }

// logs:auth - Authentication logs
{ "action": "logs", "subaction": "auth", "host": "tootie" }
{ "action": "logs", "subaction": "auth", "host": "dookie", "lines": 200 }
{ "action": "logs", "subaction": "auth", "host": "tootie", "grep": "Failed password" }
```

### 12. Help Action

Auto-generated help system for scout tool. Returns action descriptions, parameters with types/defaults, and examples extracted from schema metadata.

```json
{ "action": "help" }
{ "action": "help", "topic": "zfs" }
{ "action": "help", "topic": "logs:journal" }
{ "action": "help", "format": "json" }
```

**Implementation**: Help handlers run before schema validation, introspecting discriminated union schemas using Zod's `.describe()` metadata.

---

## Common Parameters

All actions support:

| Parameter         | Type                  | Default    | Description   |
|-------------------|-----------------------|------------|---------------|
| `response_format` | `markdown` \| `json`  | `markdown` | Output format |

Pagination parameters (where applicable):

| Parameter | Type   | Default | Max | Description      |
|-----------|--------|---------|-----|------------------|
| `limit`   | number | 10      | 100 | Results per page |
| `offset`  | number | 0       | —   | Skip N results   |

---

## Schema Implementation

### Discriminated Union Pattern

**Flux tool**: Uses `action_subaction` composite key for O(1) schema lookup:

```typescript
// Preprocessor injects: action_subaction = `${action}:${subaction}`
{ "action": "container", "subaction": "list", "action_subaction": "container:list", ... }
```

**Scout tool**: Uses `action` as primary discriminator. Actions with variants use nested `subaction` discriminator:

```typescript
// Simple action (no subaction)
{ "action": "peek", ... }

// Action with subactions (nested discriminator)
{ "action": "zfs", "subaction": "pools", ... }
{ "action": "logs", "subaction": "journal", ... }
```

### Validation

```typescript
// Flux tool schema
const FluxSchema = z.discriminatedUnion("action_subaction", [
  // container (14)
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerUnpauseSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema,

  // compose (9)
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema,

  // docker (9)
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  dockerImagesSchema,
  dockerPullSchema,
  dockerBuildSchema,
  dockerRmiSchema,
  dockerNetworksSchema,
  dockerVolumesSchema,

  // host (7)
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema,
]);

// Scout tool schema
const ScoutSchema = z.discriminatedUnion("action", [
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema,
  scoutZfsSchema,   // Nested discriminator on subaction
  scoutLogsSchema,  // Nested discriminator on subaction
]);
```

### Flux-Specific Schemas

```typescript
// Composite discriminator key - preprocessor injects this
const fluxPreprocessor = (data: any) => {
  if (data.action && data.subaction) {
    return { ...data, action_subaction: `${data.action}:${data.subaction}` };
  }
  return data;
};

// Common schemas
const hostSchema = z.string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "Host must be alphanumeric with dashes/underscores");

const containerIdSchema = z.string()
  .min(1)
  .describe("Container name or ID");

const responseFormatSchema = z.enum(["markdown", "json"]).default("markdown");

const paginationSchema = {
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
};

// Example container subaction schemas
const containerListSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("list"),
  action_subaction: z.literal("container:list"),
  host: hostSchema.optional(),
  state: z.enum(["running", "exited", "paused", "restarting", "all"]).optional().default("all"),
  name_filter: z.string().optional(),
  image_filter: z.string().optional(),
  label_filter: z.string().optional(),
  ...paginationSchema,
  response_format: responseFormatSchema.optional(),
});

const containerLogsSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("logs"),
  action_subaction: z.literal("container:logs"),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  lines: z.number().int().min(1).max(10000).optional().default(100),
  since: z.string().optional(), // ISO 8601 or relative (e.g., "1h", "30m")
  until: z.string().optional(),
  grep: z.string().optional(),
  stream: z.enum(["stdout", "stderr", "both"]).optional().default("both"),
  response_format: responseFormatSchema.optional(),
});

const containerExecSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("exec"),
  action_subaction: z.literal("container:exec"),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  command: z.string()
    .min(1)
    .describe("Shell command - validated against allowlist"),
  user: z.string().optional(),
  workdir: z.string().optional(),
  response_format: responseFormatSchema.optional(),
});

// Example compose subaction schemas
const composeUpSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("up"),
  action_subaction: z.literal("compose:up"),
  host: hostSchema,
  project: z.string().min(1).describe("Compose project name"),
  detach: z.boolean().optional().default(true),
  response_format: responseFormatSchema.optional(),
});

const composeLogsSchema = z.object({
  action: z.literal("compose"),
  subaction: z.literal("logs"),
  action_subaction: z.literal("compose:logs"),
  host: hostSchema,
  project: z.string().min(1),
  service: z.string().optional(),
  lines: z.number().int().min(1).max(10000).optional().default(100),
  since: z.string().optional(),
  until: z.string().optional(),
  grep: z.string().optional(),
  response_format: responseFormatSchema.optional(),
});

// Example docker subaction schemas
const dockerPruneSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("prune"),
  action_subaction: z.literal("docker:prune"),
  host: hostSchema,
  prune_target: z.enum(["containers", "images", "volumes", "networks", "buildcache", "all"]),
  force: z.boolean().optional().default(false),
  response_format: responseFormatSchema.optional(),
});

const dockerBuildSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("build"),
  action_subaction: z.literal("docker:build"),
  host: hostSchema,
  context: z.string().min(1).describe("Path to build context"),
  tag: z.string().min(1).describe("Image name:tag"),
  dockerfile: z.string().optional().default("Dockerfile"),
  no_cache: z.boolean().optional().default(false),
  response_format: responseFormatSchema.optional(),
});

// Example host subaction schema
const hostServicesSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("services"),
  action_subaction: z.literal("host:services"),
  host: hostSchema.optional(),
  service: z.string().optional().describe("Specific systemd service name"),
  state: z.enum(["running", "stopped", "failed", "all"]).optional().default("all"),
  response_format: responseFormatSchema.optional(),
});

// Flux schema with preprocessor
const FluxSchema = z.preprocess(
  fluxPreprocessor,
  z.discriminatedUnion("action_subaction", [
    containerListSchema,
    containerLogsSchema,
    containerExecSchema,
    // ... all 39 subaction schemas
    composeUpSchema,
    composeLogsSchema,
    // ... remaining compose schemas
    dockerPruneSchema,
    dockerBuildSchema,
    // ... remaining docker schemas
    hostServicesSchema,
    // ... remaining host schemas
  ])
);
```

### Scout-Specific Schemas

```typescript
// Target format: "hostname:/path"
const scoutTargetSchema = z.string()
  .min(3)
  .regex(/^[a-zA-Z0-9_-]+:\/.*$/, "Must be 'hostname:/path' format");

// Command allowlist
const allowedCommands = [
  "grep", "rg", "find", "ls", "tree", "cat", "head", "tail",
  "wc", "sort", "uniq", "diff", "stat", "file", "du", "df"
];

// Example simple action schema
const scoutPeekSchema = z.object({
  action: z.literal("peek"),
  target: scoutTargetSchema,
  tree: z.boolean().optional().default(false),
  depth: z.number().min(1).max(10).optional().default(3),
  response_format: responseFormatSchema.optional(),
});

// Logs schema with nested discriminated union on subaction
const scoutLogsSchema = z.discriminatedUnion("subaction", [
  // Syslog
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("syslog"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: z.string().optional(),
  }),
  // Systemd journal
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("journal"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    since: z.string().optional(), // ISO 8601
    until: z.string().optional(), // ISO 8601
    unit: z.string().optional(), // systemd unit
    priority: z.enum(["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"]).optional(),
    grep: z.string().optional(),
  }),
  // Kernel ring buffer
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("dmesg"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: z.string().optional(),
  }),
  // Authentication logs
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("auth"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: z.string().optional(),
  }),
]);

// ZFS schema with nested discriminated union on subaction
const scoutZfsSchema = z.discriminatedUnion("subaction", [
  // Pools view
  z.object({
    action: z.literal("zfs"),
    subaction: z.literal("pools"),
    host: z.string(),
    pool: z.string().optional(), // Filter to specific pool
    health: z.enum(["online", "degraded", "faulted"]).optional(), // Filter by health status
  }),
  // Datasets view
  z.object({
    action: z.literal("zfs"),
    subaction: z.literal("datasets"),
    host: z.string(),
    pool: z.string().optional(), // Filter datasets in pool
    type: z.enum(["filesystem", "volume"]).optional(), // Filter by dataset type
    recursive: z.boolean().optional(), // Include child datasets
  }),
  // Snapshots view
  z.object({
    action: z.literal("zfs"),
    subaction: z.literal("snapshots"),
    host: z.string(),
    pool: z.string().optional(), // Filter snapshots in pool
    dataset: z.string().optional(), // Filter to specific dataset
    limit: z.number().int().min(1).max(1000).optional(), // Max snapshots to return
  }),
]);

// Help handler (not part of discriminated union)
function handleHelp(tool: 'flux' | 'scout', topic?: string, format: 'markdown' | 'json' = 'markdown') {
  const schema = tool === 'flux' ? FluxSchema : ScoutSchema;

  // Introspect schema using Zod metadata
  const options = schema.options;

  if (!topic) {
    // Return overview of all actions
    return formatHelp(options, format);
  }

  // Find specific topic in discriminated union
  const match = options.find(opt => matchesTopic(opt, topic));
  if (!match) throw new Error(`Unknown topic: ${topic}`);

  return formatDetailedHelp(match, format);
}
```

---

## File Structure

```
src/
├── schemas/
│   ├── index.ts              # FluxSchema + ScoutSchema exports
│   ├── common.ts             # Shared schemas (pagination, response_format)
│   ├── container.ts          # Container subaction schemas
│   ├── compose.ts            # Compose subaction schemas
│   ├── docker.ts             # Docker subaction schemas
│   ├── host.ts               # Host subaction schemas
│   └── scout.ts              # Scout action schemas
├── tools/
│   ├── index.ts              # Tool registration
│   ├── flux.ts               # Flux tool handler + routing
│   ├── scout.ts              # Scout tool handler + routing
│   ├── container.ts          # handleContainerAction()
│   ├── compose.ts            # handleComposeAction()
│   ├── docker.ts             # handleDockerAction()
│   └── host.ts               # handleHostAction()
├── services/
│   ├── docker.ts             # DockerService
│   ├── compose.ts            # ComposeService
│   ├── ssh.ts                # SSHService
│   └── scout/                # Scout-specific services
│       ├── pool.ts           # SSH connection pool
│       ├── executors.ts      # Command execution
│       └── transfer.ts       # File transfer (beam)
└── config/
    └── command-allowlist.json  # Allowed commands for scout:exec
```

---

## Quick Reference

### Flux Tool — All Subactions by Action

```
container: list, start, stop, restart, pause, unpause, logs, stats, inspect, search, pull, recreate, exec, top (14)
compose:   list, status, up, down, restart, logs, build, pull, recreate (9)
docker:    info, df, prune, images, pull, build, rmi, networks, volumes (9)
host:      status, resources, info, uptime, services, network, mounts (7)
help:      Auto-generated documentation (not in discriminator)
```

**Total**: 39 operational subactions + help handler

### Flux Tool — Discriminator Keys

```
container:list, container:start, container:stop, container:restart,
container:pause, container:unpause, container:logs, container:stats,
container:inspect, container:search, container:pull, container:recreate,
container:exec, container:top,

compose:list, compose:status, compose:up, compose:down, compose:restart,
compose:logs, compose:build, compose:pull, compose:recreate,

docker:info, docker:df, docker:prune, docker:images, docker:pull,
docker:build, docker:rmi, docker:networks, docker:volumes,

host:status, host:resources, host:info, host:uptime,
host:services, host:network, host:mounts

help: Auto-generated documentation (not in discriminator)
```

**Note**: Help handler (`{ "action": "help", ... }`) runs before discriminator validation and is not included in the discriminated union.

---

### Scout Tool — All Actions

```
Simple actions (9):
  nodes, peek, exec, find, delta, emit, beam, ps, df

Actions with subactions (2):
  zfs:      pools, datasets, snapshots (3)
  logs:     syslog, journal, dmesg, auth (4)

help: Auto-generated documentation (not in discriminator)
```

**Total**: 11 actions, 7 subactions = 16 discriminator keys + help handler

### Scout Tool — Discriminator Keys

```
nodes, peek, exec, find, delta, emit, beam, ps, df,
zfs:pools, zfs:datasets, zfs:snapshots,
logs:syslog, logs:journal, logs:dmesg, logs:auth
```

**Notes**:
- Scout uses `action` as the primary discriminator
- Two actions use nested discriminated unions with `subaction` as secondary discriminator:
  - **logs**: Discriminates on `subaction` (syslog, journal, dmesg, auth)
  - **zfs**: Discriminates on `subaction` (pools, datasets, snapshots)
- Help handler (`{ "action": "help", ... }`) runs before discriminator validation and is not included in the discriminated union
- This structure is consistent with flux's `action` + `subaction` pattern
