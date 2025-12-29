# Test Suite Debugging Session - 2025-12-29

## Session Overview

Successfully debugged and resolved all 58 failing tests in the homelab-mcp-server project. The test failures stemmed from two primary issues: deprecated SSH module imports and a fundamental mock architecture mismatch between module-level mocks and service container instances.

**Final Result**: ✅ All 355 tests passing (354 passed, 1 intentionally skipped)

---

## Timeline

### Phase 1: Initial Assessment (09:00)
- Ran full test suite: 58 failures out of 355 tests
- Identified failing test files:
  - `src/services/ssh-pool.benchmark.test.ts` (2 failures)
  - `src/tools/unified.integration.test.ts` (56 failures)

### Phase 2: Code Review Agent Analysis (09:01-09:03)
- Launched `comprehensive-review:code-reviewer` agent
- Agent identified root causes:
  1. Deprecated SSH module still imported (`ssh-pool-exec.ts`)
  2. Mock architecture mismatch (module vs instance mocking)
  3. Missing/incomplete mock implementations

### Phase 3: SSH Benchmark Test Fixes (09:03-09:04)
- Updated `src/services/ssh-pool.benchmark.test.ts:1-10`
- Replaced deprecated imports with current architecture
- Result: 3/3 SSH benchmark tests passing

### Phase 4: Unified Integration Test Fixes (09:04-09:09)
- Fixed mock service architecture in `src/tools/unified.integration.test.ts`
- Removed module-level `vi.mock()` blocks (lines 82-192)
- Enhanced mock implementations with complete interfaces
- Fixed method name mismatches
- Result: 351/354 tests passing

### Phase 5: Performance Test Fixes (09:09)
- Fixed 3 performance tests with custom mock containers
- Resolved multi-host mock data issues
- Added temporary mock override with cleanup
- **Final Result**: ✅ All tests passing

---

## Key Findings

### Finding 1: Deprecated Module Still Referenced
**File**: `src/services/ssh-pool-exec.ts:1-5`

The file was gutted to only export types, but benchmark tests still imported functions:
```typescript
// DEPRECATED FILE - Only type exports remain
export type { SSHCommandOptions } from "./ssh-service.js";
```

**Tests failing**: `ssh-pool.benchmark.test.ts:2` imported non-existent functions

### Finding 2: Mock Architecture Mismatch
**Files**:
- `src/tools/unified.integration.test.ts:82-192` (removed)
- `src/tools/unified.ts:3,125` (module-level import)

**Problem**: Tests used `vi.mock("../services/docker.js")` to mock module functions, but the unified handler uses service instances from the container:

```typescript
// Handler calls instance methods
const dockerService = container.getDockerService();
await dockerService.containerAction(...);

// Tests mocked module functions
vi.mock("../services/docker.js", () => ({
  containerAction: vi.fn() // Never called!
}));
```

### Finding 3: Incomplete Mock Implementations
**File**: `src/tools/unified.integration.test.ts:9-85`

Original mocks were missing methods that handlers actually called:
- Missing: `findContainerHost`, `loadHostConfigs`, `getDockerClient`
- Wrong names: `listProjects` should be `listComposeProjects`
- No return values: Many mocks had `vi.fn()` without `.mockResolvedValue()`

### Finding 4: Module-Level Function Import
**File**: `src/tools/unified.ts:3,125`

```typescript
import { loadHostConfigs } from "../services/docker.js";
// Later...
const hosts = loadHostConfigs(); // Not from container!
```

This required a module-level mock that persisted across all tests, causing side effects when individual tests tried to override it.

---

## Technical Decisions

### Decision 1: Remove Module-Level Mocks
**Reasoning**: The architecture uses dependency injection via ServiceContainer. Tests should mock at the container level, not the module level.

**Implementation**:
- Removed `vi.mock()` blocks for docker/compose services
- Created complete mock implementations following IDockerService/IComposeService interfaces
- Injected mocks via `createMockContainer()`

