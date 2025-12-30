# Flux & Scout — MCP Tools Schema (V3)

## Overview

Two MCP tools with discriminated union pattern for O(1) validation:

| Tool    | Actions | Subactions | Help Handler | Purpose                                      |
|---------|---------|------------|--------------|----------------------------------------------|
| `flux`  | 4       | 39         | ✅           | Docker infrastructure management (read/write) |
| `scout` | 11      | 7          | ✅           | SSH remote operations (read-mostly)           |

**Total: 15 actions, 55 operations (discriminator keys) + auto-generated help handlers**

**Breakdown**:
- **Flux**: 4 actions, each with multiple subactions (14 + 9 + 9 + 7 = 39 operations)
- **Scout**: 11 actions (9 simple + 2 with subactions: zfs=3, logs=4 → 16 operations)

---

## Quick Reference

### Flux Tool — All Subactions by Action

```
container: list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top (14)
compose:   list, status, up, down, restart, logs, build, pull, recreate (9)
docker:    info, df, prune, images, pull, build, rmi, networks, volumes (9)
host:      status, resources, info, uptime, services, network, mounts (7)
help:      Auto-generated documentation (not in discriminator)
```

**Total**: 39 operational subactions + help handler

### Scout Tool — All Actions with Subactions

```
Simple actions (9):
  nodes, peek, exec, find, delta, emit, beam, ps, df

Actions with subactions (2):
  zfs:      pools, datasets, snapshots (3)
  logs:     syslog, journal, dmesg, auth (4)

help: Auto-generated documentation (not in discriminator)
```

**Total**: 11 actions, 16 discriminator keys + help handler

---

## File Structure Recommendation

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

# Tool 1: `flux`

Docker infrastructure management. State changes, lifecycle control, destructive operations.

## Help Action

Auto-generated help system for flux tool. Returns action/subaction descriptions, parameters with types/defaults, and examples extracted from schema metadata.

### Examples

```json
{ "action": "help" }
{ "action": "help", "topic": "container" }
{ "action": "help", "topic": "container:logs" }
{ "action": "help", "format": "json" }
```

**Implementation**: Help handlers run before schema validation, introspecting discriminated union schemas using Zod's `.describe()` metadata.

---

## `container` Action (14 subactions)

Container lifecycle and inspection operations.

### `list`

List containers with optional filtering.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)
- **state**: `running` | `exited` | `paused` | `restarting` | `all` (default: `all`)
- **name_filter**: Partial match on container name (case-insensitive)
- **image_filter**: Partial match on image name (e.g., "nginx" matches "nginx:latest")
- **label_filter**: Key-value pairs in format `key=value` or just `key` for existence check
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "container", "subaction": "list" }
{ "action": "container", "subaction": "list", "state": "running" }
{ "action": "container", "subaction": "list", "state": "exited", "limit": 20 }
{ "action": "container", "subaction": "list", "name_filter": "plex", "host": "tootie" }
{ "action": "container", "subaction": "list", "image_filter": "nginx", "state": "running" }
{ "action": "container", "subaction": "list", "label_filter": "app=web", "limit": 50 }
```

### `start`

Start a stopped container.

#### Parameters

- **container_id**: Container name or ID (Docker accepts either)
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "start", "container_id": "plex" }
{ "action": "container", "subaction": "start", "container_id": "nginx", "host": "dookie" }
```

### `stop`

Stop a running container.

#### Parameters

- **container_id**: Container name or ID
- **image**: Explicit image to pull if container metadata is missing (optional)
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "stop", "container_id": "plex" }
{ "action": "container", "subaction": "stop", "container_id": "redis", "host": "tootie" }
```

### `restart`

Restart a container.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "restart", "container_id": "plex" }
{ "action": "container", "subaction": "restart", "container_id": "nginx", "host": "dookie" }
```

### `pause`

Pause a running container.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "pause", "container_id": "plex" }
```

### `resume`

Resume a paused container (was `unpause` in v2).

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "resume", "container_id": "plex" }
```

### `logs`

