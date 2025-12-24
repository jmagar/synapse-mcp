# Compose.ts Test Coverage Improvement Plan

**Created:** 11:11:32 AM | 12/24/2025 (EST)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Increase test coverage for src/services/compose.ts from 36% to 80%+ through comprehensive TDD testing of SSH-based Docker Compose operations.

**Architecture:** Mock execFile calls to simulate SSH command execution, test all critical paths including error handling, timeouts, and edge cases. Follow existing test patterns from ssh.test.ts and docker.test.ts.

**Tech Stack:** Vitest, TypeScript 5.7+, vi.mock for mocking node:child_process

---

## Current State Analysis

**Coverage Gaps:**
- Lines 79-94: `composeExec()` - main SSH execution wrapper (0% coverage)
- Lines 100-127: `listComposeProjects()` - project discovery (0% coverage)
- Lines 150-220: `getComposeStatus()` - status checking (0% coverage)
- Lines 226-248: `composeUp/Down/Restart()` - lifecycle management (0% coverage)
- Lines 253-272: `composeLogs()` - log retrieval (0% coverage)
- Lines 278-296: `composeBuild()` - partially covered, missing error paths
- Lines 302-316: `composePull()` - partially covered, missing error paths
- Lines 322-336: `composeRecreate()` - partially covered, missing error paths

**Existing Coverage (36%):**
- `validateProjectName()` - 100% covered
- `buildComposeArgs()` - partially covered via other tests
- `parseComposeStatus()` - 0% covered
- Service name validation in build/pull/recreate - covered

---

## Test Strategy

### Mock Architecture

```typescript
// Mock execFile from node:child_process
vi.mock("child_process", () => ({
  execFile: vi.fn((command, args, options, callback) => {
    // Simulate async callback pattern
    // Return success/error based on test scenario
  })
}));
```

### Test Data Fixtures

```typescript
const mockHostConfig: HostConfig = {
  name: "test-host",
  host: "192.168.1.100",
  protocol: "http",
  port: 2375
};

const mockHostWithSshKey: HostConfig = {
  name: "test-host",
  host: "192.168.1.100",
  protocol: "http",
  port: 2375,
  sshKeyPath: "/home/user/.ssh/id_rsa"
};

const mockComposeListOutput = JSON.stringify([
  {
    Name: "myproject",
    Status: "running(2)",
    ConfigFiles: "/app/docker-compose.yml"
  },
  {
    Name: "stopped-project",
    Status: "exited(2)",
    ConfigFiles: "/app/compose.yml"
  }
]);

const mockComposePsOutput = `{"Name":"myproject-web-1","State":"running","Health":"healthy","Publishers":[{"PublishedPort":8080,"TargetPort":80,"Protocol":"tcp"}]}
{"Name":"myproject-db-1","State":"running"}`;

const mockComposePsPartial = `{"Name":"myproject-web-1","State":"running"}
{"Name":"myproject-db-1","State":"exited","ExitCode":1}`;
```

---

## Implementation Plan

### Phase 1: Setup Mock Infrastructure (30 minutes)

**Step 1: Write test for execFile mock setup**

Test file: `src/services/compose.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promisify } from "util";

// Test that mock is properly configured
describe("mock setup", () => {
  it("should successfully mock execFile from child_process", () => {
    const { execFile } = await import("child_process");
    expect(execFile).toBeDefined();
    expect(vi.isMockFunction(execFile)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "mock setup"`

Expected: FAIL - mock not yet configured

**Step 3: Add execFile mock to compose.test.ts**

Add at top of file after imports:

```typescript
import { execFile } from "child_process";

// Mock child_process before importing compose module
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    execFile: vi.fn()
  };
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "mock setup"`

Expected: PASS

**Step 5: Add mock helper utilities**

```typescript
type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mockExecFileSuccess = (stdout: string) => {
  vi.mocked(execFile).mockImplementation((
    command: string,
    args: string[],
    options: unknown,
    callback: ExecFileCallback
  ) => {
    process.nextTick(() => callback(null, stdout, ""));
    return {} as never;
  });
};

const mockExecFileError = (errorMessage: string) => {
  vi.mocked(execFile).mockImplementation((
    command: string,
    args: string[],
    options: unknown,
    callback: ExecFileCallback
  ) => {
    process.nextTick(() => callback(new Error(errorMessage), "", ""));
    return {} as never;
  });
};

const mockExecFileTimeout = () => {
  vi.mocked(execFile).mockImplementation((
    command: string,
    args: string[],
    options: unknown,
    callback: ExecFileCallback
  ) => {
    const timeoutError = new Error("Command timed out");
    (timeoutError as never)["killed"] = true;
    process.nextTick(() => callback(timeoutError, "", ""));
    return {} as never;
  });
};
```

