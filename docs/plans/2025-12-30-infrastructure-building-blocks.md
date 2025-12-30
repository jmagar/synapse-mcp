# Infrastructure Building Blocks Implementation Plan
**Date:** 2025-12-30
**Status:** In Progress
**Type:** Feature Implementation

## Overview

Implement general-purpose infrastructure introspection building blocks that enable workflow composition via Claude Code skills and slash commands. This transforms synapse-mcp from a Docker management tool into a full-fledged Claude plugin for homelab infrastructure orchestration.

## Context

From brainstorming session (`.docs/2025-12-30-workflow-infrastructure-tools-brainstorm.md`):

**Key Evolution:**
1. Started with deployment feature idea
2. Evolved to general-purpose building blocks
3. Final realization: Ship Claude Code **skills** (not just commands) with the MCP server

**Why Skills Over Commands:**
- Skills provide full workflow context and instructions
- Commands become simple shims that invoke skills
- Skills define exactly how to use the building blocks
- Lower barrier to entry for creating custom workflows

## Architecture

### Building Blocks (MCP Tool Subactions)

**Priority 1 - Critical for Deployment:**
- `flux host:ports` - All ports in use (host + docker + compose)
- `flux docker:config` - Learned infrastructure patterns
- `flux host:resources` - CPU/RAM/disk usage + capacity

**Priority 2 - Health & Diagnostics:**
- `flux host:doctor` - Comprehensive health diagnostics
- `flux container:health` - Detailed container health

**Priority 3 - Advanced Features:**
- `flux docker:volumes` - All volume mounts with usage
- `flux docker:networks` - All networks with containers
- `flux docker:dependencies` - Service dependency graph
- `flux docker:events` - Recent Docker events
- `flux docker:inventory` - Complete resource manifest
- `flux docker:outdated` - Images with available updates
- `flux host:compare` - Compare two hosts
- `flux docker:drift` - Detect config drift from compose files

### Workflow Distribution

**Structure:**
```
.claude/
├── skills/                    # Rich workflow definitions
│   ├── deployment.md          # Deploy service workflow
│   ├── troubleshooting.md     # Diagnose issues workflow
│   └── health-check.md        # System health workflow
└── commands/                   # Shims to invoke skills
    ├── deploy.md              # /deploy -> invoke deployment skill
    ├── troubleshoot.md        # /troubleshoot -> invoke skill
    └── health.md              # /health -> invoke skill
```

**Relationship:**
- Skills contain full context, examples, edge cases
- Commands are thin wrappers that invoke skills
- Users can bypass commands and invoke skills directly

## Implementation Tasks

### Task 1: Schema Infrastructure ✅
**Status:** Complete (from existing codebase)

**Already Have:**
- Discriminated union pattern for O(1) validation
- Pagination schema pattern (limit, offset)
- Zod v4.2+ validation
- Schema description automation

**No Changes Needed**

### Task 2: Implement `flux host:ports`
**Priority:** P1 - Critical for deployment collision avoidance

**Schema:** `src/schemas/flux/host.ts` (new file)
```typescript
export const hostPortsSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("ports"),
  host: z.string(),
  ...paginationSchema.shape,
  filter: z.object({
    protocol: z.enum(["tcp", "udp"]).optional(),
    state: z.enum(["listening", "bound", "reserved"]).optional(),
    source: z.enum(["host", "docker", "compose"]).optional(),
  }).optional(),
}).describe("List all ports in use (host + docker + compose)");
```

**Data Sources:**
1. Host OS: `ss -tuln` via scout exec
2. Docker: Container inspect for all containers (running + stopped)
3. Compose: Parse all discovered compose files from cache

**Service:** `src/services/port-analyzer.ts` (new file)
- Merge data from all three sources
- Deduplicate and prioritize (actual > reserved)
- Format for markdown output

**Tests:**
- Unit: Port analyzer with mocked data sources
- Integration: End-to-end with real Docker state

**Deliverable:**
- Working `flux host:ports` tool
- Pagination support
- Markdown formatter
- ~15 tests

### Task 3: Implement `flux docker:config`
**Priority:** P1 - Enables smart defaults for deployment

**Schema:** `src/schemas/flux/docker.ts` (new file)
```typescript
export const dockerConfigSchema = z.object({
  action: z.literal("docker"),
  subaction: z.literal("config"),
  host: z.string(),
}).describe("Learned infrastructure patterns from cache + Docker state");
```