Get container logs with optional filtering.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **since**: ISO 8601 timestamp (e.g., "2024-01-15T10:00:00Z") or relative (e.g., "1h", "30m")
- **until**: ISO 8601 timestamp or relative time
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)
- **stream**: Controls output streams - `stdout` | `stderr` | `both` (default: `both`)

#### Examples

```json
{ "action": "container", "subaction": "logs", "container_id": "nginx" }
{ "action": "container", "subaction": "logs", "container_id": "nginx", "lines": 100, "grep": "error" }
{ "action": "container", "subaction": "logs", "container_id": "plex", "since": "1h", "stream": "stderr" }
{ "action": "container", "subaction": "logs", "container_id": "postgres", "since": "2024-01-15T10:00:00Z", "until": "2024-01-15T11:00:00Z" }
```

### `stats`

Get resource usage statistics.

#### Parameters

- **container_id**: Container name or ID (optional, if omitted returns stats for all containers)
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "stats" }
{ "action": "container", "subaction": "stats", "host": "tootie" }
{ "action": "container", "subaction": "stats", "container_id": "plex" }
```

### `inspect`

Get detailed container information.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)
- **summary**: `true` = basic info only, `false` = full details (default: `false`)

#### Examples

```json
{ "action": "container", "subaction": "inspect", "container_id": "plex" }
{ "action": "container", "subaction": "inspect", "container_id": "nginx", "summary": true }
```

### `search`

Search containers by query string.

#### Parameters

- **query**: Full-text search string across container names, IDs, images, and labels
- **host**: Target Docker host (optional)
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "container", "subaction": "search", "query": "web" }
{ "action": "container", "subaction": "search", "query": "plex", "host": "tootie", "limit": 10 }
```

### `pull`

Pull latest image for a container.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "pull", "container_id": "nginx" }
{ "action": "container", "subaction": "pull", "container_id": "plex", "host": "dookie" }
```

### `recreate`

Recreate a container with optional image pull.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)
- **pull**: `true` = pull latest image before recreate, `false` = use existing (default: `true`)

#### Examples

```json
{ "action": "container", "subaction": "recreate", "container_id": "nginx" }
{ "action": "container", "subaction": "recreate", "container_id": "plex", "pull": false }
```

### `exec`

Execute command inside a container.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)
- **command**: Shell command to execute (security: validated against allowlist)
- **user**: Run as specific user (default: container's default user)
- **workdir**: Working directory for command execution (default: container's WORKDIR)

#### Examples

```json
{ "action": "container", "subaction": "exec", "container_id": "nginx", "command": "nginx -t" }
{ "action": "container", "subaction": "exec", "container_id": "postgres", "command": "psql -U admin -c '\\dt'", "user": "postgres" }
{ "action": "container", "subaction": "exec", "container_id": "app", "command": "ls -la /app", "workdir": "/app" }
```

### `top`

Show running processes in a container.

#### Parameters

- **container_id**: Container name or ID
- **host**: Target Docker host (optional)

#### Examples

```json
{ "action": "container", "subaction": "top", "container_id": "plex" }
{ "action": "container", "subaction": "top", "container_id": "nginx", "host": "tootie" }
```

---

## `compose` Action (9 subactions)

Docker Compose project management.

### `list`

List all Docker Compose projects.

#### Parameters

- **host**: Target Docker host (required)
- **name_filter**: Partial match on project name (case-insensitive)
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "compose", "subaction": "list", "host": "tootie" }
{ "action": "compose", "subaction": "list", "host": "dookie", "name_filter": "app", "limit": 20 }
```

### `status`