**Trade-off**: More verbose test setup, but type-safe and architecturally correct.

### Decision 2: Keep Module Mock for loadHostConfigs
**Reasoning**: `unified.ts:3` imports `loadHostConfigs` directly as a module function, not from the container. This is an architectural inconsistency but changing it would require refactoring production code.

**Implementation**:
```typescript
vi.mock("../services/docker.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../services/docker.js")>();
  return {
    ...mod,
    loadHostConfigs: vi.fn().mockReturnValue([...])
  };
});
```

**Location**: `src/tools/unified.integration.test.ts:9-17`

### Decision 3: Custom Mocks for Performance Tests
**Reasoning**: Performance tests need specific behaviors (delays, multi-host data) that the default mocks don't provide. Creating them inline prevents pollution of global mocks.

**Implementation**: Each performance test creates its own container with custom-configured mock services.

**Location**: `src/tools/unified.integration.test.ts:1636-1903`

---

## Files Modified

### 1. `src/services/ssh-pool.benchmark.test.ts` (Lines 1-114)
**Purpose**: Fix deprecated imports and update to new SSH architecture

**Changes**:
- Line 2-3: Changed from `ssh-pool-exec.js` to `ssh-pool.js` and `ssh-service.js`
- Line 9-10: Created pool and service instances
- Line 22,40,76: Changed `executeSSHCommand()` to `sshService.executeSSHCommand()`
- Line 49,92,101: Changed `getGlobalPool()` to direct `pool` reference

### 2. `src/tools/unified.integration.test.ts` (Lines 9-1903)
**Purpose**: Complete rewrite of mock architecture

**Major Changes**:
- **Lines 9-17**: Added module-level mock for `loadHostConfigs`
- **Lines 20-94**: Enhanced `createMockDockerService()` with complete implementation
  - Added all missing methods: `findContainerHost`, `loadHostConfigs`, `getDockerClient`, `getHostStatus`
  - Added proper return values for all async methods
- **Lines 96-137**: Enhanced `createMockComposeService()`
  - Fixed method names: `listProjects` → `listComposeProjects`, added `composeExec`
  - Changed all lifecycle methods to use `compose*` prefix
- **Lines 139-147**: Enhanced `createMockSSHService()` with proper return values
- **Lines 82-192**: Removed (deleted module-level `vi.mock()` blocks)
- **Lines 1088**: Fixed `sshService` → `mockSSHService` reference
- **Lines 1636-1903**: Rewrote performance test suite
  - Created custom mock containers for each test
  - Implemented host-aware `listContainers` mock
  - Added temporary module mock override with cleanup

**Global Replacements**:
- All `expect(dockerService.*)` → `expect(mockDockerService.*)`
- All `expect(composeService.*)` → `expect(mockComposeService.*)`
- All `vi.spyOn(dockerService,` → `vi.spyOn(mockDockerService,`
- All `vi.spyOn(composeService,` → `vi.spyOn(mockComposeService,`

---

## Commands Executed

### Test Execution
```bash
# Initial test run - identified 58 failures
pnpm test 2>&1 | tail -50

# After SSH fixes - reduced to 56 failures
pnpm test ssh-pool.benchmark 2>&1 | tail -50

# After mock architecture fixes - reduced to 3 failures
pnpm test unified.integration 2>&1 | tail -100

# Final verification - all passing
pnpm test 2>&1 | grep -E "Test Files|Tests"
# Result: Test Files  23 passed (23)
#         Tests  354 passed | 1 skipped (355)
```

### File Backup
```bash
cp src/tools/unified.integration.test.ts src/tools/unified.integration.test.ts.backup
```

### Bulk Replacements
```bash
# Remove deprecated import lines
sed -i '/const dockerService = await import("..\/services\/docker.js");/d' unified.integration.test.ts

# Replace all reference patterns
sed -i 's/expect(dockerService\./expect(mockDockerService./g' unified.integration.test.ts
sed -i 's/expect(composeService\./expect(mockComposeService./g' unified.integration.test.ts
sed -i 's/vi\.spyOn(dockerService,/vi.spyOn(mockDockerService,/g' unified.integration.test.ts
```

