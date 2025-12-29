# CLAUDE.md - homelab-mcp-server

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
├── index.ts          # Entry point, transport setup
├── types.ts          # TypeScript interfaces
├── constants.ts      # Configuration constants
├── tools/index.ts    # MCP tool registrations
├── services/
│   ├── docker.ts     # Docker API client
│   ├── ssh.ts        # SSH command runner
│   └── compose.ts    # Docker Compose management
└── schemas/index.ts  # Zod validation schemas
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

## Adding New Tools (TDD Flow)
1. Write test for new schema validation
2. Add Zod schema in src/schemas/index.ts — see test pass
3. Write test for service function behavior
4. Add service function — see test pass
5. Write test for tool registration (optional)
6. Register tool in src/tools/index.ts
7. Add formatting helper for markdown output
8. Update README.md tools table

## Security Notes
- Docker API on port 2375 is insecure without TLS
- Always use execFile for shell commands (prevents injection)
- Validate host config fields with regex
- Require force=true for destructive operations