Get Docker Compose project status.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name (directory name or `-p` override)
- **service_filter**: Filter to specific service(s) within project
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "compose", "subaction": "status", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "status", "host": "dookie", "project": "homelab", "service_filter": "web" }
```

### `up`

Start a Docker Compose project.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **detach**: `true` = run in background (default), `false` = attach to output

#### Examples

```json
{ "action": "compose", "subaction": "up", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "up", "host": "dookie", "project": "app", "detach": false }
```

### `down`

Stop a Docker Compose project.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **remove_volumes**: `true` = delete volumes (destructive!), `false` = preserve volumes (default: `false`)

#### Examples

```json
{ "action": "compose", "subaction": "down", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "down", "host": "dookie", "project": "temp", "remove_volumes": true }
```

### `restart`

Restart a Docker Compose project.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name

#### Examples

```json
{ "action": "compose", "subaction": "restart", "host": "tootie", "project": "plex" }
```

### `logs`

Get Docker Compose project logs.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **service**: Target specific service within project (optional, applies to all services if omitted)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **since**: ISO 8601 timestamp or relative time (e.g., "1h", "30m")
- **until**: ISO 8601 timestamp or relative time
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)

#### Examples

```json
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "logs", "host": "tootie", "project": "plex", "service": "server", "lines": 50, "grep": "error" }
{ "action": "compose", "subaction": "logs", "host": "dookie", "project": "app", "since": "1h", "until": "30m" }
```

### `build`

Build Docker Compose project images.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **service**: Target specific service within project (optional)
- **no_cache**: `true` = rebuild from scratch, `false` = use layer cache (default: `false`)

#### Examples

```json
{ "action": "compose", "subaction": "build", "host": "tootie", "project": "app" }
{ "action": "compose", "subaction": "build", "host": "dookie", "project": "web", "service": "frontend", "no_cache": true }
```

### `pull`

Pull Docker Compose project images.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **service**: Target specific service within project (optional)

#### Examples

```json
{ "action": "compose", "subaction": "pull", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "pull", "host": "dookie", "project": "app", "service": "api" }
```

### `recreate`

Recreate Docker Compose project containers.

#### Parameters

- **host**: Target Docker host (required)
- **project**: Docker Compose project name
- **service**: Target specific service within project (optional)

#### Examples

```json
{ "action": "compose", "subaction": "recreate", "host": "tootie", "project": "plex" }
{ "action": "compose", "subaction": "recreate", "host": "dookie", "project": "app", "service": "worker" }
```

---

## `docker` Action (9 subactions)

Docker daemon operations and image management.

### `info`

Get Docker daemon information.

#### Parameters

- **host**: Target Docker host (required)

#### Examples

```json
{ "action": "docker", "subaction": "info", "host": "tootie" }
{ "action": "docker", "subaction": "info", "host": "dookie" }
```

### `df`

Get Docker disk usage information.

#### Parameters

- **host**: Target Docker host (required)

#### Examples

```json
{ "action": "docker", "subaction": "df", "host": "tootie" }
```

### `prune`

Remove unused Docker resources.

#### Parameters

- **host**: Target Docker host (required)
- **prune_target**: `containers` | `images` | `volumes` | `networks` | `buildcache` | `all`
- **force**: `true` = skip confirmation, `false` = require confirmation (default: `false`)

#### Examples

```json
{ "action": "docker", "subaction": "prune", "host": "tootie", "prune_target": "containers", "force": true }
{ "action": "docker", "subaction": "prune", "host": "dookie", "prune_target": "images", "force": false }
{ "action": "docker", "subaction": "prune", "host": "tootie", "prune_target": "volumes", "force": true }
{ "action": "docker", "subaction": "prune", "host": "dookie", "prune_target": "all", "force": true }
```

### `images`

List Docker images.

#### Parameters

- **host**: Target Docker host (optional)
- **dangling_only**: `true` = only show untagged images, `false` = show all (default: `false`)
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "docker", "subaction": "images", "host": "tootie" }
{ "action": "docker", "subaction": "images", "host": "dookie", "dangling_only": true }
{ "action": "docker", "subaction": "images", "host": "tootie", "limit": 50, "offset": 10 }
```

### `pull`

Pull a Docker image.

#### Parameters

- **host**: Target Docker host (required)
- **image**: Image name with optional tag (e.g., "nginx:latest" or just "nginx" for latest)

#### Examples

```json
{ "action": "docker", "subaction": "pull", "host": "tootie", "image": "nginx:latest" }
{ "action": "docker", "subaction": "pull", "host": "dookie", "image": "postgres:16" }
```

### `build`

Build a Docker image.

