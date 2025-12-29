# Flux & Scout — MCP Tools Schema

## Overview

Two MCP tools with discriminated union pattern for O(1) validation:

| Tool    | Actions | Subactions | Purpose                                      |
|---------|---------|------------|----------------------------------------------|
| `flux`  | 4       | 39         | Docker infrastructure management (read/write) |
| `scout` | —       | 11         | SSH remote operations (read-mostly)           |

**Total: 50 subactions across 2 tools**

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

## 1. `container` Action (14 subactions)

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

### Examples
```json
{ "action": "container", "subaction": "list", "state": "running" }
{ "action": "container", "subaction": "start", "container_id": "plex" }
{ "action": "container", "subaction": "logs", "container_id": "nginx", "lines": 100, "grep": "error" }
{ "action": "container", "subaction": "stats", "host": "tootie" }
{ "action": "container", "subaction": "restart", "container_id": "plex", "host": "dookie" }
{ "action": "container", "subaction": "exec", "container_id": "nginx", "command": "nginx -t" }
{ "action": "container", "subaction": "exec", "container_id": "postgres", "command": "psql -U admin -c '\\dt'", "user": "postgres" }
{ "action": "container", "subaction": "top", "container_id": "plex", "host": "tootie" }
```

---

## 2. `compose` Action (9 subactions)

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

### Examples
```json
{ "action": "compose", "subaction": "list", "host": "tootie" }
{ "action": "compose", "subaction": "up", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "down", "host": "tootie", "project": "plex", "remove_volumes": false }
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex", "service": "server", "lines": 50, "grep": "error" }
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex", "since": "2024-01-15T10:00:00Z", "until": "2024-01-15T11:00:00Z" }
{ "action": "compose", "subaction": "pull", "host": "tootie", "project": "plex" }
```

---

## 3. `docker` Action (9 subactions)

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

### Parameter Details

**prune_target**: `containers` | `images` | `volumes` | `networks` | `buildcache` | `all`

### Examples
```json
{ "action": "docker", "subaction": "info", "host": "tootie" }
{ "action": "docker", "subaction": "df", "host": "tootie" }
{ "action": "docker", "subaction": "prune", "host": "tootie", "prune_target": "images", "force": true }
{ "action": "docker", "subaction": "images", "host": "tootie", "dangling_only": true }
{ "action": "docker", "subaction": "pull", "host": "tootie", "image": "nginx:latest" }
{ "action": "docker", "subaction": "build", "host": "tootie", "context": "/app", "tag": "myapp:v1" }
{ "action": "docker", "subaction": "rmi", "host": "tootie", "image": "nginx:old", "force": true }
{ "action": "docker", "subaction": "networks", "host": "tootie" }
{ "action": "docker", "subaction": "volumes", "host": "dookie", "limit": 20 }
```

---

## 4. `host` Action (7 subactions)

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

### Parameter Details

**state** (services): `running` | `stopped` | `failed` | `all` (default: `all`)

### Examples
```json
{ "action": "host", "subaction": "status" }
{ "action": "host", "subaction": "status", "host": "tootie" }
{ "action": "host", "subaction": "resources", "host": "dookie" }
{ "action": "host", "subaction": "info", "host": "tootie" }
{ "action": "host", "subaction": "uptime" }
{ "action": "host", "subaction": "services", "host": "tootie", "state": "failed" }
{ "action": "host", "subaction": "services", "host": "tootie", "service": "docker" }
{ "action": "host", "subaction": "network", "host": "dookie" }
{ "action": "host", "subaction": "mounts", "host": "tootie" }
```

---

## Tool 2: `scout`

SSH remote file and system operations. Flat structure (subaction only, no action).

| Subaction | Purpose                   | Parameters                                    | Status                 |
|-----------|---------------------------|-----------------------------------------------|------------------------|
| `nodes`   | List SSH hosts            | —                                             | RENAME (was `hosts`)   |
| `peek`    | Read file/directory       | `target`, `tree?`, `depth?`                   | RENAME (was `target`)  |
| `exec`    | Execute command           | `target`, `command`, `timeout?`               | RENAME (was `query`)   |
| `find`    | Find by glob pattern      | `target`, `pattern`, `depth?`                 | PORT                   |
| `delta`   | Compare files             | `source`, `target` OR `source`, `content`     | RENAME (was `diff`)    |
| `emit`    | Multi-host operations     | `targets[]`, `command?`                       | RENAME (was `targets`) |
| `beam`    | File transfer             | `source`, `destination`                       | PORT                   |
| `zfs`     | ZFS pool/dataset info     | `host`, `pool?`, `view?`                      | PORT (from resource)   |
| `logs`    | System logs               | `host`, `lines?`, `grep?`                     | PORT (from resource)   |
| `ps`      | List/search processes     | `host`, `grep?`, `user?`, `sort?`, `limit?`   | NEW                    |
| `df`      | Disk usage for path/mount | `host`, `path?`, `human_readable?`            | NEW                    |

