# Code Review: homelab-mcp-server

**Review Date:** 2025-12-29
**Reviewer:** Claude (Comprehensive Code Analysis)
**Codebase Version:** Based on commit 8e6a4be

---

## Executive Summary

The homelab-mcp-server is a well-architected MCP server for managing Docker infrastructure across multiple homelab hosts. The codebase demonstrates strong adherence to modern TypeScript practices, comprehensive input validation, and good security awareness. The recent consolidation into a unified tool (commit 8e6a4be) has significantly improved the API surface.

**Overall Assessment:** ⭐⭐⭐⭐ (4/5)

**Key Strengths:**
- Excellent security practices (input sanitization, validation)
- Strong TypeScript type safety with strict mode
- Good separation of concerns (services, schemas, tools, formatters)
- Comprehensive Zod schema validation
- Clear documentation

**Areas for Improvement:**
- Test coverage needs improvement (38% overall, 35% in critical services)
- Some missing return type annotations
- Limited error recovery in some areas
- Documentation gaps in some utility functions

---

## 1. Architecture & Structure

### ✅ Strengths

**Clean Layered Architecture:**
```
src/
├── index.ts          # Entry point, transport setup
├── types.ts          # Centralized type definitions
├── constants.ts      # Configuration constants
├── tools/            # MCP tool registrations
├── services/         # Business logic (docker, ssh, compose)
├── schemas/          # Zod validation schemas
└── formatters/       # Output formatting utilities
```

This separation follows best practices:
- **Services** handle all Docker/SSH interactions
- **Schemas** provide runtime validation
- **Formatters** separate presentation logic
- **Tools** act as thin orchestration layer

**Dual Transport Support:**
- stdio for Claude Code integration
- HTTP with rate limiting for remote access
- Graceful shutdown handlers (SIGINT/SIGTERM)

**Configuration Flexibility:**
- Multiple config file locations checked in priority order
- Environment variable fallback
- Auto-detection of local Docker socket

### ⚠️ Issues

**Issue #1: Inconsistent Return Type Annotations**
- Location: Multiple service functions
- Severity: Low (TypeScript infers correctly, but violates CLAUDE.md conventions)
- Example: `docker.ts:141` - `getDockerClient()` function has explicit return type, but some others don't consistently follow this pattern

**Recommendation:** Add explicit return types to all exported functions per CLAUDE.md convention:
```typescript
// Current (some functions)
export async function listImages(hosts: HostConfig[], options: ListImagesOptions = {})

// Should be
export async function listImages(hosts: HostConfig[], options: ListImagesOptions = {}): Promise<ImageInfo[]>
```

---

## 2. Code Quality

### ✅ Strengths

**TypeScript Strict Mode:**
- `tsconfig.json` has `strict: true` enabled
- Good use of discriminated unions in schemas
- Proper null handling throughout

**ESLint Configuration:**
- Uses TypeScript strict recommended rules
- Explicit function return type warnings
- Prettier integration for consistent formatting
- Zero linting errors in current codebase

**Code Organization:**
- Functions are appropriately sized (mostly < 100 lines)
- Clear naming conventions
- Good use of helper functions
- Consistent error handling patterns

**Modern ES2022 Features:**
- Proper use of async/await (no callbacks)
- Optional chaining and nullish coalescing
- ES modules with .js extensions

### ⚠️ Issues

**Issue #2: Magic Numbers in Formatters**
- Location: `formatters/index.ts:492`, `index.ts:196-200`
- Severity: Low
- Details: Hardcoded array slicing values (e.g., `.slice(0, 2)`, `.slice(0, 5)`, `.slice(0, 20)`)

**Recommendation:** Extract to named constants:
```typescript
const MAX_TAGS_DISPLAY = 2;
const MAX_MOUNTS_DISPLAY = 5;
const MAX_ENV_VARS_DISPLAY = 20;
```

**Issue #3: Missing Error Context in Some Catch Blocks**
- Location: `docker.ts:194`, `docker.ts:293`
- Severity: Low
- Details: Silent failures in Promise.allSettled contexts

**Recommendation:** Log failures with context:
```typescript
} catch (error) {
  console.error(`Failed to list containers on ${hosts[i].name}:`, result.reason);
}
```

---

## 3. Security Practices

### ⭐ Excellent Security Implementation

**Input Sanitization:**
```typescript
// ssh.ts:11-17
export function sanitizeForShell(input: string): string {
  if (!/^[a-zA-Z0-9._\-/]+$/.test(input)) {
    throw new Error(`Invalid characters in input: ${input}`);
  }
  return input;
}
```