#### Parameters

- **host**: Target Docker host (required)
- **context**: Path to build context directory (absolute or relative to compose project)
- **tag**: Image name:tag for the built image (e.g., "myapp:v1.0")
- **dockerfile**: Path to Dockerfile (default: "Dockerfile" in context root)
- **no_cache**: `true` = rebuild from scratch, `false` = use layer cache (default: `false`)

#### Examples

```json
{ "action": "docker", "subaction": "build", "host": "tootie", "context": "/app", "tag": "myapp:v1" }
{ "action": "docker", "subaction": "build", "host": "dookie", "context": "/srv/web", "tag": "web:latest", "dockerfile": "Dockerfile.prod" }
{ "action": "docker", "subaction": "build", "host": "tootie", "context": "/code", "tag": "api:dev", "no_cache": true }
```

### `rmi`

Remove a Docker image.

#### Parameters

- **host**: Target Docker host (required)
- **image**: Image name with optional tag
- **force**: `true` = force removal, `false` = fail if image is in use (default: `false`)

#### Examples

```json
{ "action": "docker", "subaction": "rmi", "host": "tootie", "image": "nginx:old" }
{ "action": "docker", "subaction": "rmi", "host": "dookie", "image": "myapp:v0.1", "force": true }
```

### `networks`

List Docker networks.

#### Parameters

- **host**: Target Docker host (optional)
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "docker", "subaction": "networks", "host": "tootie" }
{ "action": "docker", "subaction": "networks", "host": "dookie", "limit": 20 }
```

### `volumes`

List Docker volumes.

#### Parameters

- **host**: Target Docker host (optional)
- **limit**: Maximum results to return (default: 10, max: 100)
- **offset**: Skip N results for pagination (default: 0)

#### Examples

```json
{ "action": "docker", "subaction": "volumes", "host": "tootie" }
{ "action": "docker", "subaction": "volumes", "host": "dookie", "limit": 20, "offset": 5 }
```

---

## `host` Action (7 subactions)

Host-level operations.

### `status`

Check Docker connectivity to host.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "status" }
{ "action": "host", "subaction": "status", "host": "tootie" }
```

### `resources`

Get CPU, memory, and disk usage via SSH.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "resources" }
{ "action": "host", "subaction": "resources", "host": "dookie" }
```

### `info`

Get OS, kernel, architecture, and hostname information.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "info" }
{ "action": "host", "subaction": "info", "host": "tootie" }
```

### `uptime`

Get system uptime.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "uptime" }
{ "action": "host", "subaction": "uptime", "host": "dookie" }
```

### `services`

Get systemd service status.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)
- **service**: Specific systemd service name (e.g., "docker", "sshd")
- **state**: `running` | `stopped` | `failed` | `all` (default: `all`)

#### Examples

```json
{ "action": "host", "subaction": "services" }
{ "action": "host", "subaction": "services", "host": "tootie" }
{ "action": "host", "subaction": "services", "host": "dookie", "state": "failed" }
{ "action": "host", "subaction": "services", "host": "tootie", "service": "docker" }
{ "action": "host", "subaction": "services", "host": "dookie", "service": "nginx", "state": "running" }
```

### `network`

Get network interfaces and IP addresses.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "network" }
{ "action": "host", "subaction": "network", "host": "dookie" }
```

### `mounts`

Get mounted filesystems.

#### Parameters

- **host**: Target Docker host (optional, defaults to first configured host or all hosts)

#### Examples

```json
{ "action": "host", "subaction": "mounts" }
{ "action": "host", "subaction": "mounts", "host": "tootie" }
```

---

## Flux Common Parameters

All flux actions support:

| Parameter         | Type                  | Default    | Description   |
|-------------------|-----------------------|------------|---------------|
| `response_format` | `markdown` \| `json`  | `markdown` | Output format |

Pagination parameters (where applicable):

| Parameter | Type   | Default | Max | Description      |
|-----------|--------|---------|-----|------------------|
| `limit`   | number | 10      | 100 | Results per page |
| `offset`  | number | 0       | —   | Skip N results   |

---

