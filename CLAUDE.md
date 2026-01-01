# CLAUDE.md - synapse-mcp

## Project Overview
MCP server for managing Docker infrastructure across multiple homelab hosts.

## Tech Stack
- TypeScript 5.7+ with strict mode
- Node.js ES2022 modules (ESM)
- Zod for runtime validation
- dockerode for Docker API
- Express for HTTP transport
- Vitest for testing

## Commands
- `pnpm run build` - Compile TypeScript
- `pnpm run dev` - Watch mode
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Run Prettier
- `pnpm test` - Run tests
- `pnpm run test:coverage` - Run tests with coverage

## Architecture
```
src/
├── index.ts                    # MCP server setup with stdio/HTTP transports
├── types.ts                    # TypeScript type definitions & interfaces
├── constants.ts                # Configuration constants & defaults
├── formatters/
│   └── index.ts                # Markdown/JSON response formatters
├── tools/
│   ├── index.ts                # Tool registration (flux & scout)
│   ├── flux.ts                 # Flux tool: Docker infrastructure (40 actions)
│   ├── scout.ts                # Scout tool: SSH remote operations (12 actions)
│   └── handlers/               # Handler functions for each action (21 files)
│       ├── docker.ts           # Container image & daemon operations
│       ├── container.ts        # Container lifecycle management
│       ├── compose.ts          # Docker Compose orchestration
│       ├── compose-handlers.ts # Compose action dispatchers
│       ├── compose-utils.ts    # Compose parsing & utilities
│       ├── host.ts             # Host system operations
│       ├── scout-simple.ts     # SSH simple commands (9 actions)
│       ├── scout-logs.ts       # Log file retrieval (4 actions)
│       └── scout-zfs.ts        # ZFS pool operations (3 actions)
├── services/                   # Core business logic services
│   ├── container.ts            # Dependency injection container
│   ├── interfaces.ts           # Service interface contracts
│   ├── docker.ts               # dockerode wrapper & API client
│   ├── compose.ts              # Compose file validation & execution
│   ├── compose-scanner.ts      # Compose file scanning & parsing
│   ├── compose-discovery.ts    # Auto-discovery of compose files
│   ├── compose-cache.ts        # Project state caching
│   ├── ssh-pool.ts             # SSH connection pooling & lifecycle
│   ├── ssh-pool-exec.ts        # SSH command execution via pool
│   ├── ssh-service.ts          # SSH command execution wrapper
│   ├── ssh-config-loader.ts    # SSH config file parsing
│   ├── host-resolver.ts        # Host address resolution
│   ├── local-executor.ts       # Local command execution
│   ├── file-service.ts         # File operations utility
│   └── ssh.ts                  # Legacy SSH module
├── schemas/                    # Zod validation schemas
│   ├── common.ts               # Shared validators & discriminators
│   ├── discriminator.ts        # Discriminator utilities
│   ├── flux/                   # Flux action schemas (40 actions)
│   │   ├── container.ts
│   │   ├── compose.ts
│   │   ├── docker.ts
│   │   └── host.ts
│   └── scout/                  # Scout action schemas (12 actions)
│       ├── simple.ts
│       ├── logs.ts
│       └── zfs.ts
└── utils/                      # Shared utilities
    ├── errors.ts               # Custom error classes
    ├── help.ts                 # Help documentation generation
    ├── command-security.ts     # Input sanitization & validation
    ├── path-security.ts        # Path traversal prevention
    ├── host-utils.ts           # Host utility functions
    └── index.ts                # Utility exports
```

## Code Conventions
- TDD: Write failing test first, then implement
- Use async/await, no callbacks
- All functions must have explicit return types
- Validate inputs with Zod schemas
- Sanitize all SSH inputs (see ssh.ts patterns)
- Use console.error for logging (stdout reserved for MCP)
- Mask sensitive env vars in output
- Use execFile for spawning processes (not shell)

## Error Handling
- Use custom error classes (HostOperationError, SSHCommandError, ComposeOperationError)
- Chain errors to preserve stack traces
- Use logError utility for structured logging
- Never silently catch without logging
- See docs/error-handling.md for details

## Adding New Actions to Flux or Scout (TDD Flow)

### For new Flux action:
1. Write test for new schema validation in `src/schemas/flux/[category].test.ts`
2. Add Zod schema in `src/schemas/flux/[category].ts` (container/compose/docker/host) — verify test passes
3. Write test for handler function in `src/tools/handlers/[category].test.ts`
4. Implement handler in `src/tools/handlers/[category].ts` — verify test passes
5. Register action in `src/tools/flux.ts` with proper dispatch logic
6. Update help documentation in `src/utils/help.ts`
7. Update README.md with new action

### For new Scout action:
1. Write test for new schema validation in `src/schemas/scout/[category].test.ts`
2. Add Zod schema in `src/schemas/scout/[category].ts` (simple/logs/zfs) — verify test passes
3. Write test for handler function in `src/tools/handlers/scout-[category].test.ts`
4. Implement handler in `src/tools/handlers/scout-[category].ts` — verify test passes
5. Register action in `src/tools/scout.ts` with proper dispatch logic
6. Update help documentation in `src/utils/help.ts`
7. Update README.md with new action

## Security Notes
- Docker API on port 2375 is insecure without TLS
- Always use execFile for shell commands (prevents injection)
- Validate host config fields with regex
- Require force=true for destructive operations
