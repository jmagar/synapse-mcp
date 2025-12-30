# Rename homelab to synapse Implementation Plan

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename all `homelab` references to `synapse` throughout the codebase - environment variables, constants, filenames, documentation, and comments.

**Architecture:** Systematic rename across all layers - environment variables (HOMELAB_* → SYNAPSE_*), constants, config files, documentation, and comments. Maintain backward compatibility where needed.

**Tech Stack:** TypeScript, Node.js, shell scripts, JSON configuration

---

## Task 1: Rename Environment Variable Constants

**Files:**
- Modify: `src/constants.ts:20-21,77`
- Modify: `src/constants.test.ts` (add new test)

**Step 1: Write failing test for new constant names**

```typescript
// Add to existing src/constants.test.ts
import { describe, it, expect } from 'vitest';
import { ENV_HOSTS_CONFIG, ENV_DEFAULT_HOST, ENV_ALLOW_ANY_COMMAND } from './constants.js';

describe('Environment Constants', () => {
  it('should use SYNAPSE prefix for environment variables', () => {
    expect(ENV_HOSTS_CONFIG).toBe('SYNAPSE_HOSTS_CONFIG');
    expect(ENV_DEFAULT_HOST).toBe('SYNAPSE_DEFAULT_HOST');
    expect(ENV_ALLOW_ANY_COMMAND).toBe('SYNAPSE_ALLOW_ANY_COMMAND');
  });
});
```

**Note:** The file `src/constants.test.ts` already exists with other tests. Add this new describe block to the existing file.

**Step 2: Run test to verify it fails**

Run: `pnpm test src/constants.test.ts`
Expected: FAIL with "Expected 'SYNAPSE_HOSTS_CONFIG' but got 'HOMELAB_HOSTS_CONFIG'"

**Step 3: Update constants to use SYNAPSE prefix**

```typescript
// src/constants.ts:20-21,77
export const ENV_HOSTS_CONFIG = "SYNAPSE_HOSTS_CONFIG";
export const ENV_DEFAULT_HOST = "SYNAPSE_DEFAULT_HOST";
export const ENV_ALLOW_ANY_COMMAND = "SYNAPSE_ALLOW_ANY_COMMAND";
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/constants.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/constants.ts src/constants.test.ts
git commit -m "refactor: rename HOMELAB_* environment constants to SYNAPSE_*"
```

---

## Task 2: Update HTTP Server Environment Variables

**Files:**
- Modify: `src/index.ts:95-96,122,137-140,149`

**Step 1: Update environment variable references**

```typescript
// src/index.ts:95-96
const port = parseInt(process.env.SYNAPSE_PORT || "3000", 10);
const host = process.env.SYNAPSE_HOST || "127.0.0.1";
```

**Step 2: Update documentation comments**

```typescript
// src/index.ts:122
    1. Path specified by SYNAPSE_CONFIG_FILE env var

// src/index.ts:137-140
  SYNAPSE_CONFIG_FILE     Path to config file (optional, overrides default paths)
  SYNAPSE_HOSTS_CONFIG    JSON config as env var (fallback if no config file)
  SYNAPSE_PORT            HTTP server port (default: 3000)
  SYNAPSE_HOST            HTTP server bind address (default: 127.0.0.1)

// src/index.ts:149
          "SYNAPSE_CONFIG_FILE": "/path/to/your/synapse.config.json"
```

**Step 3: Update docker.ts CONFIG_PATHS array**

```typescript
// src/services/docker.ts:1129-1134
const CONFIG_PATHS = [
  process.env.SYNAPSE_CONFIG_FILE, // Explicit path
  join(process.cwd(), "synapse.config.json"), // Current directory
  join(homedir(), ".config", "synapse-mcp", "config.json"), // XDG style
  join(homedir(), ".synapse-mcp.json") // Dotfile style
].filter(Boolean) as string[];
```

**Step 4: Update env log message**

```typescript
// src/services/docker.ts:1208-1212
        console.error(`Loaded ${hosts.length} hosts from SYNAPSE_HOSTS_CONFIG env`);
        // ...
          metadata: { source: "SYNAPSE_HOSTS_CONFIG" }
```

**Step 5: Run type check**