**Step 6: Test mock helpers**

```typescript
describe("mock helpers", () => {
  it("should mock successful execFile call", async () => {
    mockExecFileSuccess("test output");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("test", []);
    expect(stdout).toBe("test output");
  });

  it("should mock failed execFile call", async () => {
    mockExecFileError("Connection failed");
    const execFileAsync = promisify(execFile);
    await expect(execFileAsync("test", [])).rejects.toThrow("Connection failed");
  });
});
```

**Step 7: Commit**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add execFile mock infrastructure for compose tests

Sets up vi.mock for child_process.execFile to enable testing SSH-based
compose operations without making actual SSH connections.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 2: Test composeExec Core Function (45 minutes)

**Step 8: Write failing test for composeExec success**

```typescript
describe("composeExec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute compose command successfully", async () => {
    mockExecFileSuccess("Container started");

    const result = await composeExec(mockHostConfig, "myproject", "up", ["-d"]);

    expect(result).toBe("Container started");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=5",
        "-o", "StrictHostKeyChecking=accept-new",
        "test-host",
        "docker compose -p myproject up -d"
      ]),
      expect.objectContaining({ timeout: 30000 }),
      expect.any(Function)
    );
  });
});
```

**Step 9: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "should execute compose command successfully"`

Expected: FAIL - composeExec not imported or test setup incomplete

**Step 10: Import composeExec and verify test passes**

Add to imports:

```typescript
import { composeExec, validateProjectName, /* ... */ } from "./compose.js";
```

**Step 11: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should execute compose command successfully"`

Expected: PASS

**Step 12: Write test for composeExec with SSH key**

```typescript
it("should include SSH key in command when provided", async () => {
  mockExecFileSuccess("Success");

  await composeExec(mockHostWithSshKey, "myproject", "up", []);

  expect(execFile).toHaveBeenCalledWith(
    "ssh",
    expect.arrayContaining([
      "-i", "/home/user/.ssh/id_rsa"
    ]),
    expect.any(Object),
    expect.any(Function)
  );
});
```

**Step 13: Run test - should pass immediately**

Run: `pnpm test -- src/services/compose.test.ts -t "should include SSH key"`

Expected: PASS (implementation already exists)

**Step 14: Write test for composeExec with invalid project name**

```typescript
it("should reject invalid project name", async () => {
  await expect(
    composeExec(mockHostConfig, "invalid; rm -rf /", "up", [])
  ).rejects.toThrow("Invalid project name");

  expect(execFile).not.toHaveBeenCalled();
});
```

**Step 15: Run test - should pass immediately**

Run: `pnpm test -- src/services/compose.test.ts -t "should reject invalid project name"`

Expected: PASS (validation already exists)

**Step 16: Write test for composeExec SSH connection failure**

```typescript
it("should throw error when SSH connection fails", async () => {
  mockExecFileError("ssh: connect to host test-host port 22: Connection refused");

  await expect(
    composeExec(mockHostConfig, "myproject", "up", [])
  ).rejects.toThrow("Compose command failed");
});
```

**Step 17: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "should throw error when SSH connection fails"`

Expected: FAIL - error not properly wrapped or propagated

**Step 18: Verify error handling in composeExec**

Read: `src/services/compose.ts:87-94`

The error handling already exists. Test should pass.

**Step 19: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should throw error when SSH connection fails"`

Expected: PASS

**Step 20: Write test for composeExec timeout**

```typescript
it("should throw error when SSH command times out", async () => {
  mockExecFileTimeout();

  await expect(
    composeExec(mockHostConfig, "myproject", "up", [])
  ).rejects.toThrow("Compose command failed");
});
```

**Step 21: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should throw error when SSH command times out"`

Expected: PASS

**Step 22: Write test for composeExec with extra arguments**

```typescript
it("should pass extra arguments to compose command", async () => {
  mockExecFileSuccess("Built");

  await composeExec(mockHostConfig, "myproject", "build", ["--no-cache", "web"]);

  expect(execFile).toHaveBeenCalledWith(
    "ssh",
    expect.arrayContaining([
      "docker compose -p myproject build --no-cache web"
    ]),
    expect.any(Object),
    expect.any(Function)
  );
});
```

**Step 23: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should pass extra arguments"`

Expected: PASS