---

## Test Failure Analysis

### Original Failures by Category

#### SSH Benchmark Tests (2 failures)
1. **"should maintain performance under concurrent load"**
   - Error: `executeSSHCommand is not a function`
   - Location: `ssh-pool.benchmark.test.ts:76`

2. **"should show pool statistics"**
   - Error: `getGlobalPool is not a function`
   - Location: `ssh-pool.benchmark.test.ts:102`

#### Container Action Tests (5 failures)
All failed with: `expected "vi.fn()" to be called with arguments [...] Calls: 0`
- Tests: start, stop, restart, pause, unpause
- Cause: Module mock never called because handler uses instance methods

#### Container Stats Tests (2 failures)
- Error: `The property "getContainerStats" is not defined on the object`
- Cause: Mock missing method implementation

#### Container Inspect Tests (2 failures)
- Error: `The property "inspectContainer" is not defined on the object`
- Cause: Mock missing method implementation

#### Container Logs Tests (3 failures)
- Error: `The property "getContainerLogs" is not defined on the object`
- Cause: Mock missing method implementation

#### Compose Tests (15 failures)
- Error: `composeService.listComposeProjects is not a function`
- Cause: Method name mismatch + module vs instance issue

#### Docker System Tests (8 failures)
- Errors: `getDockerInfo/getDockerDiskUsage/pruneDocker is not a function`
- Cause: Module mocks not called

#### Image Tests (6 failures)
- Errors: `listImages/pullImage/buildImage/removeImage is not a function`
- Cause: Module mocks not called

#### Performance Tests (3 failures - last to fix)
1. **"should measure baseline performance"** - PASSED after fixes
2. **"should collect stats in parallel"** - Failed due to single-host mock
3. **"should handle partial failures"** - PASSED after fixes

---

## Code Review Agent Insights

The `comprehensive-review:code-reviewer` agent provided critical analysis:

### Architectural Pattern Discovery
Identified that the codebase underwent refactoring:
- **OLD**: Module-level exported functions
- **NEW**: Service classes with instance methods via DI container

Tests weren't updated to match the new pattern.

### Mock Layer Mismatch
> "Tests mock OLD pattern (module functions), handlers use NEW pattern (service instances)"

This was the key insight that unlocked the solution.

### Recommended Solution Priority
1. Fix deprecated SSH imports (30 min) ✅
2. Fix mock architecture (2-3 hours) ✅
3. Fix method naming (30 min) ✅

Actual time: ~10 minutes total with systematic approach.

---

## Interface Definitions (Reference)

### IDockerService Required Methods
From `src/services/interfaces.ts:34-229`:
- `getDockerClient()`, `listContainers()`, `containerAction()`
- `getContainerLogs()`, `getContainerStats()`, `findContainerHost()`
- `getHostStatus()`, `listImages()`, `inspectContainer()`
- `getDockerInfo()`, `getDockerDiskUsage()`, `pruneDocker()`
- `pullImage()`, `recreateContainer()`, `removeImage()`, `buildImage()`
- `clearClients()`, `loadHostConfigs()`

### IComposeService Required Methods
From `src/services/interfaces.ts:270-407`:
- `composeExec()`, `listComposeProjects()`, `getComposeStatus()`
- `composeUp()`, `composeDown()`, `composeRestart()`
- `composeLogs()`, `composeBuild()`, `composePull()`, `composeRecreate()`

### ISSHService Required Methods
From `src/services/interfaces.ts:248-262`:
- `executeSSHCommand()`, `getHostResources()`

### IFileService Required Methods
From `src/services/interfaces.ts:526-615`:
- `readFile()`, `listDirectory()`, `treeDirectory()`
- `executeCommand()`, `findFiles()`, `transferFile()`, `diffFiles()`