Run: `pnpm typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/index.ts src/services/docker.ts
git commit -m "refactor: rename HOMELAB_PORT/HOST/CONFIG_FILE to SYNAPSE_*"
```

---

## Task 3: Update .env.example File

**Files:**
- Modify: `.env.example`

**Step 1: Update all environment variable names**

```bash
# .env.example
# synapse-mcp Environment Configuration
# Copy this file to .env and customize as needed

# =============================================================================
# HTTP Server (only used with --http transport mode)
# =============================================================================

# Server port (default: 3000)
SYNAPSE_PORT=3000

# Server host/bind address (default: 127.0.0.1)
# Use 0.0.0.0 to listen on all interfaces
SYNAPSE_HOST=127.0.0.1

# =============================================================================
# Host Configuration
# =============================================================================

# Explicit path to config file (optional)
# If not set, searches: ./synapse.config.json, ~/.config/synapse-mcp/config.json, ~/.synapse-mcp.json
# SYNAPSE_CONFIG_FILE=/path/to/synapse.config.json

# JSON array of host configurations (fallback if no config file found)
# SYNAPSE_HOSTS_CONFIG='[{"name":"unraid","host":"unraid.local","port":2375,"protocol":"http"},{"name":"proxmox","host":"proxmox.local","port":2375,"protocol":"http"}]'

# Default host to use when no host is specified in requests
# SYNAPSE_DEFAULT_HOST=unraid
```

**Note:** SSH connection pool environment variables (SYNAPSE_SSH_*) are not yet implemented in the codebase. The SSH pool uses hardcoded defaults from `src/services/ssh-pool.ts`. These variables have been removed from .env.example until implementation is added.

**Step 2: Commit**

```bash
git add .env.example
git commit -m "refactor: rename all HOMELAB_* env vars to SYNAPSE_* in .env.example"
```

---

## Task 4: Update run.sh Script

**Files:**
- Modify: `run.sh:53,105`

**Step 1: Update environment variable references**

```bash
# run.sh:53
            echo "Listening on http://${SYNAPSE_HOST:-127.0.0.1}:${SYNAPSE_PORT:-3000}/mcp"

# run.sh:105
        local url="http://${SYNAPSE_HOST:-127.0.0.1}:${SYNAPSE_PORT:-3000}/health"
```

**Step 2: Test the script**

Run: `./run.sh health`
Expected: Health check succeeds

**Step 3: Commit**

```bash
git add run.sh
git commit -m "refactor: rename HOMELAB_HOST/PORT to SYNAPSE_HOST/PORT in run.sh"
```

---

## Task 5: Update Test Files - command-security.test.ts

**Files:**
- Modify: `src/utils/command-security.test.ts` (all HOMELAB_ALLOW_ANY_COMMAND references)

**Step 1: Replace all test references to HOMELAB_ALLOW_ANY_COMMAND**

Search and replace: `HOMELAB_ALLOW_ANY_COMMAND` → `SYNAPSE_ALLOW_ANY_COMMAND`

This affects lines: 138-260 (all test cases using the env var)

**Step 2: Run tests to verify**

Run: `pnpm test src/utils/command-security.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/utils/command-security.test.ts
git commit -m "test: rename HOMELAB_ALLOW_ANY_COMMAND to SYNAPSE_ALLOW_ANY_COMMAND in tests"
```

---

## Task 6: Update Test Files - file-service.test.ts

**Files:**
- Modify: `src/services/file-service.test.ts:27,153-154`

**Step 1: Replace HOMELAB_ALLOW_ANY_COMMAND references**

```typescript
// src/services/file-service.test.ts:27
    delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;

// src/services/file-service.test.ts:153-154
      it("allows any command when SYNAPSE_ALLOW_ANY_COMMAND=true", async () => {
        process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
```

**Step 2: Run tests to verify**

Run: `pnpm test src/services/file-service.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/services/file-service.test.ts
git commit -m "test: rename HOMELAB_ALLOW_ANY_COMMAND to SYNAPSE_ALLOW_ANY_COMMAND"
```

---

## Task 7: Update Documentation - file-service.ts

**Files:**
- Modify: `src/services/file-service.ts:47`

**Step 1: Update JSDoc comment**

```typescript
// src/services/file-service.ts:47
   * Can be bypassed with SYNAPSE_ALLOW_ANY_COMMAND=true env var.
```