**Step 24: Commit composeExec tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add comprehensive tests for composeExec function

Covers success cases, SSH key usage, validation, connection failures,
timeouts, and argument passing. Achieves 100% coverage of composeExec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 3: Test listComposeProjects (30 minutes)

**Step 25: Write test for listComposeProjects with multiple projects**

```typescript
describe("listComposeProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list all compose projects", async () => {
    mockExecFileSuccess(mockComposeListOutput);

    const projects = await listComposeProjects(mockHostConfig);

    expect(projects).toHaveLength(2);
    expect(projects[0]).toEqual({
      name: "myproject",
      status: "running",
      configFiles: ["/app/docker-compose.yml"],
      services: []
    });
    expect(projects[1]).toEqual({
      name: "stopped-project",
      status: "stopped",
      configFiles: ["/app/compose.yml"],
      services: []
    });
  });
});
```

**Step 26: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "should list all compose projects"`

Expected: FAIL - listComposeProjects not imported

**Step 27: Import listComposeProjects**

Add to imports:

```typescript
import { listComposeProjects, /* ... */ } from "./compose.js";
```

**Step 28: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should list all compose projects"`

Expected: PASS

**Step 29: Write test for listComposeProjects with empty result**

```typescript
it("should return empty array when no projects exist", async () => {
  mockExecFileSuccess("");

  const projects = await listComposeProjects(mockHostConfig);

  expect(projects).toEqual([]);
});
```

**Step 30: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should return empty array when no projects exist"`

Expected: PASS

**Step 31: Write test for listComposeProjects error handling**

```typescript
it("should throw error when listing fails", async () => {
  mockExecFileError("Permission denied");

  await expect(
    listComposeProjects(mockHostConfig)
  ).rejects.toThrow("Failed to list compose projects");
});
```

**Step 32: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should throw error when listing fails"`

Expected: PASS

**Step 33: Write test for listComposeProjects with whitespace in output**

```typescript
it("should handle whitespace in compose list output", async () => {
  const outputWithWhitespace = "\n\n" + mockComposeListOutput + "\n\n";
  mockExecFileSuccess(outputWithWhitespace);

  const projects = await listComposeProjects(mockHostConfig);

  expect(projects).toHaveLength(2);
});
```

**Step 34: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should handle whitespace"`

Expected: PASS

**Step 35: Commit listComposeProjects tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add tests for listComposeProjects function

Tests project listing, empty results, error handling, and whitespace
handling. Achieves 100% coverage of listComposeProjects.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 4: Test parseComposeStatus Helper (15 minutes)

**Step 36: Write tests for parseComposeStatus**

```typescript
describe("parseComposeStatus", () => {
  // Note: parseComposeStatus is not exported, we test it indirectly
  // through listComposeProjects

  it("should parse 'running' status correctly", async () => {
    const output = JSON.stringify([{
      Name: "test",
      Status: "running(3)",
      ConfigFiles: "compose.yml"
    }]);
    mockExecFileSuccess(output);

    const projects = await listComposeProjects(mockHostConfig);
    expect(projects[0]?.status).toBe("running");
  });

  it("should parse 'partial' status for mixed states", async () => {
    const output = JSON.stringify([{
      Name: "test",
      Status: "running(1), exited(1)",
      ConfigFiles: "compose.yml"
    }]);
    mockExecFileSuccess(output);

    const projects = await listComposeProjects(mockHostConfig);
    expect(projects[0]?.status).toBe("partial");
  });

  it("should parse 'stopped' status for exited containers", async () => {
    const output = JSON.stringify([{
      Name: "test",
      Status: "exited(2)",
      ConfigFiles: "compose.yml"
    }]);
    mockExecFileSuccess(output);

    const projects = await listComposeProjects(mockHostConfig);
    expect(projects[0]?.status).toBe("stopped");
  });

  it("should return 'unknown' for unrecognized status", async () => {
    const output = JSON.stringify([{
      Name: "test",
      Status: "creating",
      ConfigFiles: "compose.yml"
    }]);
    mockExecFileSuccess(output);

    const projects = await listComposeProjects(mockHostConfig);
    expect(projects[0]?.status).toBe("unknown");
  });
});
```

**Step 37: Run tests to verify they pass**

Run: `pnpm test -- src/services/compose.test.ts -t "parseComposeStatus"`

Expected: PASS (tests parseComposeStatus indirectly)

**Step 38: Commit parseComposeStatus tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add tests for parseComposeStatus helper