## Flux Discriminator Keys

Complete list of all 39 discriminator keys:

```
container:list, container:start, container:stop, container:restart,
container:pause, container:resume, container:logs, container:stats,
container:inspect, container:search, container:pull, container:recreate,
container:exec, container:top,

compose:list, compose:status, compose:up, compose:down, compose:restart,
compose:logs, compose:build, compose:pull, compose:recreate,

docker:info, docker:df, docker:prune, docker:images, docker:pull,
docker:build, docker:rmi, docker:networks, docker:volumes,

host:status, host:resources, host:info, host:uptime,
host:services, host:network, host:mounts
```

**Note**: Help handler (`{ "action": "help", ... }`) runs before discriminator validation and is not included in the discriminated union.

---

## Flux Schemas

### Discriminated Union Pattern

**Flux tool** uses `action_subaction` composite key for O(1) schema lookup:

```typescript
// Preprocessor injects: action_subaction = `${action}:${subaction}`
{ "action": "container", "subaction": "list", "action_subaction": "container:list", ... }
```

### Validation

```typescript
const FluxSchema = z.discriminatedUnion("action_subaction", [
  // container (14)
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,  // was containerUnpauseSchema
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
```

### Preprocessor Implementation

```typescript
// Composite discriminator key - preprocessor injects this
const fluxPreprocessor = (data: any) => {
  if (data.action && data.subaction) {
    return { ...data, action_subaction: `${data.action}:${data.subaction}` };
  }
  return data;
};

// Flux schema with preprocessor
const FluxSchema = z.preprocess(
  fluxPreprocessor,
  z.discriminatedUnion("action_subaction", [
    // ... all 39 subaction schemas
  ])
);
```

### Example Schemas