**✅ Comprehensive Validation:**
1. **SSH Injection Prevention:**
   - `validateHostForSsh()` validates all SSH-related inputs
   - Regex patterns prevent shell metacharacters
   - Uses `execFile` instead of `shell: true` (excellent!)

2. **Docker Command Validation:**
   - Project names validated: `/^[a-zA-Z0-9_-]+$/`
   - Image tags validated before build
   - Context paths validated before docker build

3. **Environment Variable Masking:**
   - Sensitive env vars masked in inspect output (`formatters/index.ts:197`)
   - Pattern: `/password|secret|key|token|api/i`

4. **Force Flags for Destructive Operations:**
   - `docker prune` requires `force=true`
   - `image remove` has force parameter
   - Clear user confirmation required

### ⚠️ Minor Security Observations

**Issue #4: Broad Env Var Masking Pattern**
- Location: `formatters/index.ts:197`
- Severity: Very Low
- Details: Pattern `/password|secret|key|token|api/i` might mask legitimate vars like "ENCRYPTION_KEY_PATH" when showing just the key

**Recommendation:** Consider more precise pattern or mask the value portion only

**Issue #5: Docker API Port 2375 Insecurity**
- Location: Documentation and code comments
- Severity: Medium (Documentation/Education)
- Details: README correctly warns about TLS, but could be more prominent

**Recommendation:** Add security check that warns if connecting to non-localhost without TLS

---

## 4. TypeScript & Type Safety

### ✅ Strengths

**Comprehensive Type Definitions:**
- All major domain objects have interfaces (`types.ts`)
- Good use of union types (`state: "running" | "paused" | "exited" | ...`)
- Proper enum usage (`ResponseFormat`)

**Zod Schema Validation:**
```typescript
// unified.ts - Excellent discriminated union pattern
export const UnifiedHomelabSchema = z.union([
  containerListSchema,
  containerStartSchema,
  // ... all schemas
]);
```

**Type Inference:**
- `type UnifiedHomelabInput = z.infer<typeof UnifiedHomelabSchema>`
- Proper type narrowing in handlers
- Good use of type guards

### ⚠️ Issues

**Issue #6: Type Assertion in Docker Service**
- Location: `docker.ts:723-750`
- Severity: Low
- Details: Manual type annotations for dockerode responses could be stricter

```typescript
type ImageInfo = { Size?: number; SharedSize?: number; Containers?: number };
const images: ImageInfo[] = df.Images || [];
```

**Recommendation:** Consider using zod to validate external API responses

**Issue #7: Missing Exported Types**
- Location: `formatters/index.ts` exports interfaces but they're duplicated in other files
- Severity: Very Low
- Details: Some interfaces defined inline in formatters should be in `types.ts`

---

## 5. Testing

### ⚠️ Critical Area for Improvement

**Current Coverage:**
```
Overall:        37.85% statements, 25.61% branches
Services:       35.8%  (critical business logic)
Formatters:     30.58% (presentation layer)
Tools:          35.14% (API layer)
```

**Test Quality - Strengths:**
1. ✅ Good unit tests for utilities (formatBytes, formatUptime, sanitization)
2. ✅ Schema validation tests
3. ✅ Integration tests for unified tool
4. ✅ Proper use of Vitest with clear test organization

**Test Quality - Gaps:**

**Issue #8: Low Service Test Coverage**
- `compose.ts`: 16.49% coverage
- `docker.ts`: 35.66% coverage
- Many critical functions untested

**Recommendation:** Prioritize testing:
1. Mock dockerode for docker service tests
2. Test error paths (network failures, invalid responses)
3. Test edge cases (empty results, pagination boundaries)
4. Add tests for SSH command construction

**Issue #9: No Integration Tests with Real Docker**
- Current tests skip when Docker unavailable
- No end-to-end tests

**Recommendation:**
- Add optional integration tests marked with `@integration`
- Document how to run full test suite
- Consider using testcontainers for integration tests

---

## 6. Documentation

### ✅ Strengths

**Excellent README:**
- Clear feature list
- Configuration examples
- Usage examples
- Architecture diagram
- Security warnings

**CLAUDE.md Conventions:**
- Well-defined architecture
- Code conventions documented
- TDD workflow documented
- Security notes included

**Code Comments:**
- JSDoc comments on most functions
- Clear section separators
- Inline comments for complex logic

### ⚠️ Issues

**Issue #10: Missing API Documentation**
- Severity: Low
- Details: No formal API documentation for the unified tool actions

**Recommendation:** Create `docs/API.md` with:
- All action/subaction combinations
- Request/response examples
- Error cases

**Issue #11: Outdated README**
- Location: `README.md:18-30`
- Severity: Low
- Details: README shows old individual tools instead of unified tool