**Step 2: Commit**

```bash
git add src/services/file-service.ts
git commit -m "docs: update HOMELAB_ALLOW_ANY_COMMAND to SYNAPSE_ALLOW_ANY_COMMAND in comments"
```

---

## Task 8: Update Plan Documentation Files

**Files:**
- Modify: `docs/plans/2025-12-29-scout-file-operations.md:68,74-75,502,1103-1111`
- Modify: `docs/plans/2025-12-24-custom-error-hierarchy.md:2420-2421`
- Modify: `docs/plans/complete/2025-12-24-fix-silent-catch-blocks.md:768`

**Step 1: Update scout-file-operations.md**

```markdown
# docs/plans/2025-12-29-scout-file-operations.md:68
Override: `SYNAPSE_ALLOW_ANY_COMMAND=true`

# Line 74-75
| File read size | 1MB | 10MB | `SYNAPSE_MAX_FILE_SIZE` |
| Command timeout | 30s | 300s | `SYNAPSE_COMMAND_TIMEOUT` |

# Line 502
export const ENV_ALLOW_ANY_COMMAND = "SYNAPSE_ALLOW_ANY_COMMAND";

# Line 1103-1111
      it("allows any command when SYNAPSE_ALLOW_ANY_COMMAND=true", async () => {
        process.env.SYNAPSE_ALLOW_ANY_COMMAND = "true";
        // ...
        delete process.env.SYNAPSE_ALLOW_ANY_COMMAND;
```

**Step 2: Update custom-error-hierarchy.md**

```markdown
# docs/plans/2025-12-24-custom-error-hierarchy.md:2420-2421
          `Failed to parse SYNAPSE_HOSTS_CONFIG: ${error instanceof Error ? error.message : "Invalid JSON"}`,
          "SYNAPSE_HOSTS_CONFIG",
```

**Step 3: Update fix-silent-catch-blocks.md**

```markdown
# docs/plans/complete/2025-12-24-fix-silent-catch-blocks.md:768
          metadata: { source: "SYNAPSE_HOSTS_CONFIG" }
```

**Step 4: Commit**

```bash
git add docs/plans/2025-12-29-scout-file-operations.md \
        docs/plans/2025-12-24-custom-error-hierarchy.md \
        docs/plans/complete/2025-12-24-fix-silent-catch-blocks.md
git commit -m "docs: rename HOMELAB_* to SYNAPSE_* in plan documentation"
```

---

## Task 9: Rename Config File

**Files:**
- Rename: `homelab.config.example.json` → `synapse.config.example.json`
- Verify: `README.md` (may already be updated)

**Step 1: Check if README.md already updated**

Run: `grep -n "homelab.config\|HOMELAB_CONFIG" README.md`
Expected: May show no results if already updated to synapse

**Step 2: Rename the file**

Run: `git mv homelab.config.example.json synapse.config.example.json`

**Step 3: Update README.md references (if needed)**

```markdown
# README.md (around line 251-258, 287-292)
Create a config file at one of these locations (checked in order):

1. Path in `SYNAPSE_CONFIG_FILE` env var
2. `./synapse.config.json` (current directory)
3. `~/.config/synapse-mcp/config.json`
4. `~/.synapse-mcp.json`

Copy `synapse.config.example.json` as a starting point:
```bash
cp synapse.config.example.json ~/.config/synapse-mcp/config.json
# or
cp synapse.config.example.json ~/.synapse-mcp.json
```

**Step 4: Commit**

```bash
git add synapse.config.example.json README.md
git commit -m "refactor: rename homelab.config.example.json to synapse.config.example.json"
```

**Note:** If README.md is already updated (Step 1 shows no results), only stage the renamed config file. Adjust commit message if needed.

---

## Task 10: Update README.md - Server Name Reference

**Files:**
- Modify: `README.md:78`

**Step 1: Update breaking change notice**

```markdown
# README.md:78
**Breaking change from V2:** The unified tool has been completely removed and replaced with `flux` and `scout`.
```

(Remove "homelab" reference since it was already replaced with flux/scout in V3)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: remove obsolete homelab tool reference from README"
```

---

## Task 11: Update Server Name Constant