Tests status parsing logic indirectly through listComposeProjects.
Covers running, partial, stopped, and unknown states.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 5: Test getComposeStatus (45 minutes)

**Step 39: Write test for getComposeStatus with running services**

```typescript
describe("getComposeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return status with all services running", async () => {
    mockExecFileSuccess(mockComposePsOutput);

    const status = await getComposeStatus(mockHostConfig, "myproject");

    expect(status.name).toBe("myproject");
    expect(status.status).toBe("running");
    expect(status.services).toHaveLength(2);
    expect(status.services[0]).toEqual({
      name: "myproject-web-1",
      status: "running",
      health: "healthy",
      exitCode: undefined,
      publishers: [{
        publishedPort: 8080,
        targetPort: 80,
        protocol: "tcp"
      }]
    });
  });
});
```

**Step 40: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "should return status with all services running"`

Expected: FAIL - getComposeStatus not imported

**Step 41: Import getComposeStatus**

Add to imports:

```typescript
import { getComposeStatus, /* ... */ } from "./compose.js";
```

**Step 42: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should return status with all services running"`

Expected: PASS

**Step 43: Write test for getComposeStatus with partial services**

```typescript
it("should return 'partial' status when some services are stopped", async () => {
  mockExecFileSuccess(mockComposePsPartial);

  const status = await getComposeStatus(mockHostConfig, "myproject");

  expect(status.status).toBe("partial");
  expect(status.services).toHaveLength(2);
  expect(status.services[1]?.exitCode).toBe(1);
});
```

**Step 44: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should return 'partial' status"`

Expected: PASS

**Step 45: Write test for getComposeStatus with no services**

```typescript
it("should return 'stopped' status when no services exist", async () => {
  mockExecFileSuccess("");

  const status = await getComposeStatus(mockHostConfig, "myproject");

  expect(status.name).toBe("myproject");
  expect(status.status).toBe("stopped");
  expect(status.services).toHaveLength(0);
  expect(status.configFiles).toEqual([]);
});
```

**Step 46: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should return 'stopped' status when no services"`

Expected: PASS

**Step 47: Write test for getComposeStatus with malformed JSON**

```typescript
it("should skip malformed JSON lines", async () => {
  const malformedOutput = `{"Name":"service-1","State":"running"}
not valid json
{"Name":"service-2","State":"running"}`;

  mockExecFileSuccess(malformedOutput);

  const status = await getComposeStatus(mockHostConfig, "myproject");

  expect(status.services).toHaveLength(2);
  expect(status.services[0]?.name).toBe("service-1");
  expect(status.services[1]?.name).toBe("service-2");
});
```

**Step 48: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should skip malformed JSON"`

Expected: PASS

**Step 49: Write test for getComposeStatus error handling**

```typescript
it("should throw error when status check fails", async () => {
  mockExecFileError("No such project");

  await expect(
    getComposeStatus(mockHostConfig, "nonexistent")
  ).rejects.toThrow("Failed to get compose status");
});
```

**Step 50: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should throw error when status check fails"`

Expected: PASS

**Step 51: Write test for getComposeStatus with invalid project name**

```typescript
it("should reject invalid project name", async () => {
  await expect(
    getComposeStatus(mockHostConfig, "bad@project")
  ).rejects.toThrow("Invalid project name");

  expect(execFile).not.toHaveBeenCalled();
});
```

**Step 52: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should reject invalid project name"`

Expected: PASS

**Step 53: Write test for getComposeStatus determining stopped from all exited**

```typescript
it("should return 'stopped' when all services are exited", async () => {
  const allExited = `{"Name":"service-1","State":"exited","ExitCode":0}
{"Name":"service-2","State":"exited","ExitCode":0}`;

  mockExecFileSuccess(allExited);

  const status = await getComposeStatus(mockHostConfig, "myproject");

  expect(status.status).toBe("stopped");
  expect(status.services).toHaveLength(2);
});
```

**Step 54: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should return 'stopped' when all services are exited"`

Expected: PASS

**Step 55: Commit getComposeStatus tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add comprehensive tests for getComposeStatus

Tests running, partial, stopped states, malformed JSON handling,
error cases, and validation. Achieves 100% coverage of getComposeStatus.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 6: Test Lifecycle Functions (30 minutes)

**Step 56: Write test for composeUp with detach**

```typescript
describe("composeUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should start project in detached mode by default", async () => {
    mockExecFileSuccess("Started");

    const result = await composeUp(mockHostConfig, "myproject");

    expect(result).toBe("Started");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject up -d"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should start project in attached mode when detach=false", async () => {
    mockExecFileSuccess("Started");

    await composeUp(mockHostConfig, "myproject", false);

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        expect.stringContaining("up"),
        expect.not.stringContaining("-d")
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });
});
```

