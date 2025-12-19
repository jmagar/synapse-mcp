# homelab-mcp-server Improvement Plan (TDD Edition)

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Overview

Comprehensive improvements to add Docker Compose support, testing, linting, performance optimizations, and code quality enhancements.

**Methodology:** Test-Driven Development (TDD) — Every task follows Red-Green-Refactor.

---

## Prerequisites

### Development Machine
- **Node.js** 18+ (`node --version`)
- **npm** 9+ (`npm --version`)
- **SSH Client** for remote host access (`ssh -V`)

### Target Hosts (Remote)
- **Docker Engine** 20.10+ (`docker --version`)
- **Docker Compose CLI** v2.x (`docker compose version`)
- **SSH Server** with key-based authentication enabled
- **User Permissions**: SSH user must be in `docker` group or have root access

### Network Requirements
- SSH access (port 22) from dev machine to all remote hosts
- Docker API via Unix socket or TCP (2375/2376)

### Verification
```bash
# Local
node --version && npm --version && ssh -V

# Remote (per host)
ssh user@host 'docker compose version && docker ps'
```

---

## Phase 1: Test Infrastructure & Foundation

> **Rationale:** Test framework MUST be set up first so all subsequent tasks can follow TDD.

### Task 1.1: Set Up Test Framework

**Goal:** Install and configure Vitest before writing any code.

**Steps:**
```bash
# Install test dependencies
npm install -D vitest @vitest/coverage-v8
```

**Create `vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts']
    }
  }
});
```

**Add to `package.json` scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Verification:**
```bash
npm test  # Should run with 0 tests found (expected)
```

---

### Task 1.2: Add ESLint + Prettier (with validation test)

**🔴 RED — Write test first:**

Create `src/lint.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Linting Configuration', () => {
  it('eslint.config.js should exist', () => {
    expect(existsSync(join(process.cwd(), 'eslint.config.js'))).toBe(true);
  });

  it('.prettierrc.json should exist', () => {
    expect(existsSync(join(process.cwd(), '.prettierrc.json'))).toBe(true);
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL: files don't exist
```

**🟢 GREEN — Create config files:**