**Data Sources:**
1. Compose discovery cache (`.cache/compose-projects/{hostname}.json`)
2. Docker inspect for all containers
3. Docker volume list
4. Docker network list

**Service:** `src/services/pattern-detector.ts` (new file)
- Analyze compose locations (most common directory)
- Detect appdata patterns (bind mount paths)
- Identify volume preference (bind vs named)
- Find common networks
- Detect environment variable patterns (PUID, PGID, TZ)
- Determine restart policy preference

**Output Format:**
```typescript
interface InfrastructureConfig {
  compose: {
    primary_location: string;
    total_projects: number;
    locations: Record<string, number>;
  };
  appdata: {
    primary_location: string;
    pattern: string;
    examples: string[];
  };
  volumes: {
    preference: "bind_mounts" | "named_volumes";
    bind_mount_count: number;
    named_volume_count: number;
  };
  networks: {
    common_networks: string[];
    custom_network_usage: string; // percentage
  };
  restart_policies: {
    most_common: string;
    distribution: Record<string, number>;
  };
  environment: {
    common_vars: string[];
    patterns: Record<string, string>;
  };
}
```

**Tests:**
- Unit: Pattern detection with mock data
- Integration: Real compose cache + Docker state

**Deliverable:**
- Working `flux docker:config` tool
- Pattern detection algorithms
- Confidence scoring
- ~12 tests

### Task 4: Implement `flux host:resources`
**Priority:** P1 - Capacity planning for deployment

**Schema:** Extend `src/schemas/flux/host.ts`
```typescript
export const hostResourcesSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("resources"),
  host: z.string(),
  include_top_consumers: z.boolean().default(true),
  top_n: z.number().min(1).max(20).default(5),
}).describe("CPU/RAM/disk usage + capacity headroom");
```

**Data Sources:**
1. Docker stats API (container resource usage)
2. Host OS: `/proc/meminfo`, `/proc/stat`, `df` via scout exec
3. Top processes: `ps aux` via scout exec

**Service:** `src/services/resource-analyzer.ts` (new file)
- Aggregate Docker container stats
- Query host system resources
- Calculate available headroom
- Rank top consumers

**Tests:**
- Unit: Resource calculation with mock data
- Integration: Real system state

**Deliverable:**
- Working `flux host:resources` tool
- Resource calculation utilities
- Top consumer ranking
- ~10 tests

### Task 5: Implement `flux host:doctor`
**Priority:** P2 - Health diagnostics

**Schema:** Extend `src/schemas/flux/host.ts`
```typescript
export const hostDoctorSchema = z.object({
  action: z.literal("host"),
  subaction: z.literal("doctor"),
  host: z.string(),
  checks: z.array(z.enum([
    "resources",
    "containers",
    "logs",
    "processes",
    "docker",
    "network",
  ])).optional(), // Run all if not specified
}).describe("Comprehensive health diagnostics");
```

**Checks:**
1. Resources: RAM >90%, disk >85% warnings
2. Containers: Restart loops, crash detection
3. Logs: Recent errors from syslog/journald
4. Processes: Runaway CPU/memory
5. Docker: Daemon health, events
6. Network: Connectivity issues

**Service:** `src/services/health-checker.ts` (new file)
- Run diagnostic checks
- Classify severity (ok, warning, error)
- Generate recommendations

**Tests:**
- Unit: Each check type with mock data
- Integration: Real system diagnostics

**Deliverable:**
- Working `flux host:doctor` tool
- Diagnostic check suite
- Recommendation engine
- ~18 tests

### Task 6: Implement `flux container:health`
**Priority:** P2 - Container-specific diagnostics

**Schema:** `src/schemas/flux/container.ts` (extend existing)
```typescript
export const containerHealthSchema = z.object({
  action: z.literal("container"),
  subaction: z.literal("health"),
  host: z.string(),
  container: z.string(),
}).describe("Detailed health for specific container");
```

**Data Sources:**
1. Docker inspect (health check status)
2. Docker stats (resource usage)
3. Docker logs (recent errors/warnings)
4. Container events (restarts, stops)

**Service:** Extend existing container service

**Tests:**
- Unit: Health analysis with mock container data
- Integration: Real container state

**Deliverable:**
- Working `flux container:health` tool
- Enhanced container service
- ~8 tests

### Task 7: Create Deployment Workflow Skill
**Priority:** P1 - First workflow to ship

**File:** `.claude/skills/deployment.md`

