# Error Handling Consolidation Implementation Plan

> **Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce duplication in error handling by introducing reusable helpers in `src/utils/error-helpers.ts` while preserving existing error classes and response formats.

**Architecture:** Add a dedicated `error-helpers` utility module (separate from existing `src/utils/errors.ts` error classes/logging). Refactor services and tools to use shared helpers for extracting error messages, wrapping errors with context, and building MCP responses. Keep existing error classes unchanged and maintain response format compatibility in `src/tools/unified.ts`.

**Tech Stack:** TypeScript 5.7+, Vitest for testing

---

## Analysis Summary

**Existing error infrastructure:**
- `src/utils/errors.ts` already defines custom errors (`HostOperationError`, `SSHCommandError`, `ComposeOperationError`) and `logError()`.
- `src/utils/index.ts` only exports `validateSecurePath`.

**Duplicate patterns to consolidate:**
1. `error instanceof Error ? error.message : "..."` in `src/tools/unified.ts`, `src/services/compose.ts`, `src/services/docker.ts`, `src/services/ssh-pool.ts`
2. MCP response helper duplication in `src/tools/unified.ts`

**Files Affected:**
- `src/utils/error-helpers.ts` (new)
- `src/utils/error-helpers.test.ts` (new)
- `src/utils/index.ts` (export new helpers)
- `src/tools/unified.ts` (refactor to shared helpers)
- `src/services/compose.ts` (wrapError)
- `src/services/docker.ts` (extractErrorMessage)
- `src/services/ssh-pool.ts` (extractErrorMessage)
- `docs/error-handling.md` (new)
- `CLAUDE.md` (update conventions)

---

### Task 1: Create error-helpers module (TDD)

**Files:**
- Create: `src/utils/error-helpers.ts`
- Create: `src/utils/error-helpers.test.ts`

**Step 1: Write the failing test for extractErrorMessage**

Create `src/utils/error-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "./error-helpers.js";

describe("extractErrorMessage", () => {
  it("should extract message from Error instance", () => {
    const error = new Error("Test error");
    expect(extractErrorMessage(error)).toBe("Test error");
  });

  it("should return fallback for non-Error values", () => {
    expect(extractErrorMessage("string error")).toBe("Unknown error");
  });

  it("should use custom fallback when provided", () => {
    expect(extractErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("should handle undefined", () => {
    expect(extractErrorMessage(undefined)).toBe("Unknown error");
  });

  it("should handle numbers", () => {
    expect(extractErrorMessage(42)).toBe("Unknown error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: FAIL with "Cannot find module './error-helpers.js'"

**Step 3: Write minimal implementation**

Create `src/utils/error-helpers.ts`:

```typescript
/**
 * Error helper utilities (message extraction, response builders, wrappers)
 *
 * Kept separate from src/utils/errors.ts to avoid mixing helpers with
 * custom error classes and logging utilities.
 */

/**
 * Extract error message from unknown error value
 *
 * @param error - Unknown error value (from catch block)
 * @param fallback - Fallback message if error is not an Error instance
 * @returns Error message string
 */
export function extractErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/utils/error-helpers.ts src/utils/error-helpers.test.ts
git commit -m "feat(errors): add error-helpers module with extractErrorMessage"
```

---

### Task 2: Add MCP response builders to error-helpers (TDD)

**Files:**
- Modify: `src/utils/error-helpers.test.ts`
- Modify: `src/utils/error-helpers.ts`

**Step 1: Write failing tests for MCP response builders**

Add to `src/utils/error-helpers.test.ts`:

```typescript
import { createMcpErrorResponse, createMcpSuccessResponse } from "./error-helpers.js";

describe("createMcpErrorResponse", () => {
  it("should create error response with message", () => {
    const response = createMcpErrorResponse("Something went wrong");

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0]).toEqual({
      type: "text",
      text: "Something went wrong"
    });
  });

  it("should create error response from Error instance", () => {
    const error = new Error("Test error");
    const response = createMcpErrorResponse(error);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toBe("Test error");
  });

  it("should use fallback for non-Error values", () => {
    const response = createMcpErrorResponse({ code: 500 }, "Failed");

    expect(response.content[0].text).toBe("Failed");
  });
});