```typescript
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

const safeGrepSchema = z.string()
  .min(1)
  .max(200)
  .refine((value) => !/[;&|`$()<>{}[\]\\"\n\r\t']/.test(value), {
    message: "Grep pattern contains shell metacharacters",
  });

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
  grep: safeGrepSchema.optional(),
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
  grep: safeGrepSchema.optional(),
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
```

---

# Tool 2: `scout`

SSH remote file and system operations. Action-based structure with nested subactions for logs and zfs.

## Help Action

Auto-generated help system for scout tool. Returns action descriptions, parameters with types/defaults, and examples extracted from schema metadata.

### Examples

```json
{ "action": "help" }
{ "action": "help", "topic": "zfs" }
{ "action": "help", "topic": "logs:journal" }
{ "action": "help", "format": "json" }
```

**Implementation**: Help handlers run before schema validation, introspecting discriminated union schemas using Zod's `.describe()` metadata.

---

## `nodes` Action

List all configured SSH hosts.

### Parameters

No parameters required.

### Examples

```json
{ "action": "nodes" }
```

---

## `peek` Action

Read file or directory contents on a remote host.

### Parameters

- **target**: Remote location in `hostname:/path` format (e.g., `tootie:/etc/nginx/nginx.conf`)
- **tree**: `true` = show directory tree, `false` = show file contents (default: `false`)
- **depth**: Maximum directory depth to traverse (default: 3, max: 10)

### Examples

```json
{ "action": "peek", "target": "tootie:/etc/nginx/nginx.conf" }
{ "action": "peek", "target": "dookie:/var/log", "tree": true }
{ "action": "peek", "target": "tootie:/etc/systemd", "tree": true, "depth": 2 }
```

---

## `exec` Action

Execute command on a remote host.

### Parameters

- **target**: Remote location in `hostname:/path` format (working directory for command)
- **command**: Shell command to execute (security: validated against allowlist)
- **timeout**: Command timeout in seconds (default: 30, max: 120)

### Examples

```json
{ "action": "exec", "target": "dookie:~/code", "command": "rg TODO" }
{ "action": "exec", "target": "tootie:/var/www", "command": "du -sh *" }
{ "action": "exec", "target": "dookie:/etc", "command": "find . -name '*.conf'", "timeout": 60 }
```

---

## `find` Action

Find files by glob pattern on a remote host.

### Parameters

- **target**: Remote location in `hostname:/path` format (search root directory)
- **pattern**: Glob pattern for file matching (e.g., `*.conf`, `**/*.log`)
- **depth**: Maximum directory depth to traverse (default: 3, max: 10)

### Examples

```json
{ "action": "find", "target": "tootie:/etc", "pattern": "*.conf" }
{ "action": "find", "target": "dookie:/var/log", "pattern": "**/*.log" }
{ "action": "find", "target": "tootie:/home", "pattern": ".bashrc", "depth": 3 }
```

---

## `delta` Action

Compare files or content between locations.

### Parameters

- **source**: File source - local path or remote `hostname:/path`
- **target**: File destination - local path or remote `hostname:/path` (for file comparison)
- **content**: String content for comparison (alternative to target for comparing source file against string)

### Examples

```json
{ "action": "delta", "source": "host1:/etc/hosts", "target": "host2:/etc/hosts" }
{ "action": "delta", "source": "tootie:/etc/nginx/nginx.conf", "target": "dookie:/etc/nginx/nginx.conf" }
{ "action": "delta", "source": "tootie:/etc/hosts", "content": "127.0.0.1 localhost\n::1 localhost" }
```

---

## `emit` Action

Multi-host operations (read files or execute commands on multiple hosts).

### Parameters

- **targets**: Array of remote locations for multi-host operations (e.g., `["web1:/logs", "web2:/logs"]`)
- **command**: Shell command to execute on all targets (optional, if omitted just reads the target paths)

### Examples

```json
{ "action": "emit", "targets": ["web1:/var/log/app.log", "web2:/var/log/app.log"] }
{ "action": "emit", "targets": ["host1:/etc", "host2:/etc"], "command": "ls -la" }
{ "action": "emit", "targets": ["tootie:/tmp", "dookie:/tmp"], "command": "df -h" }
```

---

## `beam` Action

File transfer between local and remote hosts, or between remote hosts.

### Parameters

- **source**: File source - local path or remote `hostname:/path`
- **destination**: File destination - local path or remote `hostname:/path`

### Examples

```json
{ "action": "beam", "source": "tootie:/tmp/backup.tar.gz", "destination": "/tmp/local.tar.gz" }
{ "action": "beam", "source": "/tmp/config.yaml", "destination": "tootie:/etc/app/config.yaml" }
{ "action": "beam", "source": "tootie:/var/log/app.log", "destination": "dookie:/backup/app.log" }
```

---

## `ps` Action

List and search processes on a remote host.

### Parameters

- **host**: SSH hostname
- **grep**: Filter output containing this string (case-sensitive; no shell metacharacters; max 200 chars)
- **user**: Filter processes by username
- **sort**: Sort order - `cpu` | `mem` | `pid` | `time` (default: `cpu`)
- **limit**: Maximum results to return (default: 50, max: 1000)

### Examples

```json
{ "action": "ps", "host": "tootie" }
{ "action": "ps", "host": "dookie", "grep": "nginx" }
{ "action": "ps", "host": "tootie", "user": "root", "sort": "mem" }
{ "action": "ps", "host": "dookie", "grep": "docker", "sort": "cpu", "limit": 20 }
```

---

## `df` Action

Disk usage information for a remote host.

### Parameters

- **host**: SSH hostname
- **path**: Specific filesystem path or mount point to check (default: all mounts)
- **human_readable**: `true` = human-readable sizes (KB, MB, GB), `false` = bytes (default: `true`)

### Examples

```json
{ "action": "df", "host": "tootie" }
{ "action": "df", "host": "dookie", "path": "/mnt/data" }
{ "action": "df", "host": "tootie", "human_readable": true }
{ "action": "df", "host": "dookie", "path": "/var/lib/docker", "human_readable": false }
```

---

## `zfs` Action (3 subactions)

ZFS pool, dataset, and snapshot information.

### `pools`

List ZFS storage pools.

#### Parameters

- **host**: SSH hostname (required)
- **pool**: Pool name filter (optional)
- **health**: Filter by health status - `online` | `degraded` | `faulted`

#### Examples

```json
{ "action": "zfs", "subaction": "pools", "host": "dookie" }
{ "action": "zfs", "subaction": "pools", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "pools", "host": "dookie", "health": "online" }
{ "action": "zfs", "subaction": "pools", "host": "tootie", "pool": "backup", "health": "degraded" }
```

### `datasets`

List ZFS datasets (filesystems and volumes).

#### Parameters

- **host**: SSH hostname (required)
- **pool**: Pool name filter (optional)
- **type**: Filter by type - `filesystem` | `volume`
- **recursive**: `true` = include child datasets, `false` = only direct children (default: `false`)

#### Examples

```json
{ "action": "zfs", "subaction": "datasets", "host": "dookie" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank", "type": "filesystem" }
{ "action": "zfs", "subaction": "datasets", "host": "dookie", "pool": "tank", "recursive": true }
{ "action": "zfs", "subaction": "datasets", "host": "tootie", "pool": "backup", "type": "volume", "recursive": false }
```

### `snapshots`

List ZFS snapshots.

#### Parameters

- **host**: SSH hostname (required)
- **pool**: Pool name filter (optional)
- **dataset**: Filter snapshots to specific dataset name
- **limit**: Maximum snapshots to return (max: 1000)

#### Examples

```json
{ "action": "zfs", "subaction": "snapshots", "host": "dookie" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "pool": "tank" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "pool": "tank", "dataset": "tank/media" }
{ "action": "zfs", "subaction": "snapshots", "host": "dookie", "dataset": "tank/media", "limit": 50 }
```

---

## `logs` Action (4 subactions)

System log access on remote hosts.

### `syslog`

Access system log files (/var/log).

#### Parameters

- **host**: SSH hostname (required)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)

#### Examples

```json
{ "action": "logs", "subaction": "syslog", "host": "tootie" }
{ "action": "logs", "subaction": "syslog", "host": "dookie", "lines": 50 }
{ "action": "logs", "subaction": "syslog", "host": "tootie", "lines": 100, "grep": "error" }
```

### `journal`

Access systemd journal logs.

#### Parameters

- **host**: SSH hostname (required)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **since**: ISO 8601 timestamp or relative time (e.g., "2024-01-15T10:00:00Z", "1h", "30m")
- **until**: ISO 8601 timestamp or relative time
- **unit**: Systemd unit name to filter (e.g., "docker.service", "nginx.service")
- **priority**: Log level filter - `emerg` | `alert` | `crit` | `err` | `warning` | `notice` | `info` | `debug`
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)

#### Examples

```json
{ "action": "logs", "subaction": "journal", "host": "tootie" }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "docker.service" }
{ "action": "logs", "subaction": "journal", "host": "tootie", "since": "1h" }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "nginx.service", "since": "2024-01-15T10:00:00Z", "until": "2024-01-15T11:00:00Z" }
{ "action": "logs", "subaction": "journal", "host": "tootie", "priority": "err", "lines": 50 }
{ "action": "logs", "subaction": "journal", "host": "dookie", "unit": "ssh.service", "priority": "warning", "grep": "Failed" }
```

### `dmesg`

Access kernel ring buffer logs.

#### Parameters

- **host**: SSH hostname (required)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)

#### Examples

```json
{ "action": "logs", "subaction": "dmesg", "host": "tootie" }
{ "action": "logs", "subaction": "dmesg", "host": "dookie", "lines": 100 }
{ "action": "logs", "subaction": "dmesg", "host": "tootie", "grep": "USB" }
```

### `auth`

Access authentication logs.

#### Parameters

- **host**: SSH hostname (required)
- **lines**: Number of log lines to retrieve (default: 100, max: 10000)
- **grep**: Filter log lines containing this string (case-sensitive; no shell metacharacters; max 200 chars)

#### Examples

```json
{ "action": "logs", "subaction": "auth", "host": "tootie" }
{ "action": "logs", "subaction": "auth", "host": "dookie", "lines": 200 }
{ "action": "logs", "subaction": "auth", "host": "tootie", "grep": "Failed password" }
```

---

## Scout Common Parameters

### Parameter Format Table

| Parameter              | Format                         | Example                                               |
|------------------------|--------------------------------|-------------------------------------------------------|
| `target`               | `hostname:/path`               | `tootie:/etc/nginx/nginx.conf`                        |
| `targets`              | `["hostname:/path", ...]`      | `["web1:/var/log/app.log", "web2:/var/log/app.log"]` |
| `source`/`destination` | local path OR `hostname:/path` | `/tmp/local.txt` or `tootie:/tmp/remote.txt`          |
| `host`                 | hostname only                  | `tootie`                                              |

All scout actions support:

| Parameter         | Type                  | Default    | Description   |
|-------------------|-----------------------|------------|---------------|
| `response_format` | `markdown` \| `json`  | `markdown` | Output format |

---

## Scout Discriminator Keys

Complete list of all 16 discriminator keys:

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

---

## Scout Schemas

### Discriminated Union Pattern

**Scout tool** uses `action` as the primary discriminator. Actions with variants use nested `subaction` discriminator:

```typescript
// Simple action (no subaction)
{ "action": "peek", ... }