**Content Structure:**
```markdown
---
name: deployment
description: Deploy Docker services with smart infrastructure analysis
version: 1.0.0
---

# Deployment Workflow

## Overview
Deploy a new Docker service to a homelab host with bulletproof collision avoidance and smart defaults.

## Prerequisites
- Service documentation URL (official docs preferred)
- Target host name
- Service name

## Workflow Steps

### 1. Research Phase
Use WebSearch and WebFetch to gather official deployment documentation.

**Example:**
```
WebSearch: "{service_name} docker compose official documentation"
WebFetch: {top result URL}
```

### 2. Infrastructure Analysis
Run building block tools to understand current state.

**Required:**
- `flux host:ports {host}` - Identify available ports
- `flux docker:config {host}` - Learn infrastructure patterns
- `flux host:resources {host}` - Check capacity

**Example:**
```
flux({ action: "host", subaction: "ports", host: "squirts" })
flux({ action: "docker", subaction: "config", host: "squirts" })
flux({ action: "host", subaction: "resources", host: "squirts" })
```

### 3. Compose File Generation
Synthesize docker-compose.yaml using:
- Service requirements from documentation
- Available ports from port analysis
- Infrastructure patterns from config analysis
- Capacity constraints from resource analysis

**Smart Defaults:**
- Port allocation: First available in sequence
- Volume paths: Follow existing appdata pattern
- Networks: Reuse common networks or create new
- Restart policy: Match most common
- Environment: Include PUID/PGID/TZ from patterns

### 4. Conflict Validation
Verify no collisions:
- Ports: Must not conflict with any source (host/docker/compose)
- Volumes: Must not overlap existing paths
- Network names: Check for conflicts
- Service names: Must be unique

### 5. Deployment Plan
Show user:
- Generated docker-compose.yaml
- Detected conflicts (if any)
- Resource impact estimate
- Recommended location

### 6. Execution
After user confirmation:
- Create directory structure
- Write docker-compose.yaml
- Run `docker compose up -d`
- Verify health

## Edge Cases

### Port Conflicts
If all preferred ports are taken:
- Suggest alternative port range
- Check user preference for auto-increment

### Insufficient Resources
If host is >80% capacity:
- Warn user about performance impact
- Suggest alternative hosts

### Pattern Ambiguity
If multiple patterns with equal weight:
- Default to most conservative choice
- Ask user for preference

## Error Handling

### Network Failures
If WebFetch fails:
- Try alternative documentation sources
- Ask user for manual compose file

### Docker Failures
If `docker compose up` fails:
- Parse error logs
- Suggest fixes
- Offer rollback

## Examples

### Example 1: Deploy Plex on squirts
```
User: /deploy plex squirts

Claude:
1. WebSearch: "plex docker compose official documentation"
2. WebFetch: https://docs.plex.tv/docker/
3. flux({ action: "host", subaction: "ports", host: "squirts" })
   Result: Port 32400 in use by existing plex
4. flux({ action: "docker", subaction: "config", host: "squirts" })
   Result: appdata pattern is /mnt/cache/appdata/{service}
5. Generate compose:
   - Port: 32401 (32400 taken)
   - Volume: /mnt/cache/appdata/plex:/config
   - Network: media (existing)
6. Show plan and await confirmation
7. Deploy
```

## Success Criteria
- Service starts successfully
- All health checks pass
- No resource conflicts
- Follows infrastructure patterns
```

### Task 8: Create Command Shim for Deployment
**Priority:** P1 - Enable easy workflow invocation

**File:** `.claude/commands/deploy.md`

**Content:**
```markdown
---
description: Deploy a service with smart infrastructure analysis
---

Use the deployment skill to deploy {{service_name}} to {{host_name}}.

Invoke the `deployment` skill with the following context:
- Service: {{service_name}}
- Host: {{host_name}}
- Additional args: {{args}}
```

**This is intentionally minimal** - the skill contains all the logic.

### Task 9: Create Additional Skills
**Priority:** P2

**Files to Create:**
- `.claude/skills/troubleshooting.md` - Diagnose service issues
- `.claude/skills/health-check.md` - System health assessment
- `.claude/skills/migration.md` - Migrate services between hosts

**Commands to Create:**
- `.claude/commands/troubleshoot.md`
- `.claude/commands/health.md`
- `.claude/commands/migrate.md`

### Task 10: Documentation
**Priority:** P1

