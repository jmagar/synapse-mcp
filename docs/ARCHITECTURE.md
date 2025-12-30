# Architecture: V3 Schema Refactor

## Design Principles

1. **Tool Separation**: Docker operations (flux) separated from SSH operations (scout)
2. **O(1) Validation**: Discriminated unions for constant-time schema validation
3. **Auto-Generated Help**: Schema introspection for documentation
4. **No Backward Compatibility**: Clean break from V2 unified tool

## Schema Architecture

### Flux Tool

Uses **composite discriminator** pattern:
- Discriminator key: `action_subaction` (e.g., "container:list")
- Injected via `z.preprocess()` for backward compatibility with action/subaction input
- 39 discriminator keys across 4 actions

### Scout Tool

Uses **primary discriminator** pattern:
- Discriminator key: `action`
- Nested discriminators for `zfs` and `logs` actions
- 11 top-level actions, 16 total discriminator keys

## File Structure

```
src/
├── schemas/
│   ├── common.ts           # Shared schemas + preprocessor
│   ├── flux/
│   │   ├── index.ts        # Flux discriminated union
│   │   ├── container.ts    # Container schemas (14)
│   │   ├── compose.ts      # Compose schemas (9)
│   │   ├── docker.ts       # Docker schemas (9)
│   │   └── host.ts         # Host schemas (7)
│   └── scout/
│       ├── index.ts        # Scout discriminated union
│       ├── simple.ts       # Simple actions (9)
│       ├── zfs.ts          # ZFS nested discriminator (3)
│       └── logs.ts         # Logs nested discriminator (4)
├── tools/
│   ├── flux.ts             # Flux handler + help
│   ├── scout.ts            # Scout handler + help
│   └── handlers/           # Action-specific handlers (TBD)
└── utils/
    └── help.ts             # Help introspection with unwrapping
```

## Performance

### Validation
- **Before (union)**: O(n) worst-case (try each schema)
- **After (discriminated union)**: O(1) (direct lookup)
- **Latency**: <0.005ms typical

### Help Generation
- Uses Zod schema introspection
- Unwraps `z.preprocess()` wrappers automatically
- Extracts types, descriptions, defaults from schema metadata
- No manual documentation maintenance

## Breaking Changes

**V3 is a complete rewrite:**
- Unified `homelab` tool deleted entirely
- Two new tools: `flux` (Docker) and `scout` (SSH)
- `container:unpause` → `container:resume`
- Scout actions restructured with nested discriminators
- MCP SDK 1.25.1 API (`registerTool` instead of `addTool`)