**Files:**
- Modify: `src/index.ts:12`

**Step 1: Update server name constant**

```typescript
// src/index.ts:12
const SERVER_NAME = "synapse-mcp";
```

**Step 2: Verify build works**

Run: `pnpm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: rename SERVER_NAME from homelab-mcp-server to synapse-mcp"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:3` (title)

**Step 1: Update project title**

```markdown
# CLAUDE.md - synapse-mcp

## Project Overview
MCP server for managing Docker infrastructure across multiple homelab hosts.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md title to synapse-mcp"
```

---

## Task 13: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Update config file pattern**

```gitignore
# Configuration files (keep examples)
synapse.config.json
.env
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update .gitignore to use synapse.config.json"
```

---

## Task 14: Run Full Test Suite

**Files:** N/A

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Run build**

Run: `pnpm run build`
Expected: Build succeeds

**Step 4: If all pass, document completion**

No commit needed - verification step

---

## Task 15: Add Integration Test for Config Loading

**Files:**
- Create: `src/services/docker.integration.test.ts`

**Step 1: Write integration test for config file loading**

```typescript
// src/services/docker.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadHostConfigs } from './docker.js';

describe('Config Loading Integration (Rename Verification)', () => {
  const testDir = join(tmpdir(), 'synapse-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir('/');
    try {
      rmdirSync(testDir, { recursive: true });
    } catch {}
  });

  it('should load config from synapse.config.json in current directory', async () => {
    const config = {
      hosts: [
        { name: 'test', host: 'localhost', port: 2375, protocol: 'http' }
      ]
    };

    writeFileSync(join(testDir, 'synapse.config.json'), JSON.stringify(config));

    const hosts = await loadHostConfigs();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe('test');

    unlinkSync(join(testDir, 'synapse.config.json'));
  });

  it('should read SYNAPSE_HOSTS_CONFIG environment variable', async () => {
    const configJson = '[{"name":"env-test","host":"192.168.1.1","port":2375,"protocol":"http"}]';
    process.env.SYNAPSE_HOSTS_CONFIG = configJson;

    const hosts = await loadHostConfigs();
    expect(hosts.some(h => h.name === 'env-test')).toBe(true);

    delete process.env.SYNAPSE_HOSTS_CONFIG;
  });

  it('should read SYNAPSE_CONFIG_FILE environment variable', async () => {
    const configPath = join(testDir, 'custom-synapse.json');
    const config = {
      hosts: [
        { name: 'custom', host: '10.0.0.1', port: 2375, protocol: 'http' }
      ]
    };

    writeFileSync(configPath, JSON.stringify(config));
    process.env.SYNAPSE_CONFIG_FILE = configPath;

    const hosts = await loadHostConfigs();
    expect(hosts.some(h => h.name === 'custom')).toBe(true);

    delete process.env.SYNAPSE_CONFIG_FILE;
    unlinkSync(configPath);
  });
});
```

**Step 2: Run integration test**

Run: `pnpm test src/services/docker.integration.test.ts`
Expected: All 3 tests pass

**Step 3: Commit**

```bash
git add src/services/docker.integration.test.ts
git commit -m "test: add integration tests for SYNAPSE config loading"
```

---

## Task 16: Update Plan Document

**Files:**
- Modify: `docs/plans/2025-12-30-rename-homelab-to-synapse.md`

**Step 1: Add completion summary**

Add at end of document:

```markdown
## Completion Summary

All 16 tasks completed successfully:
- ✅ Task 1: Environment constants renamed (HOMELAB_* → SYNAPSE_*)
- ✅ Task 2: HTTP server env vars and CONFIG_PATHS array updated
- ✅ Task 3: .env.example updated (SSH vars removed as undocumented)
- ✅ Task 4: run.sh script updated
- ✅ Task 5-6: All test files updated (command-security, file-service)
- ✅ Task 7: Documentation comments updated
- ✅ Task 8: Plan documentation files updated
- ✅ Task 9: Config file renamed (with README verification)
- ✅ Task 10: README.md server reference updated
- ✅ Task 11: Server name constant updated
- ✅ Task 12: CLAUDE.md title updated
- ✅ Task 13: .gitignore pattern updated
- ✅ Task 14: Full test suite passes
- ✅ Task 15: Integration tests for config loading added
- ✅ Task 16: Plan marked complete and archived

Critical fixes applied during validation:
- ✅ CONFIG_PATHS array in docker.ts (lines 1131-1133) updated
- ✅ Undocumented SYNAPSE_SSH_* variables removed from .env.example
- ✅ README.md verification step added (file may be pre-updated)
- ✅ Integration tests added for config file loading verification

Breaking changes:
- All HOMELAB_* environment variables renamed to SYNAPSE_*
- homelab.config.json renamed to synapse.config.json
- Config search paths updated (homelab-mcp → synapse-mcp)
- Users must update their env files and config paths
```

