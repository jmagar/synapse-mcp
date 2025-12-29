# Error Handling Guide

## Principles

1. **Never lose debug context** - Chain errors, preserve stack traces
2. **Always log with structure** - Use logError utility
3. **Include operation context** - Host, command, operation name
4. **Re-throw after logging** - Don't silently swallow errors

## Custom Error Classes

### HostOperationError

Use for Docker API operations:

```typescript
throw new HostOperationError(
  "Failed to list containers",
  host.name,
  "listContainers",
  originalError
);
```

### SSHCommandError

Use for SSH command failures:

```typescript
throw new SSHCommandError(
  "Command failed",
  host.name,
  command,
  exitCode,
  stderr,
  stdout,
  originalError
);
```

### ComposeOperationError

Use for Docker Compose operations:

```typescript
throw new ComposeOperationError(
  "Failed to start services",
  host.name,
  project,
  action,
  originalError
);
```

## Logging Errors

### When to use logError

- Silent catches (config parsing, optional operations)
- Parallel operations (log failures but continue)
- Cleanup operations (log disposal errors)

### How to use logError

```typescript
import { logError, HostOperationError } from "../utils/errors.js";

try {
  await operation();
} catch (error) {
  logError(
    new HostOperationError("Operation failed", host.name, "operation", error),
    {
      requestId: "req-123",
      metadata: { key: "value" }
    }
  );
  // Re-throw if error should propagate
  throw error;
}
```

## Anti-Patterns

### ❌ DON'T: Silent catch

```typescript
try {
  await operation();
} catch {
  // Silent - loses all debug info
}
```

### ❌ DON'T: Generic error without context

```typescript
catch (error) {
  throw new Error("Operation failed"); // Lost original error
}
```

### ❌ DON'T: Log without structure

```typescript
catch (error) {
  console.error("Error:", error); // No context
}
```

### ✅ DO: Chain errors with context

```typescript
catch (error) {
  throw new HostOperationError(
    "Operation failed",
    host.name,
    "operation",
    error // Preserved original
  );
}
```

### ✅ DO: Log with structure

```typescript
catch (error) {
  logError(
    new HostOperationError("Op failed", host.name, "op", error),
    { metadata: { context: "value" } }
  );
}
```