**Total: 11 subactions**

### Parameter Formats

| Parameter              | Format                         | Example                                               |
|------------------------|--------------------------------|-------------------------------------------------------|
| `target`               | `hostname:/path`               | `tootie:/etc/nginx/nginx.conf`                        |
| `targets`              | `["hostname:/path", ...]`      | `["web1:/var/log/app.log", "web2:/var/log/app.log"]` |
| `source`/`destination` | local path OR `hostname:/path` | `/tmp/local.txt` or `tootie:/tmp/remote.txt`          |
| `host`                 | hostname only                  | `tootie`                                              |

### Parameter Details

**view** (zfs): `pools` | `datasets` | `snapshots` (default: `pools`)

**timeout** (exec): seconds, default 30, max 120

**depth**: max directory depth, default 5

**sort** (ps): `cpu` | `mem` | `pid` | `time` (default: `cpu`)

### Examples
```json
{ "subaction": "nodes" }
{ "subaction": "peek", "target": "tootie:/etc/nginx/nginx.conf" }
{ "subaction": "peek", "target": "tootie:/var/log", "tree": true, "depth": 2 }
{ "subaction": "exec", "target": "dookie:~/code", "command": "rg TODO" }
{ "subaction": "find", "target": "tootie:/etc", "pattern": "*.conf" }
{ "subaction": "delta", "source": "host1:/etc/hosts", "target": "host2:/etc/hosts" }
{ "subaction": "delta", "source": "tootie:/etc/hosts", "content": "127.0.0.1 localhost" }
{ "subaction": "emit", "targets": ["web1:/var/log/app.log", "web2:/var/log/app.log"] }
{ "subaction": "emit", "targets": ["host1:/etc", "host2:/etc"], "command": "ls -la" }
{ "subaction": "beam", "source": "tootie:/tmp/backup.tar.gz", "destination": "/tmp/local.tar.gz" }
{ "subaction": "beam", "source": "/tmp/config.yaml", "destination": "tootie:/etc/app/config.yaml" }
{ "subaction": "zfs", "host": "dookie", "view": "pools" }
{ "subaction": "zfs", "host": "dookie", "pool": "tank", "view": "snapshots" }
{ "subaction": "logs", "host": "tootie", "lines": 50, "grep": "error" }
{ "subaction": "ps", "host": "tootie", "grep": "nginx" }
{ "subaction": "ps", "host": "dookie", "user": "root", "sort": "mem", "limit": 20 }
{ "subaction": "df", "host": "tootie", "path": "/mnt/data" }
{ "subaction": "df", "host": "dookie", "human_readable": true }
```

---

## Common Parameters

All subactions support:

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

**Scout tool**: Uses `subaction` directly (flat structure):

```typescript
{ "subaction": "peek", ... }
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
const ScoutSchema = z.discriminatedUnion("subaction", [
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutZfsSchema,
  scoutLogsSchema,
  scoutPsSchema,
  scoutDfSchema,
]);
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

// Example schema
const scoutPeekSchema = z.object({
  subaction: z.literal("peek"),
  target: scoutTargetSchema,
  tree: z.boolean().optional().default(false),
  depth: z.number().min(1).max(10).optional().default(3),
  response_format: responseFormatSchema.optional(),
});
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
│   └── scout.ts              # Scout subaction schemas
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
container: list, start, stop, restart, pause, unpause, logs, stats, inspect, search, pull, recreate, exec, top
compose:   list, status, up, down, restart, logs, build, pull, recreate
docker:    info, df, prune, images, pull, build, rmi, networks, volumes
host:      status, resources, info, uptime, services, network, mounts
```

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
```

### Scout Tool — All Subactions

```
nodes, peek, exec, find, delta, emit, beam, zfs, logs, ps, df
```

**Note**: Scout uses a flat structure with only `subaction` as the discriminator (no `action` field), so these subaction names are also the discriminator keys.