Install dependencies:
```bash
npm install -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

Create `eslint.config.js`:
```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/']
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn'
    }
  }
);
```

Create `.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100
}
```

Create `.prettierignore`:
```
dist/
node_modules/
coverage/
*.md
```

Add scripts to `package.json`:
```json
{
  "scripts": {
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "format:check": "prettier --check src/"
  }
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

**🔵 REFACTOR:** Run linting on existing code:
```bash
npm run lint:fix
npm run format
```

**Checkpoint:** ✅ `npm test && npm run lint` passes

---

### Task 1.3: Create CLAUDE.md (with validation test)

**🔴 RED — Write test first:**

Add to `src/lint.test.ts`:
```typescript
it('CLAUDE.md should exist', () => {
  expect(existsSync(join(process.cwd(), 'CLAUDE.md'))).toBe(true);
});

it('CLAUDE.md should contain required sections', () => {
  const content = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf-8');
  expect(content).toContain('## Commands');
  expect(content).toContain('## Architecture');
  expect(content).toContain('## Code Conventions');
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL
```

**🟢 GREEN — Create CLAUDE.md:**

```markdown
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
- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm run lint` - Run ESLint
- `npm run format` - Run Prettier
- `npm test` - Run tests
- `npm run test:coverage` - Run tests with coverage

## Architecture
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

## Code Conventions
- TDD: Write failing test first, then implement
- Use async/await, no callbacks
- All functions must have explicit return types
- Validate inputs with Zod schemas
- Sanitize all SSH inputs (see ssh.ts patterns)
- Use console.error for logging (stdout reserved for MCP)
- Mask sensitive env vars in output
- Use execFile for spawning processes (not shell)

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
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

**Checkpoint:** ✅ `npm test` passes

---

### Task 1.4: Update .gitignore

Add to `.gitignore`:
```
# Test coverage
coverage/

# ESLint cache
.eslintcache
```

**Checkpoint:** ✅ No test needed (non-code change)

---

## Phase 2: Code Cleanup & Existing Function Tests

> **Rationale:** Add test coverage to existing code BEFORE modifying it.

### Task 2.1: Test Existing Utility Functions

**🔴 RED — Write tests for existing functions:**

Create `src/services/docker.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatBytes, formatUptime } from './docker.js';

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1KB', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('formatUptime', () => {
  it('formats minutes only', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(formatUptime(thirtyMinsAgo)).toBe('30m');
  });

  it('formats hours and minutes', () => {
    const twoHoursAgo = new Date(Date.now() - 2.25 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(twoHoursAgo)).toBe('2h 15m');
  });

  it('formats days and hours', () => {
    const threeDaysAgo = new Date(Date.now() - 3.2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(threeDaysAgo)).toMatch(/^3d \d+h$/);
  });
});
```

**Run test — expect PASS (functions already exist):**
```bash
npm test  # 🟢 PASS — validates existing code works
```

**Checkpoint:** ✅ Existing code now has test coverage

---

### Task 2.2: Test and Export isSocketPath

**🔴 RED — Write test for unexported function:**

Add to `src/services/docker.test.ts`:
```typescript
import { isSocketPath } from './docker.js';

describe('isSocketPath', () => {
  it('detects /var/run/docker.sock', () => {
    expect(isSocketPath('/var/run/docker.sock')).toBe(true);
  });

  it('detects paths with /run/', () => {
    expect(isSocketPath('/run/user/1000/docker.sock')).toBe(true);
  });

  it('detects paths with /docker', () => {
    expect(isSocketPath('/home/user/docker/docker.sock')).toBe(true);
  });

  it('rejects IP addresses', () => {
    expect(isSocketPath('192.168.1.100')).toBe(false);
  });

  it('rejects hostnames', () => {
    expect(isSocketPath('unraid.local')).toBe(false);
  });
});
```

**Run test — expect FAIL (function not exported):**
```bash
npm test  # 🔴 FAIL: isSocketPath is not exported
```

**🟢 GREEN — Export the function:**

Edit `src/services/docker.ts` — add `export` to function:
```typescript
export function isSocketPath(value: string): boolean {
  // ... existing implementation
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

**Checkpoint:** ✅ `npm test` passes

---

### Task 2.3: Test SSH Sanitization Functions

**🔴 RED — Write tests:**

Create `src/services/ssh.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeForShell, validateHostForSsh } from './ssh.js';

describe('sanitizeForShell', () => {
  it('allows alphanumeric input', () => {
    expect(sanitizeForShell('myhost123')).toBe('myhost123');
  });

  it('allows dots, hyphens, underscores', () => {
    expect(sanitizeForShell('my-host.local_1')).toBe('my-host.local_1');
  });

  it('allows forward slashes for paths', () => {
    expect(sanitizeForShell('/var/run/docker.sock')).toBe('/var/run/docker.sock');
  });

  it('rejects semicolons (command injection)', () => {
    expect(() => sanitizeForShell('host; rm -rf /')).toThrow('Invalid characters');
  });

  it('rejects backticks (command substitution)', () => {
    expect(() => sanitizeForShell('`id`')).toThrow('Invalid characters');
  });

  it('rejects $() (command substitution)', () => {
    expect(() => sanitizeForShell('$(whoami)')).toThrow('Invalid characters');
  });

  it('rejects single quotes', () => {
    expect(() => sanitizeForShell("host'")).toThrow('Invalid characters');
  });
});

describe('validateHostForSsh', () => {
  it('accepts valid IPv4 host', () => {
    expect(() => validateHostForSsh({
      name: 'test', host: '192.168.1.1', protocol: 'http'
    })).not.toThrow();
  });

  it('accepts valid hostname', () => {
    expect(() => validateHostForSsh({
      name: 'test', host: 'unraid.local', protocol: 'http'
    })).not.toThrow();
  });

  it('rejects host with dangerous characters', () => {
    expect(() => validateHostForSsh({
      name: 'test', host: 'host; evil', protocol: 'http'
    })).toThrow('Invalid host format');
  });

  it('accepts valid SSH user', () => {
    expect(() => validateHostForSsh({
      name: 'test', host: 'localhost', protocol: 'http', sshUser: 'admin_user'
    })).not.toThrow();
  });

  it('rejects SSH user with dangerous characters', () => {
    expect(() => validateHostForSsh({
      name: 'test', host: 'localhost', protocol: 'http', sshUser: 'admin;rm'
    })).toThrow('Invalid SSH user');
  });
});
```

**Run test — expect FAIL (functions not exported):**
```bash
npm test  # 🔴 FAIL
```

**🟢 GREEN — Export the functions:**

Edit `src/services/ssh.ts`:
```typescript
export function sanitizeForShell(input: string): string {
  // ... existing implementation
}