**Recommendation:** Update tools table to reflect unified architecture

---

## 7. Adherence to CLAUDE.md Conventions

### ✅ Following Conventions

1. ✅ **Tech Stack:** TypeScript 5.7+ with strict mode, Node.js ES2022, Zod validation
2. ✅ **async/await:** No callbacks used
3. ✅ **Zod Validation:** All inputs validated with schemas
4. ✅ **Input Sanitization:** Excellent SSH sanitization patterns
5. ✅ **Console.error for logging:** Properly used (stdout reserved for MCP)
6. ✅ **execFile for spawning:** Correctly using execFile, not shell
7. ✅ **Sensitive data masking:** Env vars masked in output

### ⚠️ Violations

**Issue #12: Not All Functions Have Explicit Return Types**
- Severity: Low
- Violates: "All functions must have explicit return types"
- Impact: TypeScript infers correctly, but convention violated

**Issue #13: TDD Not Fully Followed**
- Severity: Medium
- Details: 38% test coverage suggests not writing tests first
- Violates: "TDD: Write failing test first, then implement"

---

## 8. Performance & Efficiency

### ✅ Strengths

**Parallel Execution:**
```typescript
// docker.ts:281 - Excellent use of Promise.allSettled
const results = await Promise.allSettled(
  hosts.map((host) => listContainersOnHost(host, options))
);
```

**Connection Caching:**
```typescript
// docker.ts:26 - Smart client caching
export const dockerClients = new Map<string, Docker>();
```

**Pagination Support:**
- Offset/limit parameters throughout
- Prevents overwhelming responses
- Character limit truncation (40k chars)

### ⚠️ Issues

**Issue #14: No Connection Pool Management**
- Location: `docker.ts:26`
- Severity: Low
- Details: Cached clients never expire, could accumulate stale connections

**Recommendation:**
```typescript
// Add TTL or periodic cleanup
const CLIENT_TTL = 5 * 60 * 1000; // 5 minutes
// Implement cleanup on checkConnection failure
```

**Issue #15: Stats Fetching in Loop**
- Location: `unified.ts:286-298`
- Severity: Low
- Details: Sequential stats fetching could be parallelized

**Recommendation:**
```typescript
const statsPromises = containers.slice(0, 20).map(c =>
  getContainerStats(c.id, host).catch(() => null)
);
const allStats = (await Promise.allSettled(statsPromises))
  .filter(r => r.status === 'fulfilled' && r.value)
  .map(r => r.value);
```

---

## 9. Error Handling

### ✅ Strengths

**Graceful Degradation:**
- Promise.allSettled used for multi-host operations
- Failed hosts don't block others
- Clear error messages returned to users

**Validation Errors:**
- Zod provides clear validation errors
- Errors caught and formatted appropriately

### ⚠️ Issues

**Issue #16: Generic Error Messages**
- Location: Various catch blocks
- Severity: Low
- Details: Some errors lose context

**Example:**
```typescript
} catch (error) {
  throw new Error(`SSH failed: ${error instanceof Error ? error.message : "Unknown error"}`);
}
```

**Recommendation:** Include more context (host, command, etc.)

---

## 10. Specific File Reviews

### src/index.ts ⭐⭐⭐⭐⭐
**Excellent**: Clean entry point, proper transport setup, good help text, signal handling

### src/services/docker.ts ⭐⭐⭐⭐
**Good**: Comprehensive Docker operations, but needs:
- More tests
- Better error context
- Connection TTL management

### src/services/ssh.ts ⭐⭐⭐⭐⭐
**Excellent**: Outstanding security practices, good validation, clean implementation

### src/services/compose.ts ⭐⭐⭐⭐
**Good**: Clean compose operations, but needs:
- More tests (16% coverage)
- Error handling improvements

### src/tools/unified.ts ⭐⭐⭐⭐
**Good**: Clean routing, proper validation, but needs:
- More granular error messages
- Better type narrowing
- More tests

### src/schemas/unified.ts ⭐⭐⭐⭐⭐
**Excellent**: Comprehensive schema definitions, good use of discriminated unions, clear structure

### src/formatters/index.ts ⭐⭐⭐
**Adequate**: Works well but needs:
- Tests for all formatters
- Extract magic numbers
- Simplify some complex formatters

---

## 11. Dependencies & Supply Chain

### ✅ Strengths

**Minimal Dependencies:**
- Only essential production deps (dockerode, express, zod)
- Well-maintained packages
- TypeScript for type safety

**Development Dependencies:**
- Modern tooling (vitest, eslint, prettier)
- TypeScript 5.9.3

### ⚠️ Observations