// Action with subactions (nested discriminator)
{ "action": "zfs", "subaction": "pools", ... }
{ "action": "logs", "subaction": "journal", ... }
```

### Validation

```typescript
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

### Target Format Validation

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
```

### Nested Discriminators (zfs, logs)

```typescript
// Logs schema with nested discriminated union on subaction
const scoutLogsSchema = z.discriminatedUnion("subaction", [
  // Syslog
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("syslog"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: safeGrepSchema.optional(),
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
    grep: safeGrepSchema.optional(),
  }),
  // Kernel ring buffer
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("dmesg"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: safeGrepSchema.optional(),
  }),
  // Authentication logs
  z.object({
    action: z.literal("logs"),
    subaction: z.literal("auth"),
    host: z.string(),
    lines: z.number().int().min(1).max(10000).optional(),
    grep: safeGrepSchema.optional(),
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
```

### Example Schemas

```typescript
// Example simple action schema
const scoutPeekSchema = z.object({
  action: z.literal("peek"),
  target: scoutTargetSchema,
  tree: z.boolean().optional().default(false),
  depth: z.number().min(1).max(10).optional().default(3),
  response_format: responseFormatSchema.optional(),
});

const scoutExecSchema = z.object({
  action: z.literal("exec"),
  target: scoutTargetSchema,
  command: z.string().min(1).describe("Command validated against allowlist"),
  timeout: z.number().int().min(1).max(120).optional().default(30),
  response_format: responseFormatSchema.optional(),
});

const scoutPsSchema = z.object({
  action: z.literal("ps"),
  host: z.string().min(1),
  grep: safeGrepSchema.optional(),
  user: z.string().optional(),
  sort: z.enum(["cpu", "mem", "pid", "time"]).optional().default("cpu"),
  limit: z.number().int().min(1).max(1000).optional().default(50),
  response_format: responseFormatSchema.optional(),
});
```

---

## Appendix: Implementation Notes

### Help Handler Behavior

Help handlers run before schema validation and introspect the discriminated union schemas using Zod's `.describe()` metadata:

```typescript
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

**Grep validation note:** Help output does not enforce validation, but all `grep` fields are validated by the schemas. Patterns must not include shell metacharacters and must be 1–200 characters.

### Schema Composition Patterns

**Flux**: Composite discriminator requires preprocessor to inject `action_subaction` key before validation.

**Scout**: Primary discriminator on `action`, with nested discriminators for `zfs` and `logs` actions.

Both patterns achieve O(1) validation complexity through Zod's discriminated union implementation.

### Common Parameter Inheritance

All schemas can inherit from base schemas for common parameters:

```typescript
const baseSchema = z.object({
  response_format: z.enum(["markdown", "json"]).default("markdown"),
});

const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

// Compose schemas
const containerListSchema = baseSchema.merge(paginationSchema).extend({
  action: z.literal("container"),
  subaction: z.literal("list"),
  action_subaction: z.literal("container:list"),
  // ... additional fields
});
```