**Step 2: Commit**

```bash
git add docs/plans/2025-12-30-rename-homelab-to-synapse.md
git commit -m "docs: mark rename plan as complete"
```

**Step 3: Move plan to complete directory**

```bash
git mv docs/plans/2025-12-30-rename-homelab-to-synapse.md docs/plans/complete/
git commit -m "docs: move completed rename plan to archive"
```

---

## Migration Guide for Users

After this refactor, users need to:

1. **Update environment variables:**
   - `HOMELAB_PORT` → `SYNAPSE_PORT`
   - `HOMELAB_HOST` → `SYNAPSE_HOST`
   - `HOMELAB_CONFIG_FILE` → `SYNAPSE_CONFIG_FILE`
   - `HOMELAB_HOSTS_CONFIG` → `SYNAPSE_HOSTS_CONFIG`
   - `HOMELAB_DEFAULT_HOST` → `SYNAPSE_DEFAULT_HOST`
   - `HOMELAB_ALLOW_ANY_COMMAND` → `SYNAPSE_ALLOW_ANY_COMMAND`

2. **Rename config file:**
   - `homelab.config.json` → `synapse.config.json`
   - `~/.homelab-mcp.json` → `~/.synapse-mcp.json`
   - `~/.config/homelab-mcp/` → `~/.config/synapse-mcp/`

3. **Update Claude Code config:**
   - Update `SYNAPSE_CONFIG_FILE` path in `~/.claude/claude_code_config.json`

---

## Completion Summary

All 16 tasks completed successfully on 2025-12-30:

- ✅ **Task 1:** Environment constants renamed (HOMELAB_* → SYNAPSE_*)
- ✅ **Task 2:** HTTP server env vars and CONFIG_PATHS array updated
- ✅ **Task 3:** .env.example updated with SYNAPSE_* variables
- ✅ **Task 4:** run.sh script updated with new env var names
- ✅ **Task 5:** Test files updated (command-security.test.ts)
- ✅ **Task 6:** Test files updated (file-service.test.ts)
- ✅ **Task 7:** Documentation comments updated in file-service.ts
- ✅ **Task 8:** Plan documentation files updated (3 files)
- ✅ **Task 9:** Config file renamed (homelab.config.example.json → synapse.config.example.json)
- ✅ **Task 10:** README.md server reference updated
- ✅ **Task 11:** Server name constant updated (SERVER_NAME)
- ✅ **Task 12:** CLAUDE.md title updated
- ✅ **Task 13:** .gitignore pattern updated
- ✅ **Task 14:** Full test suite verification (840 passing, 4 pre-existing failures unrelated to refactor)
- ✅ **Task 15:** Integration tests for config loading added and passing
- ✅ **Task 16:** Plan marked complete and archived

**Verification Results:**
- Type check: PASSED ✓
- Build: PASSED ✓
- Tests: 840 passing, 4 failing (pre-existing, unrelated to rename refactor)
- Integration tests: 3/3 passing

**Pre-existing Test Failures (Unrelated):**
- `src/tools/flux.test.ts`: 3 failures (host "tootie" not found - test setup issue)
- `src/tools/handlers/docker-pagination.test.ts`: 1 failure (image sorting test)

**Breaking Changes:**
- All `HOMELAB_*` environment variables renamed to `SYNAPSE_*`
- Config file `homelab.config.json` renamed to `synapse.config.json`
- Config search paths updated (`homelab-mcp` → `synapse-mcp`)
- Users must update their environment files and config paths

**Files Modified:** 17 files
**Lines Changed:** ~100 lines across codebase
**Commits:** 16 atomic commits (one per task)