export function validateHostForSsh(host: HostConfig): void {
  // ... existing implementation
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

**Checkpoint:** ✅ `npm test` passes

---

### Task 2.4: Remove Unused ssh2 Dependency

**Verification test (no code change needed — just verify):**
```bash
# Verify ssh2 is not imported anywhere
grep -r "from ['\"]ssh2" src/  # Should return nothing
grep -r "require.*ssh2" src/   # Should return nothing
```

**Remove dependency:**
```bash
npm uninstall ssh2 @types/ssh2
```

**Run tests:**
```bash
npm test  # 🟢 PASS — nothing broke
```

**Checkpoint:** ✅ `npm test` passes

---

## Phase 3: Docker Compose Support (TDD)

> **Prerequisite:** `docker compose` CLI must be installed on target hosts.

### Task 3.1: Test Compose Project Name Validation

**🔴 RED — Write test first:**

Create `src/services/compose.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateProjectName } from './compose.js';

describe('validateProjectName', () => {
  it('accepts alphanumeric names', () => {
    expect(() => validateProjectName('myproject123')).not.toThrow();
  });

  it('accepts hyphens and underscores', () => {
    expect(() => validateProjectName('my-project_1')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => validateProjectName('')).toThrow('Invalid project name');
  });

  it('rejects special characters', () => {
    expect(() => validateProjectName('project; rm -rf /')).toThrow('Invalid project name');
  });

  it('rejects spaces', () => {
    expect(() => validateProjectName('my project')).toThrow('Invalid project name');
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL: module not found
```

**🟢 GREEN — Create compose.ts with validation:**

Create `src/services/compose.ts`:
```typescript
/**
 * Validate compose project name
 */
export function validateProjectName(name: string): void {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid project name: ${name}`);
  }
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

**Checkpoint:** ✅ `npm test` passes

---

### Task 3.2: Test Compose Service Name Validation

**🔴 RED — Write test:**

Add to `src/services/compose.test.ts`:
```typescript
import { validateServiceName } from './compose.js';

describe('validateServiceName', () => {
  it('accepts valid service names', () => {
    expect(() => validateServiceName('web')).not.toThrow();
    expect(() => validateServiceName('db-primary')).not.toThrow();
  });

  it('rejects invalid characters', () => {
    expect(() => validateServiceName('web;evil')).toThrow();
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL
```

**🟢 GREEN — Add validation function:**

Add to `src/services/compose.ts`:
```typescript
export function validateServiceName(name: string): void {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid service name: ${name}`);
  }
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

---

### Task 3.3: Test SSH Args Builder for Compose

**🔴 RED — Write test:**

Add to `src/services/compose.test.ts`:
```typescript
import { buildComposeSshArgs } from './compose.js';

describe('buildComposeSshArgs', () => {
  it('includes BatchMode and timeout options', () => {
    const host = { name: 'test', host: '192.168.1.1', protocol: 'http' as const };
    const args = buildComposeSshArgs(host);
    expect(args).toContain('-o');
    expect(args.join(' ')).toContain('BatchMode=yes');
    expect(args.join(' ')).toContain('ConnectTimeout=10');
  });

  it('includes SSH key path when provided', () => {
    const host = {
      name: 'test',
      host: '192.168.1.1',
      protocol: 'http' as const,
      sshKeyPath: '/path/to/key'
    };
    const args = buildComposeSshArgs(host);
    expect(args).toContain('-i');
    expect(args).toContain('/path/to/key');
  });

  it('uses root as default user', () => {
    const host = { name: 'test', host: '192.168.1.1', protocol: 'http' as const };
    const args = buildComposeSshArgs(host);
    expect(args.some(a => a.includes('root@'))).toBe(true);
  });

  it('uses custom SSH user when provided', () => {
    const host = {
      name: 'test',
      host: '192.168.1.1',
      protocol: 'http' as const,
      sshUser: 'admin'
    };
    const args = buildComposeSshArgs(host);
    expect(args.some(a => a.includes('admin@'))).toBe(true);
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL
```