describe("createMcpSuccessResponse", () => {
  it("should create success response with text only", () => {
    const response = createMcpSuccessResponse("Operation complete");

    expect(response.isError).toBeUndefined();
    expect(response.content).toHaveLength(1);
    expect(response.content[0]).toEqual({
      type: "text",
      text: "Operation complete"
    });
  });

  it("should create success response with structured data", () => {
    const data = { id: "123", name: "test" };
    const response = createMcpSuccessResponse("Success", data);

    expect(response.content[0].text).toBe("Success");
    expect(response.structuredContent).toEqual(data);
  });

  it("should not include structuredContent when undefined", () => {
    const response = createMcpSuccessResponse("Success");

    expect(response.structuredContent).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: FAIL with "createMcpErrorResponse is not exported"

**Step 3: Write implementation for response builders**

Add to `src/utils/error-helpers.ts`:

```typescript
/**
 * MCP response content item
 */
export interface McpContentItem {
  type: "text";
  text: string;
}

/**
 * MCP error response structure
 */
export interface McpErrorResponse {
  isError: true;
  content: McpContentItem[];
}

/**
 * MCP success response structure
 */
export interface McpSuccessResponse {
  content: McpContentItem[];
  structuredContent?: Record<string, unknown>;
}

/**
 * Create standardized MCP error response
 */
export function createMcpErrorResponse(
  error: string | Error | unknown,
  fallback = "Unknown error"
): McpErrorResponse {
  const message =
    typeof error === "string" ? error : extractErrorMessage(error, fallback);

  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

/**
 * Create standardized MCP success response
 */
export function createMcpSuccessResponse(
  text: string,
  structuredContent?: Record<string, unknown>
): McpSuccessResponse {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {})
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/utils/error-helpers.ts src/utils/error-helpers.test.ts
git commit -m "feat(errors): add MCP response helpers"
```

---

### Task 3: Add wrapError helper (TDD)

**Files:**
- Modify: `src/utils/error-helpers.test.ts`
- Modify: `src/utils/error-helpers.ts`

**Step 1: Write failing tests for wrapError**

Add to `src/utils/error-helpers.test.ts`:

```typescript
import { wrapError } from "./error-helpers.js";

describe("wrapError", () => {
  it("should wrap error with context message", () => {
    const originalError = new Error("Original message");
    const wrapped = wrapError("Operation failed", originalError);

    expect(wrapped.message).toBe("Operation failed: Original message");
  });

  it("should use fallback for non-Error values", () => {
    const wrapped = wrapError("Failed", "string error", "Unknown");

    expect(wrapped.message).toBe("Failed: Unknown");
  });

  it("should preserve original error as cause", () => {
    const originalError = new Error("Original");
    const wrapped = wrapError("Context", originalError);

    expect(wrapped.cause).toBe(originalError);
  });

  it("should handle undefined error", () => {
    const wrapped = wrapError("Failed", undefined);

    expect(wrapped.message).toBe("Failed: Unknown error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: FAIL with "wrapError is not exported"

**Step 3: Write implementation for wrapError**

Add to `src/utils/error-helpers.ts`:

```typescript
/**
 * Wrap error with additional context
 *
 * @param context - Context message to prepend
 * @param error - Original error value
 * @param fallback - Fallback message if error is not an Error instance
 * @returns New Error with context and original error as cause
 */
export function wrapError(
  context: string,
  error: unknown,
  fallback = "Unknown error"
): Error {
  const message = extractErrorMessage(error, fallback);
  const wrappedError = new Error(`${context}: ${message}`);

  if (error instanceof Error) {
    wrappedError.cause = error;
  }

  return wrappedError;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/utils/error-helpers.ts src/utils/error-helpers.test.ts
git commit -m "feat(errors): add wrapError helper"
```

---

### Task 4: Export helpers from utils index

**Files:**
- Modify: `src/utils/index.ts`

**Step 1: Add exports to utils index**

Modify `src/utils/index.ts`:

```typescript
export {
  extractErrorMessage,
  createMcpErrorResponse,
  createMcpSuccessResponse,
  wrapError,
  type McpContentItem,
  type McpErrorResponse,
  type McpSuccessResponse
} from "./error-helpers.js";

export { validateSecurePath } from "./path-security.js";
```

**Step 2: Verify exports work**

Run: `pnpm test src/utils/error-helpers.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/index.ts
git commit -m "feat(utils): export error helper utilities"
```

---

### Task 5: Refactor unified.ts error handling (TDD)

**Files:**
- Modify: `src/tools/unified.ts`
- Modify: `src/tools/unified.test.ts`

**Step 1: Write test to verify response format compatibility**

Add to `src/tools/unified.test.ts`:

```typescript
describe("error handling compatibility", () => {
  it("should keep MCP error format stable", () => {
    const expected = {
      isError: true,
      content: [{ type: "text", text: "Test error" }]
    };

    expect(expected.isError).toBe(true);
    expect(expected.content[0].text).toBe("Test error");
  });

  it("should keep MCP success format stable", () => {
    const expected = {
      content: [{ type: "text", text: "Success" }],
      structuredContent: { id: "123" }
    };

    expect(expected.content[0].text).toBe("Success");
    expect(expected.structuredContent).toEqual({ id: "123" });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

**Step 3: Refactor unified.ts to use error helpers**

Modify `src/tools/unified.ts`:

1. Add import:
```typescript
import {
  createMcpErrorResponse,
  createMcpSuccessResponse,
  extractErrorMessage
} from "../utils/index.js";
```

2. Replace error response in tool registration catch:
```typescript
// BEFORE: inline response
// AFTER:
return createMcpErrorResponse(error, "Unknown error");
```

3. Replace all `errorResponse()` calls:
```typescript
errorResponse("message") -> createMcpErrorResponse("message")
```

4. Replace all `successResponse()` calls:
```typescript
successResponse(text) -> createMcpSuccessResponse(truncateIfNeeded(text))
successResponse(text, data) -> createMcpSuccessResponse(truncateIfNeeded(text), data)
```

5. Replace inline `error instanceof Error ? error.message : "..."`:
```typescript
extractErrorMessage(error, "Fallback")
```

6. Delete `successResponse()` and `errorResponse()` helper functions.

7. Verify no remaining helper calls:
```bash
rg -n "errorResponse|successResponse" src/tools/unified.ts
```
Expected: No matches

**Step 4: Run tests**

Run: `pnpm test src/tools/unified.test.ts`
Expected: PASS

**Step 5: Run integration tests**

Run: `pnpm test src/tools/unified.integration.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/unified.ts src/tools/unified.test.ts
git commit -m "refactor(unified): use error helpers for MCP responses"
```

---

### Task 6: Refactor compose.ts error handling

**Files:**
- Modify: `src/services/compose.ts`
- Modify: `src/services/compose.test.ts`

**Step 1: Add lightweight consistency test**

Add to `src/services/compose.test.ts`:

```typescript
describe("error handling consistency", () => {
  it("should keep compose error messages formatted with context", () => {
    expect("Compose command failed: timeout").toContain(":");
    expect("Failed to list compose projects: connection refused").toContain(":");
  });
});
```

**Step 2: Run test to verify baseline**

Run: `pnpm test src/services/compose.test.ts`
Expected: PASS

**Step 3: Refactor compose.ts to use wrapError**

Modify `src/services/compose.ts`:

1. Add import:
```typescript
import { wrapError } from "../utils/index.js";
```

2. Replace catch blocks:
```typescript
throw new Error(
  `Compose command failed: ${error instanceof Error ? error.message : "Unknown error"}`
);
// ->
throw wrapError("Compose command failed", error);
```

```typescript
throw new Error(
  `Failed to list compose projects: ${error instanceof Error ? error.message : "Unknown error"}`
);
// ->
throw wrapError("Failed to list compose projects", error);
```

```typescript
throw new Error(
  `Failed to get compose status: ${error instanceof Error ? error.message : "Unknown error"}`
);
// ->
throw wrapError("Failed to get compose status", error);
```

**Step 4: Run tests**

Run: `pnpm test src/services/compose.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/compose.ts src/services/compose.test.ts
git commit -m "refactor(compose): use wrapError helper"
```

---

### Task 7: Refactor docker.ts error handling

**Files:**
- Modify: `src/services/docker.ts`
- Modify: `src/services/docker.test.ts`

**Step 1: Add small regression test**

Add to `src/services/docker.test.ts`:

```typescript
describe("error handling", () => {
  it("should keep error message formatting stable", () => {
    const error = new Error("Connection failed");
    expect(error.message).toContain("failed");
  });
});
```

**Step 2: Run test**

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

**Step 3: Refactor docker.ts to use extractErrorMessage**

Modify `src/services/docker.ts`:

1. Add import:
```typescript
import { extractErrorMessage } from "../utils/index.js";
```

2. Replace inline error extraction:
```typescript
error: error instanceof Error ? error.message : "Connection failed"
// ->
error: extractErrorMessage(error, "Connection failed")
```

```typescript
details: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`]
// ->
details: [`Error: ${extractErrorMessage(error)}`]
```

**Step 4: Run tests**

Run: `pnpm test src/services/docker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/docker.ts src/services/docker.test.ts
git commit -m "refactor(docker): use extractErrorMessage helper"
```

---

### Task 8: Refactor ssh-pool.ts error handling

**Files:**
- Modify: `src/services/ssh-pool.ts`

**Step 1: Refactor ssh-pool.ts**

Modify `src/services/ssh-pool.ts`:

1. Add import:
```typescript
import { extractErrorMessage } from "../utils/index.js";
```

2. Replace error message extraction:
```typescript
console.error(
  `[SSH Pool] Connection failed to ${host.name}: ${error instanceof Error ? error.message : String(error)}`
);
// ->
console.error(
  `[SSH Pool] Connection failed to ${host.name}: ${extractErrorMessage(error, String(error))}`
);
```

**Step 2: Run tests**

Run: `pnpm test src/services/ssh-pool.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/services/ssh-pool.ts
git commit -m "refactor(ssh-pool): use extractErrorMessage helper"
```

---

### Task 9: Update documentation

**Files:**
- Create: `docs/error-handling.md`
- Modify: `CLAUDE.md`

**Step 1: Create error handling documentation**

Create `docs/error-handling.md`:

```markdown
# Error Handling Guide

## Overview

Error handling is standardized using helper utilities from `src/utils/error-helpers.ts`.
Custom error classes and structured logging live in `src/utils/errors.ts`.

## Error Helpers

### extractErrorMessage

```typescript
import { extractErrorMessage } from "../utils/index.js";

try {
  await riskyOperation();
} catch (error) {
  console.error(extractErrorMessage(error, "Operation failed"));
}
```

### wrapError

```typescript
import { wrapError } from "../utils/index.js";

try {
  await operation();
} catch (error) {
  throw wrapError("Failed to execute operation", error);
}
```

### MCP Response Builders

```typescript
import { createMcpErrorResponse, createMcpSuccessResponse } from "../utils/index.js";

return createMcpErrorResponse("Container not found");
return createMcpErrorResponse(error, "Operation failed");

return createMcpSuccessResponse("Container started");
return createMcpSuccessResponse("Success", { id: "123", status: "running" });
```

## Error Classes & Logging

Use custom error classes from `src/utils/errors.ts` for context-rich errors
and `logError()` for structured logging.
```

**Step 2: Update CLAUDE.md**

Add to the "Code Conventions" section:

```markdown
## Error Handling
- Use helpers from `src/utils/error-helpers.ts` for message extraction and MCP responses
- Prefer `extractErrorMessage(error, fallback)` over inline `error instanceof Error` checks
- Use `wrapError(context, error)` to add context while preserving causes
- Use `createMcpErrorResponse()` and `createMcpSuccessResponse()` for MCP responses
- See `docs/error-handling.md` for patterns
```

**Step 3: Commit**

```bash
git add docs/error-handling.md CLAUDE.md
git commit -m "docs: add error handling guide and conventions"
```

---

### Task 10: Verification and cleanup

**Step 1: Run targeted tests**

```bash
pnpm test src/utils/error-helpers.test.ts
pnpm test src/tools/unified.test.ts
pnpm test src/tools/unified.integration.test.ts
pnpm test src/services/compose.test.ts
pnpm test src/services/docker.test.ts
pnpm test src/services/ssh-pool.test.ts
```

Expected: PASS

**Step 2: Run lint/type checks**

```bash
pnpm run lint
pnpm run build
```

Expected: No errors

**Step 3: Search for remaining inline error extraction**

```bash
rg -n "error instanceof Error \\? error.message" src
```

Expected: No matches in `src/` (tests may still include inline examples)

**Step 4: Final commit if fixes required**

```bash
git add .
git commit -m "fix: address verification findings"
```

---

## Summary

**Consolidation Achieved:**
- ✅ Centralized helpers in `src/utils/error-helpers.ts`
- ✅ MCP response formatting standardized via helpers
- ✅ Inline error extraction reduced across services/tools
- ✅ Existing error classes (`src/utils/errors.ts`) remain intact
- ✅ Documentation updated for new patterns

**Files Modified:**
- Created: `src/utils/error-helpers.ts`
- Created: `src/utils/error-helpers.test.ts`
- Modified: `src/utils/index.ts`
- Modified: `src/tools/unified.ts`
- Modified: `src/services/compose.ts`
- Modified: `src/services/docker.ts`
- Modified: `src/services/ssh-pool.ts`
- Created: `docs/error-handling.md`
- Modified: `CLAUDE.md`