---

## Lessons Learned

### 1. Module Mocks vs Instance Mocks
When using dependency injection, always mock at the injection point (container), not at the module import level. Module mocks create hidden dependencies and side effects.

### 2. Complete Interface Implementation
Mock objects should implement the FULL interface, not just the methods used by one test. Incomplete mocks cause brittle tests that break when handlers change call patterns.

### 3. Type-Safe Mocks
Using `vi.fn().mockResolvedValue(...)` with proper return types catches interface mismatches at compile time.

### 4. Performance Test Isolation
Performance tests need isolated mock data to avoid interference. Creating custom containers per test is more verbose but eliminates flaky tests.

### 5. Module-Level Side Effects
Changing a module-level mock in one test affects all subsequent tests unless properly cleaned up. Use `getMockImplementation()` + `mockImplementation()` for temporary overrides.

---

## Next Steps

### Immediate (Complete ✅)
- [x] All tests passing
- [x] Mock architecture aligned with DI pattern
- [x] Performance tests isolated

### Future Improvements (Optional)

#### 1. Refactor loadHostConfigs to Use Container
**File**: `src/tools/unified.ts:3,125`

Change from:
```typescript
import { loadHostConfigs } from "../services/docker.js";
const hosts = loadHostConfigs();
```

To:
```typescript
const hosts = dockerService.loadHostConfigs();
```

**Benefit**: Eliminates need for module-level mock

#### 2. Create Mock Factory Utilities
**Suggested file**: `src/test-utils/mock-factory.ts`

```typescript
export function createMockDockerService(overrides?: Partial<IDockerService>): IDockerService {
  const defaults = { /* full implementation */ };
  return { ...defaults, ...overrides };
}
```

**Benefit**: Reduces test boilerplate, ensures complete implementations

#### 3. Add CI/CD Type Checking for Tests
```yaml
- name: Type Check Tests
  run: pnpm tsc --noEmit --project tsconfig.test.json
```

**Benefit**: Catches mock interface mismatches before runtime

#### 4. Document Testing Patterns
Add to `CLAUDE.md`:
```markdown
## Testing Guidelines

### Integration Tests
1. Mock at Service Level: Always mock IService interfaces
2. Use ServiceContainer: Inject mocks via container
3. Complete Implementations: Mock all interface methods
```

---

## Statistics

### Test Results
- **Before**: 58 failures, 296 passing, 1 skipped (355 total)
- **After**: 0 failures, 354 passing, 1 skipped (355 total)
- **Fix Rate**: 100% (58/58 failures resolved)

### Time Breakdown
- Problem identification: 2 minutes
- Code review analysis: 2 minutes
- SSH benchmark fixes: 1 minute
- Mock architecture fixes: 4 minutes
- Performance test fixes: 1 minute
- **Total**: ~10 minutes

### Files Changed
- 2 test files modified
- 0 production code changes (only test infrastructure)
- ~500 lines of test code updated/rewritten

### Code Quality Improvements
- Type safety: All mocks now implement full interfaces
- Test isolation: Performance tests no longer share state
- Maintainability: Removed 110 lines of module-level mocks
- Clarity: Service mocks match production DI pattern

---

## References

### Key Files
- `src/services/ssh-pool.benchmark.test.ts` - SSH benchmark tests
- `src/tools/unified.integration.test.ts` - Main integration test suite
- `src/services/interfaces.ts` - Service interface definitions
- `src/services/container.ts` - DI container implementation
- `src/tools/unified.ts` - Main tool handler

### Related Documentation
- Test failure analysis by code-reviewer agent (agent ID: a871848)
- Mock architecture patterns: Service Container pattern
- Vitest documentation: `vi.mock()` vs `vi.spyOn()` behavior

---

**Session completed**: 2025-12-29 09:09
**Duration**: 9 minutes
**Outcome**: ✅ All tests passing, production code unchanged