**🟢 GREEN — Implement:**

Add to `src/services/compose.ts`:
```typescript
import { HostConfig } from "../types.js";

export function buildComposeSshArgs(host: HostConfig): string[] {
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];

  if (host.sshKeyPath) {
    // Validate path before using
    if (!/^[a-zA-Z0-9._\-\/~]+$/.test(host.sshKeyPath)) {
      throw new Error(`Invalid SSH key path: ${host.sshKeyPath}`);
    }
    args.push("-i", host.sshKeyPath);
  }

  const user = host.sshUser || "root";
  const target = host.host.includes("/") ? "localhost" : host.host;
  args.push(`${user}@${target}`);

  return args;
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

---

### Task 3.4: Implement composeRun Function (TDD)

**🔴 RED — Write test for local execution:**

Add to `src/services/compose.test.ts`:
```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';

// Mock execFile for testing
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execFile: vi.fn()
  };
});

describe('composeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates project name before execution', async () => {
    const { composeRun } = await import('./compose.js');
    const host = { name: 'local', host: '/var/run/docker.sock', protocol: 'http' as const };

    await expect(composeRun(host, 'bad;project', ['ps']))
      .rejects.toThrow('Invalid project name');
  });
});
```

**🟢 GREEN — Implement composeRun:**

Add to `src/services/compose.ts`:
```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function composeRun(
  host: HostConfig,
  project: string,
  command: string[]
): Promise<string> {
  validateProjectName(project);

  const composeCmd = ["docker", "compose", "-p", project, ...command];

  // For local socket, run directly
  if (host.host.startsWith("/") || host.host === "localhost") {
    const { stdout } = await execFileAsync(composeCmd[0], composeCmd.slice(1), {
      timeout: 60000
    });
    return stdout;
  }

  // For remote hosts, use SSH
  const sshArgs = buildComposeSshArgs(host);
  sshArgs.push(composeCmd.join(" "));

  const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: 60000 });
  return stdout;
}
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

---

### Task 3.5: Implement getComposeStatus (TDD)

**🔴 RED — Write test:**

```typescript
describe('getComposeStatus', () => {
  it('returns stopped status when no services found', async () => {
    // Mock composeRun to return empty
    const { getComposeStatus } = await import('./compose.js');
    // ... test implementation
  });

  it('returns running when all services running', async () => {
    // Mock JSON output from docker compose ps
  });

  it('returns partial when some services stopped', async () => {
    // ...
  });
});
```

**🟢 GREEN — Implement:**

```typescript
export interface ComposeProject {
  name: string;
  status: "running" | "partial" | "stopped" | "unknown";
  services: ComposeService[];
}

export interface ComposeService {
  name: string;
  state: string;
  health?: string;
  ports: string[];
}

export async function getComposeStatus(
  host: HostConfig,
  project: string
): Promise<ComposeProject> {
  const output = await composeRun(host, project, ["ps", "--format", "json"]);

  const services: ComposeService[] = [];
  let runningCount = 0;

  for (const line of output.trim().split("\n").filter(l => l)) {
    try {
      const svc = JSON.parse(line);
      const state = svc.State || svc.Status || "unknown";
      services.push({
        name: svc.Service || svc.Name,
        state,
        health: svc.Health,
        ports: svc.Ports ? [svc.Ports] : []
      });
      if (state.includes("running") || state.includes("Up")) {
        runningCount++;
      }
    } catch {
      // Skip malformed lines
    }
  }

  let status: ComposeProject["status"] = "unknown";
  if (services.length === 0) {
    status = "stopped";
  } else if (runningCount === services.length) {
    status = "running";
  } else if (runningCount === 0) {
    status = "stopped";
  } else {
    status = "partial";
  }

  return { name: project, status, services };
}
```

---

### Task 3.6: Implement getComposeLogs (TDD)

**🔴 RED → 🟢 GREEN → 🔵 REFACTOR** (follow same pattern)

---

### Task 3.7: Implement composeAction (TDD)

**🔴 RED → 🟢 GREEN → 🔵 REFACTOR** (follow same pattern)

---

### Task 3.8: Update ComposeProjectSchema

**🔴 RED — Write schema validation tests:**