**Step 57: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "composeUp"`

Expected: FAIL - composeUp not imported

**Step 58: Import composeUp**

Add to imports:

```typescript
import { composeUp, /* ... */ } from "./compose.js";
```

**Step 59: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composeUp"`

Expected: PASS

**Step 60: Write test for composeDown with and without volumes**

```typescript
describe("composeDown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should stop project without removing volumes by default", async () => {
    mockExecFileSuccess("Stopped");

    const result = await composeDown(mockHostConfig, "myproject");

    expect(result).toBe("Stopped");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        expect.stringContaining("down"),
        expect.not.stringContaining("-v")
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should remove volumes when removeVolumes=true", async () => {
    mockExecFileSuccess("Stopped and removed volumes");

    await composeDown(mockHostConfig, "myproject", true);

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject down -v"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });
});
```

**Step 61: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "composeDown"`

Expected: FAIL - composeDown not imported

**Step 62: Import composeDown**

Add to imports:

```typescript
import { composeDown, /* ... */ } from "./compose.js";
```

**Step 63: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composeDown"`

Expected: PASS

**Step 64: Write test for composeRestart**

```typescript
describe("composeRestart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should restart project", async () => {
    mockExecFileSuccess("Restarted");

    const result = await composeRestart(mockHostConfig, "myproject");

    expect(result).toBe("Restarted");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject restart"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });
});
```

**Step 65: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "composeRestart"`

Expected: FAIL - composeRestart not imported

**Step 66: Import composeRestart**

Add to imports:

```typescript
import { composeRestart, /* ... */ } from "./compose.js";
```

**Step 67: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composeRestart"`

Expected: PASS

**Step 68: Commit lifecycle function tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add tests for compose lifecycle functions

Tests composeUp (detached/attached), composeDown (with/without volumes),
and composeRestart. Achieves 100% coverage of lifecycle operations.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 7: Test composeLogs (25 minutes)

**Step 69: Write test for composeLogs without options**

```typescript
describe("composeLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve logs without options", async () => {
    const mockLogs = "2025-01-01 10:00:00 Starting service\n2025-01-01 10:00:01 Ready";
    mockExecFileSuccess(mockLogs);

    const result = await composeLogs(mockHostConfig, "myproject");

    expect(result).toBe(mockLogs);
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject logs --no-color"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });
});
```

**Step 70: Run test to verify it fails**

Run: `pnpm test -- src/services/compose.test.ts -t "should retrieve logs without options"`

Expected: FAIL - composeLogs not imported

**Step 71: Import composeLogs**

Add to imports:

```typescript
import { composeLogs, /* ... */ } from "./compose.js";
```

**Step 72: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should retrieve logs without options"`

Expected: PASS

**Step 73: Write test for composeLogs with line limit**

```typescript
it("should retrieve logs with line limit", async () => {
  mockExecFileSuccess("Last 50 lines");

  await composeLogs(mockHostConfig, "myproject", { lines: 50 });

  expect(execFile).toHaveBeenCalledWith(
    "ssh",
    expect.arrayContaining([
      "docker compose -p myproject logs --no-color --tail 50"
    ]),
    expect.any(Object),
    expect.any(Function)
  );
});
```

**Step 74: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should retrieve logs with line limit"`

Expected: PASS

**Step 75: Write test for composeLogs for specific service**

```typescript
it("should retrieve logs for specific service", async () => {
  mockExecFileSuccess("Service logs");

  await composeLogs(mockHostConfig, "myproject", { service: "web" });

  expect(execFile).toHaveBeenCalledWith(
    "ssh",
    expect.arrayContaining([
      "docker compose -p myproject logs --no-color web"
    ]),
    expect.any(Object),
    expect.any(Function)
  );
});
```

**Step 76: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should retrieve logs for specific service"`

Expected: PASS

**Step 77: Write test for composeLogs with invalid service name**

```typescript
it("should reject invalid service name", async () => {
  await expect(
    composeLogs(mockHostConfig, "myproject", { service: "bad; service" })
  ).rejects.toThrow("Invalid service name");

  expect(execFile).not.toHaveBeenCalled();
});
```

**Step 78: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should reject invalid service name"`

Expected: PASS

**Step 79: Write test for composeLogs with combined options**