**Update README.md:**
- Add "Claude Plugin" section
- Document shipped skills and commands
- Explain skill vs command relationship
- Provide examples

**Create `.docs/creating-workflows.md`:**
- Guide for writing custom skills
- Best practices for workflow composition
- Building block catalog
- Skill template

## Open Questions

### Q1: Pagination Pattern for New Subactions
**Question:** Should new subactions reuse existing `paginationSchema`?

**Context:** User asked "reuse what patterns?" - need to clarify.

**Answer:** YES - reuse existing pagination pattern
```typescript
import { paginationSchema } from './pagination.ts';

export const hostPortsSchema = z.object({
  // ... other fields
  ...paginationSchema.shape, // limit, offset
});
```

**Rationale:**
- Consistent UX across all tools
- Already tested and working
- Supports filtering extensions

### Q2: Where Should Deployment Subactions Live?
**Options:**
A) New `deploy` action: `flux({ action: "deploy", subaction: "create" })`
B) Extend `compose`: `flux({ action: "compose", subaction: "deploy" })`
C) New top-level tool: `deploy({ ... })`

**Decision:** Option A - New `deploy` action
- Clearer separation of concerns
- Deployment is conceptually different from managing existing compose
- Follows existing action/subaction pattern

### Q3: Detection Method for Host Port Usage
**Options:**
- `ss -tuln` - Fast, standard
- `lsof -i` - More detailed
- `netstat -tuln` - Older, widely available

**Decision:** Use `ss -tuln` with fallback to `netstat`
- `ss` is modern and fast
- `netstat` fallback for compatibility
- Parse both outputs with same regex patterns

### Q4: Docker Event History Window
**For `flux docker:events`:**

**Decision:** Last 1 hour default, configurable
```typescript
window: z.enum(["1h", "24h", "7d"]).default("1h")
```

### Q5: Should Building Blocks Update Cache?
**Decision:** Read-only for now
- Keep cache management in compose discovery service
- Building blocks are read-only introspection
- Avoids cache corruption from multiple writers
- Can revisit if needed

## Success Criteria

### Phase 1 (MVP) - P1 Tasks Complete
- ✅ `flux host:ports` working with pagination
- ✅ `flux docker:config` with pattern detection
- ✅ `flux host:resources` with capacity analysis
- ✅ Deployment skill shipped
- ✅ Deploy command shim working
- ✅ All tests passing
- ✅ Documentation complete

### Phase 2 (Enhanced) - P2 Tasks Complete
- ✅ `flux host:doctor` comprehensive diagnostics
- ✅ `flux container:health` detailed health
- ✅ Troubleshooting skill shipped
- ✅ Health check skill shipped
- ✅ Migration skill shipped

### Phase 3 (Advanced) - P3 Tasks
- ⬜ All remaining building blocks implemented
- ⬜ Workflow marketplace documentation
- ⬜ Advanced skills (capacity planning, security audit, etc.)

## Timeline

**Phase 1 (This Session):** Tasks 1-4, 7-8
- Schema infrastructure (already complete)
- Core building blocks (ports, config, resources)
- Deployment skill + command

**Phase 2 (Next Session):** Tasks 5-6, 9
- Health diagnostics building blocks
- Additional skills

**Phase 3 (Future):** Task 10, P3 building blocks
- Advanced features
- Community contributions

## Related Work

### Compose Auto-Discovery
**File:** `docs/plans/2025-12-30-compose-auto-discovery.md`

**Integration:**
- `flux docker:config` will read from compose discovery cache
- Pattern detection reuses discovery infrastructure
- Cache structure: `.cache/compose-projects/{hostname}.json`

### SSH Config Auto-Loading
**Completed:** See `.docs/2025-12-30-schema-descriptions-and-ssh-config.md`

**Benefits:**
- Zero configuration for hosts
- All 7 user hosts already discovered
- SSH tunneling for Docker API

## Risk Mitigation

### Performance Risk
**Concern:** Comprehensive scanning could be slow

**Mitigation:**
- Implement caching aggressively
- Parallel execution where possible
- Progress indicators
- Make thoroughness configurable

### Pattern Detection Accuracy
**Concern:** Might guess wrong patterns

**Mitigation:**
- Return confidence scores
- Allow user override
- Log detected patterns
- Start conservative

## Appendix: Building Block Catalog

See `.docs/2025-12-30-workflow-infrastructure-tools-brainstorm.md` for:
- Complete building block specifications
- Output format examples
- Use case scenarios
- Design philosophy