Create `src/schemas/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ComposeProjectSchema } from './index.js';

describe('ComposeProjectSchema', () => {
  it('accepts valid input', () => {
    const result = ComposeProjectSchema.parse({
      project: 'media-stack',
      action: 'status'
    });
    expect(result.project).toBe('media-stack');
  });

  it('rejects invalid project name', () => {
    expect(() => ComposeProjectSchema.parse({
      project: 'bad;name',
      action: 'status'
    })).toThrow();
  });

  it('requires force=true for down action', () => {
    expect(() => ComposeProjectSchema.parse({
      project: 'test',
      action: 'down',
      force: false
    })).toThrow();
  });

  it('allows down action with force=true', () => {
    const result = ComposeProjectSchema.parse({
      project: 'test',
      action: 'down',
      force: true
    });
    expect(result.action).toBe('down');
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL
```

**🟢 GREEN — Update schema:**

Edit `src/schemas/index.ts`:
```typescript
export const ComposeProjectSchema = z.object({
  project: z.string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "Project name must be alphanumeric with hyphens/underscores")
    .describe("Docker Compose project name"),
  host: z.string()
    .optional()
    .describe("Host where project is running"),
  action: z.enum(["status", "up", "down", "restart", "stop", "start", "logs"])
    .describe("Action to perform"),
  lines: z.number().int().min(1).max(1000).optional()
    .describe("Log lines (for logs action)"),
  service: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional()
    .describe("Specific service name"),
  force: z.boolean().default(false)
    .describe("Required for destructive actions (down)")
}).strict().refine(
  (data) => data.action !== 'down' || data.force === true,
  { message: "force=true required for 'down' action" }
);
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

---

### Task 3.9: Register homelab_compose Tool

Register the tool in `src/tools/index.ts` with proper error handling.

**Checkpoint:** ✅ `npm test && npm run lint` passes

---

## Phase 4: Performance Optimizations (TDD)

### Task 4.1: Test Parallel listContainers

**🔴 RED — Write test:**

Add to `src/services/docker.test.ts`:
```typescript
describe('listContainers parallelization', () => {
  it('should query multiple hosts in parallel', async () => {
    // This test verifies Promise.allSettled is used
    // by checking that a failing host doesn't block others
  });

  it('should return results even if one host fails', async () => {
    // Mock one host to fail, verify others still return
  });
});
```

**🟢 GREEN — Refactor to parallel:**

```typescript
export async function listContainers(
  hosts: HostConfig[],
  options: ListOptions = {}
): Promise<ContainerInfo[]> {
  const results = await Promise.allSettled(
    hosts.map(host => listContainersOnHost(host, options))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ContainerInfo[]> => r.status === "fulfilled")
    .flatMap(r => r.value);
}
```

---

### Task 4.2: Test Parallel getHostStatus

**🔴 RED → 🟢 GREEN** (same pattern as 4.1)

---

### Task 4.3: Parallelize Tool Loops

Update these functions in `src/tools/index.ts` to use `Promise.allSettled`:
- Docker info loop
- Docker disk usage loop
- Prune loop
- Host resources loop

---

### Task 4.4: Test Graceful Shutdown

**🔴 RED — Write test:**

Create `src/shutdown.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('graceful shutdown', () => {
  it('should clear docker clients on shutdown', async () => {
    const { clearDockerClients, dockerClients } = await import('./services/docker.js');

    // Add a mock client
    dockerClients.set('test', {} as any);
    expect(dockerClients.size).toBe(1);

    clearDockerClients();
    expect(dockerClients.size).toBe(0);
  });
});
```

**Run test — expect FAIL:**
```bash
npm test  # 🔴 FAIL: clearDockerClients not exported
```

**🟢 GREEN — Export and implement:**

Add to `src/services/docker.ts`:
```typescript
export { dockerClients };  // Export for testing

export function clearDockerClients(): void {
  dockerClients.clear();
}
```

Add to `src/index.ts`:
```typescript
import { clearDockerClients } from "./services/docker.js";