```typescript
it("should handle combined options", async () => {
  mockExecFileSuccess("Last 100 lines of web logs");

  await composeLogs(mockHostConfig, "myproject", {
    lines: 100,
    service: "web"
  });

  expect(execFile).toHaveBeenCalledWith(
    "ssh",
    expect.arrayContaining([
      "docker compose -p myproject logs --no-color --tail 100 web"
    ]),
    expect.any(Object),
    expect.any(Function)
  );
});
```

**Step 80: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "should handle combined options"`

Expected: PASS

**Step 81: Commit composeLogs tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add comprehensive tests for composeLogs

Tests log retrieval without options, with line limits, specific services,
validation, and combined options. Achieves 100% coverage of composeLogs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 8: Complete Coverage for Build/Pull/Recreate (30 minutes)

**Step 82: Write test for composeBuild without options**

```typescript
describe("composeBuild - additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build all services without options", async () => {
    mockExecFileSuccess("Building...");

    const result = await composeBuild(mockHostConfig, "myproject");

    expect(result).toBe("Building...");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject build"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should build with no-cache option", async () => {
    mockExecFileSuccess("Building with no cache...");

    await composeBuild(mockHostConfig, "myproject", { noCache: true });

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject build --no-cache"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should build specific service", async () => {
    mockExecFileSuccess("Building service...");

    await composeBuild(mockHostConfig, "myproject", { service: "web" });

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject build web"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should combine no-cache and specific service", async () => {
    mockExecFileSuccess("Building...");

    await composeBuild(mockHostConfig, "myproject", {
      noCache: true,
      service: "web"
    });

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject build --no-cache web"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should handle build errors", async () => {
    mockExecFileError("Build failed: syntax error");

    await expect(
      composeBuild(mockHostConfig, "myproject")
    ).rejects.toThrow("Compose command failed");
  });
});
```

**Step 83: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composeBuild - additional coverage"`

Expected: PASS (most coverage already exists, adds error handling)

**Step 84: Write test for composePull without options**

```typescript
describe("composePull - additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pull all images without options", async () => {
    mockExecFileSuccess("Pulling images...");

    const result = await composePull(mockHostConfig, "myproject");

    expect(result).toBe("Pulling images...");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject pull"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should pull specific service image", async () => {
    mockExecFileSuccess("Pulling service image...");

    await composePull(mockHostConfig, "myproject", { service: "web" });

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject pull web"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should handle pull errors", async () => {
    mockExecFileError("Pull failed: image not found");

    await expect(
      composePull(mockHostConfig, "myproject")
    ).rejects.toThrow("Compose command failed");
  });
});
```

**Step 85: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composePull - additional coverage"`

Expected: PASS

**Step 86: Write test for composeRecreate without options**

```typescript
describe("composeRecreate - additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recreate all containers without options", async () => {
    mockExecFileSuccess("Recreating...");

    const result = await composeRecreate(mockHostConfig, "myproject");

    expect(result).toBe("Recreating...");
    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject up -d --force-recreate"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should recreate specific service", async () => {
    mockExecFileSuccess("Recreating service...");

    await composeRecreate(mockHostConfig, "myproject", { service: "web" });

    expect(execFile).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([
        "docker compose -p myproject up -d --force-recreate web"
      ]),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should handle recreate errors", async () => {
    mockExecFileError("Recreate failed");

    await expect(
      composeRecreate(mockHostConfig, "myproject")
    ).rejects.toThrow("Compose command failed");
  });
});
```

**Step 87: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "composeRecreate - additional coverage"`

Expected: PASS

**Step 88: Commit complete build/pull/recreate tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: complete coverage for composeBuild/Pull/Recreate

Adds success paths, option combinations, and error handling tests
for build, pull, and recreate operations.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 9: Test buildComposeArgs Helper (20 minutes)

**Step 89: Write test for buildComposeArgs basic usage**

```typescript
describe("buildComposeArgs", () => {
  // buildComposeArgs is not exported, test indirectly through composeExec

  it("should build basic SSH args", async () => {
    mockExecFileSuccess("ok");

    await composeExec(mockHostConfig, "test", "ps", []);

    const call = vi.mocked(execFile).mock.calls[0];
    const args = call?.[1];

    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=5");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).toContain("test-host");
  });

  it("should include SSH key when provided", async () => {
    mockExecFileSuccess("ok");

    await composeExec(mockHostWithSshKey, "test", "ps", []);

    const call = vi.mocked(execFile).mock.calls[0];
    const args = call?.[1];

    expect(args).toContain("-i");
    expect(args).toContain("/home/user/.ssh/id_rsa");
  });

  it("should use localhost for socket paths", async () => {
    const socketHost: HostConfig = {
      name: "local",
      host: "/var/run/docker.sock",
      protocol: "http"
    };

    mockExecFileSuccess("ok");

    await composeExec(socketHost, "test", "ps", []);

    const call = vi.mocked(execFile).mock.calls[0];
    const args = call?.[1];

    expect(args).toContain("localhost");
    expect(args).not.toContain("/var/run/docker.sock");
  });

  it("should sanitize host name", async () => {
    mockExecFileSuccess("ok");

    await composeExec(mockHostConfig, "test", "ps", []);

    const call = vi.mocked(execFile).mock.calls[0];
    const args = call?.[1];

    // Host name should be sanitized through sanitizeForShell
    expect(args).toContain("test-host");
  });
});
```

**Step 90: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "buildComposeArgs"`

Expected: PASS (tests buildComposeArgs indirectly)

**Step 91: Commit buildComposeArgs tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add tests for buildComposeArgs helper

Tests SSH argument building indirectly through composeExec,
covering basic args, SSH keys, socket paths, and sanitization.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 10: Edge Cases and Error Scenarios (30 minutes)

**Step 92: Write test for network timeout scenarios**

```typescript
describe("timeout and network errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle timeout in listComposeProjects", async () => {
    mockExecFileTimeout();

    await expect(
      listComposeProjects(mockHostConfig)
    ).rejects.toThrow("Failed to list compose projects");
  });

  it("should handle timeout in getComposeStatus", async () => {
    mockExecFileTimeout();

    await expect(
      getComposeStatus(mockHostConfig, "myproject")
    ).rejects.toThrow("Failed to get compose status");
  });

  it("should handle timeout in composeUp", async () => {
    mockExecFileTimeout();

    await expect(
      composeUp(mockHostConfig, "myproject")
    ).rejects.toThrow("Compose command failed");
  });

  it("should handle SSH authentication failure", async () => {
    mockExecFileError("Permission denied (publickey)");

    await expect(
      composeExec(mockHostConfig, "test", "ps", [])
    ).rejects.toThrow("Compose command failed");
  });

  it("should handle unknown host error", async () => {
    mockExecFileError("Could not resolve hostname");

    await expect(
      composeExec(mockHostConfig, "test", "ps", [])
    ).rejects.toThrow("Compose command failed");
  });
});
```

**Step 93: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "timeout and network errors"`

Expected: PASS

**Step 94: Write test for edge cases in status parsing**

```typescript
describe("edge cases", () => {
  it("should handle empty lines in compose ps output", async () => {
    const outputWithEmptyLines = `

{"Name":"service-1","State":"running"}


{"Name":"service-2","State":"running"}

`;
    mockExecFileSuccess(outputWithEmptyLines);

    const status = await getComposeStatus(mockHostConfig, "myproject");
    expect(status.services).toHaveLength(2);
  });

  it("should handle service without publishers", async () => {
    const output = '{"Name":"worker","State":"running"}';
    mockExecFileSuccess(output);

    const status = await getComposeStatus(mockHostConfig, "myproject");
    expect(status.services[0]?.publishers).toBeUndefined();
  });

  it("should handle service without health check", async () => {
    const output = '{"Name":"db","State":"running"}';
    mockExecFileSuccess(output);

    const status = await getComposeStatus(mockHostConfig, "myproject");
    expect(status.services[0]?.health).toBeUndefined();
  });

  it("should handle multiple config files in list", async () => {
    const output = JSON.stringify([{
      Name: "multi",
      Status: "running(1)",
      ConfigFiles: "/app/docker-compose.yml, /app/docker-compose.override.yml"
    }]);
    mockExecFileSuccess(output);

    const projects = await listComposeProjects(mockHostConfig);
    expect(projects[0]?.configFiles).toHaveLength(2);
    expect(projects[0]?.configFiles[1]).toBe("/app/docker-compose.override.yml");
  });

  it("should handle project names with hyphens and underscores", async () => {
    mockExecFileSuccess("ok");

    await expect(
      composeExec(mockHostConfig, "my-project_v2", "ps", [])
    ).resolves.toBe("ok");
  });

  it("should handle zero line limit in logs", async () => {
    mockExecFileSuccess("All logs");

    await composeLogs(mockHostConfig, "myproject", { lines: 0 });

    // lines: 0 should still add --tail 0
    const call = vi.mocked(execFile).mock.calls[0];
    const args = call?.[1];
    expect(args).toContain("--tail");
    expect(args).toContain("0");
  });
});
```

**Step 95: Run test to verify it passes**

Run: `pnpm test -- src/services/compose.test.ts -t "edge cases"`

Expected: PASS

**Step 96: Commit edge case tests**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: add edge case and error scenario tests

Tests timeouts, network errors, SSH authentication failures, empty lines,
missing fields, multiple config files, and special characters.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 11: Verify Coverage Goals (15 minutes)

**Step 97: Run full test suite with coverage**

Run: `pnpm test -- src/services/compose.test.ts --coverage`

Expected output showing 80%+ statement coverage, 60%+ branch coverage

**Step 98: Check detailed coverage report**

Run: `pnpm test -- --coverage --reporter=verbose 2>&1 | grep -A 20 "compose.ts"`

Expected: Statement coverage 80%+, Branch coverage 60%+

**Step 99: Identify any remaining uncovered lines**

Read coverage report output to find specific uncovered lines.

If coverage < 80%, identify missing test cases and add them.

**Step 100: Add any final missing tests**

Based on coverage report, add tests for any remaining uncovered branches or statements.

Example areas to check:
- Error message formatting variations
- Boundary conditions in status determination
- Alternative code paths in conditionals

**Step 101: Re-run coverage to confirm goals met**

Run: `pnpm test -- src/services/compose.test.ts --coverage`

Expected: 80%+ statement coverage, 60%+ branch coverage

**Step 102: Commit final coverage improvements**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
test: achieve 80%+ coverage for compose.ts

Final coverage improvements bring compose.ts from 36% to 80%+ statement
coverage through comprehensive TDD testing of all critical paths.

Coverage achieved:
- Statement: 80%+
- Branch: 60%+
- All critical functions tested with success, error, and edge cases

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 12: Documentation and Cleanup (15 minutes)

**Step 103: Add test file documentation header**

Add to top of `src/services/compose.test.ts`:

```typescript
/**
 * Comprehensive tests for compose.ts service
 *
 * Coverage: 80%+ statements, 60%+ branches
 *
 * Tests SSH-based Docker Compose operations including:
 * - Project listing and status checking
 * - Lifecycle operations (up, down, restart)
 * - Build, pull, and recreate operations
 * - Log retrieval with filtering
 * - Error handling and validation
 * - Network timeouts and SSH failures
 * - Edge cases (empty output, malformed JSON, etc.)
 *
 * Mock Strategy:
 * Uses vi.mock for child_process.execFile to simulate SSH command execution
 * without making actual network connections.
 */
```

**Step 104: Run full test suite to ensure no regressions**

Run: `pnpm test`

Expected: All tests pass

**Step 105: Run type checking**

Run: `pnpm typecheck` or `tsc --noEmit`

Expected: No type errors

**Step 106: Run linter**

Run: `pnpm lint`

Expected: No lint errors

**Step 107: Final commit**

```bash
git add src/services/compose.test.ts
git commit -m "$(cat <<'EOF'
docs: add comprehensive test file documentation

Documents test coverage goals, mock strategy, and test organization
for compose.test.ts.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

**Test Coverage Improvement:**
- **Before:** 36.08% statement coverage
- **After:** 80%+ statement coverage, 60%+ branch coverage

**Functions Tested:**
1. `validateProjectName()` - 100% (already covered)
2. `composeExec()` - 100%
3. `listComposeProjects()` - 100%
4. `parseComposeStatus()` - 100% (tested indirectly)
5. `getComposeStatus()` - 100%
6. `composeUp()` - 100%
7. `composeDown()` - 100%
8. `composeRestart()` - 100%
9. `composeLogs()` - 100%
10. `composeBuild()` - 100%
11. `composePull()` - 100%
12. `composeRecreate()` - 100%
13. `buildComposeArgs()` - 100% (tested indirectly)

**Test Categories:**
- Success paths for all operations
- Invalid input validation
- SSH connection failures
- Command timeouts
- Malformed JSON handling
- Empty result sets
- Edge cases (whitespace, special chars, etc.)

**Mock Strategy:**
- `vi.mock("child_process")` for execFile
- Helper functions for success/error/timeout scenarios
- No actual SSH connections made
- Fast, isolated unit tests

**Time Estimate:** ~4-5 hours total

**Verification:**
- Run `pnpm test -- src/services/compose.test.ts --coverage` at any time
- Each phase builds incrementally toward 80% goal
- Frequent commits allow rollback if needed