**Issue #17: TypeScript Version**
- Current: 5.9.3
- CLAUDE.md specifies: 5.7+
- Recommendation: Update to 5.7+ to match requirements exactly, or update docs to reflect 5.9+

---

## 12. Summary of Issues

| ID | Severity | Category | Issue | Location |
|----|----------|----------|-------|----------|
| #1 | Low | Code Quality | Missing return type annotations | Various service functions |
| #2 | Low | Code Quality | Magic numbers in formatters | `formatters/index.ts` |
| #3 | Low | Error Handling | Silent failures in catch blocks | `docker.ts` |
| #4 | Very Low | Security | Broad env var masking pattern | `formatters/index.ts:197` |
| #5 | Medium | Documentation | Docker API security warning | `README.md` |
| #6 | Low | Type Safety | Manual type assertions | `docker.ts:723-750` |
| #7 | Very Low | Type Safety | Duplicate interface definitions | `formatters/index.ts` |
| #8 | **High** | Testing | Low service test coverage | `services/*.ts` |
| #9 | Medium | Testing | No integration tests | Test suite |
| #10 | Low | Documentation | Missing API documentation | `docs/` |
| #11 | Low | Documentation | Outdated README tools table | `README.md` |
| #12 | Low | Conventions | Missing explicit return types | Various functions |
| #13 | **High** | Conventions | TDD not fully followed | Test suite |
| #14 | Low | Performance | No connection pool TTL | `docker.ts:26` |
| #15 | Low | Performance | Sequential stats fetching | `unified.ts:286` |
| #16 | Low | Error Handling | Generic error messages | Various catch blocks |
| #17 | Very Low | Dependencies | TypeScript version mismatch | `package.json` |

---

## 13. Recommendations Priority

### 🔴 High Priority (Do First)

1. **Increase Test Coverage**
   - Target: 70%+ overall, 80%+ for services
   - Focus on: compose.ts, docker.ts critical paths
   - Add: Error path testing, edge cases

2. **Follow TDD for New Features**
   - Write tests before implementation
   - Use test coverage as gate for PRs

3. **Add Explicit Return Types**
   - Per CLAUDE.md conventions
   - Improves code clarity

### 🟡 Medium Priority (Do Soon)

4. **Create API Documentation**
   - Document all action/subaction combinations
   - Add request/response examples

5. **Improve Error Messages**
   - Add context (host, operation, parameters)
   - Better guidance for resolution

6. **Add Integration Tests**
   - Optional tests for real Docker
   - Use test containers or marks

### 🟢 Low Priority (Nice to Have)

7. **Extract Magic Numbers**
   - Constants for display limits
   - Configuration for timeouts

8. **Connection Pool Management**
   - Add TTL for cached clients
   - Periodic cleanup

9. **Update README**
   - Reflect unified tool architecture
   - Enhance security warnings

---

## 14. Conclusion

The homelab-mcp-server demonstrates **professional-quality code** with exceptional security practices and clean architecture. The codebase is well-structured, type-safe, and follows modern TypeScript best practices.

**The main area requiring attention is test coverage**, which at 38% is significantly below industry standards for critical infrastructure tools. Given that this tool manages Docker containers across multiple hosts (a high-stakes operation), comprehensive testing is essential.

**Security implementation is exemplary** - the input sanitization, validation, and use of `execFile` show deep understanding of security best practices. The Zod schema validation provides robust runtime type checking.

**With improved test coverage and minor refinements**, this would easily be a 5-star codebase. The recent refactoring to a unified tool (evident in the commit history) shows good architectural evolution.

### Recommended Next Steps:

1. Set test coverage target to 70%+ before adding new features
2. Add pre-commit hooks to enforce test coverage
3. Document the unified tool API
4. Address high-priority issues from the list above

**Overall: Strong foundation, production-ready with test improvements.**

---

## Appendix: Test Coverage Detail

```
File            | % Stmts | % Branch | % Funcs | % Lines
----------------|---------|----------|---------|----------
All files       |   37.85 |    25.61 |   41.66 |   38.95
src/formatters  |   30.58 |    17.79 |   47.36 |   30.24
src/services    |   35.8  |    26.73 |   41.17 |   36.4
  compose.ts    |   16.49 |    20.89 |   23.52 |   17.02  ⚠️
  docker.ts     |   35.66 |    22.89 |   44.06 |   35.93  ⚠️
  ssh.ts        |   76.59 |    50.00 |   55.55 |   80.00  ✅
src/tools       |   35.14 |    27.41 |   38.46 |   37.79
```

Note: `ssh.ts` has the best coverage at 76%, demonstrating that comprehensive testing is achievable.