const shutdown = (signal: string): void => {
  console.error(`\n${signal} received, shutting down...`);
  clearDockerClients();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

**Run test — expect PASS:**
```bash
npm test  # 🟢 PASS
```

---

## Phase 5: ListImages Tool (TDD)

### Task 5.1: Test listImages Function

**🔴 RED — Write test:**

Add to `src/services/docker.test.ts`:
```typescript
describe('listImages', () => {
  it('should truncate image ID to 12 chars', async () => {
    // Mock docker.listImages response
  });

  it('should filter dangling images when option set', async () => {
    // Verify filter is passed to Docker API
  });

  it('should aggregate images from multiple hosts', async () => {
    // Verify parallel execution across hosts
  });
});
```

**🟢 GREEN — Implement:**

```typescript
export interface ImageInfo {
  id: string;
  tags: string[];
  size: number;
  created: string;
  containers: number;
  hostName: string;
}

export async function listImages(
  hosts: HostConfig[],
  options: { danglingOnly?: boolean } = {}
): Promise<ImageInfo[]> {
  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      const docker = getDockerClient(host);
      const images = await docker.listImages({
        filters: options.danglingOnly ? { dangling: ["true"] } : undefined
      });

      return images.map(img => ({
        id: img.Id.replace("sha256:", "").slice(0, 12),
        tags: img.RepoTags || ["<none>"],
        size: img.Size,
        created: new Date(img.Created * 1000).toISOString(),
        containers: img.Containers || 0,
        hostName: host.name
      }));
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ImageInfo[]> => r.status === "fulfilled")
    .flatMap(r => r.value);
}
```

---

### Task 5.2: Register homelab_list_images Tool

Register in `src/tools/index.ts` with schema from `ListImagesSchema`.

---

## Phase 6: Low Priority Enhancements (TDD)

### Task 6.1: Test Rate Limiting

**🔴 RED — Write test:**

```typescript
describe('rate limiting', () => {
  it('should return 429 after exceeding limit', async () => {
    // Make 101 requests in quick succession
    // Verify 429 response
  });
});
```

**🟢 GREEN — Implement:**

```bash
npm install express-rate-limit
```

Add to `src/index.ts`:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  message: { error: 'Too many requests' }
});

app.use('/mcp', limiter);
```

---

### Task 6.2: Test Connection Health Check

**🔴 RED — Write test:**

```typescript
describe('connection health', () => {
  it('checkConnection returns true for healthy host', async () => {
    // Mock docker.ping() success
  });

  it('checkConnection removes stale client on failure', async () => {
    // Mock docker.ping() failure, verify cache cleared
  });
});
```

**🟢 GREEN — Implement:**

```typescript
export async function checkConnection(host: HostConfig): Promise<boolean> {
  const cacheKey = `${host.name}-${host.host}`;
  try {
    const docker = getDockerClient(host);
    await docker.ping();
    return true;
  } catch {
    dockerClients.delete(cacheKey);
    return false;
  }
}
```

---

## Implementation Order

| # | Task | Type | Est. Time |
|---|------|------|-----------|
| 1 | Task 1.1: Test framework setup | Setup | 15min |
| 2 | Task 1.2: ESLint + Prettier (TDD) | TDD | 30min |
| 3 | Task 1.3: CLAUDE.md (TDD) | TDD | 15min |
| 4 | Task 1.4: Update .gitignore | Config | 5min |
| 5 | Task 2.1: Test existing utilities | Test | 20min |
| 6 | Task 2.2: Export isSocketPath (TDD) | TDD | 10min |
| 7 | Task 2.3: Test SSH functions (TDD) | TDD | 20min |
| 8 | Task 2.4: Remove ssh2 dependency | Cleanup | 5min |
| 9 | Task 3.1-3.9: Compose support (TDD) | TDD | 2hr |
| 10 | Task 4.1-4.4: Performance (TDD) | TDD | 1hr |
| 11 | Task 5.1-5.2: ListImages (TDD) | TDD | 30min |
| 12 | Task 6.1-6.2: Enhancements (TDD) | TDD | 45min |

**Total: ~6 hours**

---

## Continuous Verification Checkpoints

After each task, run:
```bash
npm test                  # All tests pass
npm run lint              # No lint errors
npm run build             # TypeScript compiles
```

After each phase, run:
```bash
npm run test:coverage     # Check coverage increased
```

---

## Final Verification Checklist

- [ ] `npm test` — All tests pass
- [ ] `npm run test:coverage` — Coverage >80%
- [ ] `npm run lint` — No errors
- [ ] `npm run build` — Compiles cleanly
- [ ] All 12 MCP tools work
- [ ] README.md updated with new tools
- [ ] CLAUDE.md reflects current architecture
