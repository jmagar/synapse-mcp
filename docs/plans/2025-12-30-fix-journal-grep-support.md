# Journal Grep Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add grep filtering support to the journal subaction to match schema definition

**Architecture:** Implement local filtering of journalctl output using the same pattern as dmesg (no-grep path) - fetch output, split lines, filter with includes(), join back. This avoids command injection risks while supporting the grep parameter that's already defined in the schema.

**Tech Stack:** TypeScript, Vitest, Zod validation

---

## Task 1: Write failing test for journal grep filtering

**Files:**
- Modify: `src/tools/handlers/scout-logs.test.ts:98-180`

**Step 1: Add test case for journal grep filtering**

Add new test case after the existing journal tests (around line 179):

```typescript
it('should apply grep filter to journal output', async () => {
  (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
    'Dec 15 10:00:00 tootie dockerd[123]: Started containerd\n' +
    'Dec 15 10:00:05 tootie systemd[1]: Starting Docker...\n' +
    'Dec 15 10:00:10 tootie dockerd[123]: Docker daemon started\n'
  );

  const result = await handleLogsAction({
    action: 'logs',
    subaction: 'journal',
    host: 'tootie',
    lines: 100,
    grep: 'dockerd'
  } as unknown as ScoutInput, mockContainer as ServiceContainer);

  // Should only contain dockerd lines
  expect(result).toContain('dockerd[123]: Started containerd');
  expect(result).toContain('dockerd[123]: Docker daemon started');
  expect(result).not.toContain('systemd[1]: Starting Docker');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts -t "should apply grep filter to journal output"`

Expected: FAIL - grep parameter is ignored, all lines returned

**Step 3: Commit**

```bash
git add src/tools/handlers/scout-logs.test.ts
git commit -m "test: add failing test for journal grep filtering"
```

---

## Task 2: Implement local grep filtering for journal subaction

**Files:**
- Modify: `src/tools/handlers/scout-logs.ts:77-114`

**Step 1: Add grep filtering logic after executeSSHCommand**

Replace lines 98-114 with:

```typescript
let output = await sshService.executeSSHCommand(hostConfig, 'journalctl', args);

// Apply local grep filtering if provided
if (grep) {
  const outputLines = output.split('\n');
  output = outputLines.filter(line => line.includes(grep)).join('\n');
}

if (format === ResponseFormat.JSON) {
  return JSON.stringify({
    host: hostConfig.name,
    subaction: 'journal',
    lines,
    unit: validatedInput.unit,
    since: validatedInput.since,
    until: validatedInput.until,
    priority: validatedInput.priority,
    grep,
    output: output.trim()
  }, null, 2);
}

return output.trim();
```

**Step 2: Run test to verify it passes**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts -t "should apply grep filter to journal output"`

Expected: PASS - grep filtering works correctly

**Step 3: Run all journal tests**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts -t "journal subaction"`

Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/tools/handlers/scout-logs.ts
git commit -m "feat: add grep filtering support to journal subaction"
```

---

## Task 3: Add test for JSON format with grep

**Files:**
- Modify: `src/tools/handlers/scout-logs.test.ts:98-180`

**Step 1: Add JSON format test with grep**

Add test case after the grep test:

```typescript
it('should include grep in JSON response', async () => {
  (mockSSHService.executeSSHCommand as ReturnType<typeof vi.fn>).mockResolvedValue(
    'Dec 15 10:00:00 tootie dockerd[123]: Started containerd\n' +
    'Dec 15 10:00:05 tootie systemd[1]: Starting Docker...\n'
  );

  const result = await handleLogsAction({
    action: 'logs',
    subaction: 'journal',
    host: 'tootie',
    lines: 100,
    grep: 'dockerd',
    response_format: ResponseFormat.JSON
  } as unknown as ScoutInput, mockContainer as ServiceContainer);

  const parsed = JSON.parse(result);
  expect(parsed.grep).toBe('dockerd');
  expect(parsed.output).toContain('dockerd[123]');
  expect(parsed.output).not.toContain('systemd[1]');
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts -t "should include grep in JSON response"`

Expected: PASS - grep is included in JSON and filtering works

**Step 3: Commit**

```bash
git add src/tools/handlers/scout-logs.test.ts
git commit -m "test: verify grep included in journal JSON response"
```

---

## Task 4: Run full test suite and verify coverage

**Files:**
- None (verification step)

**Step 1: Run all scout-logs tests**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts`

Expected: All tests PASS

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All tests PASS

**Step 3: Check test coverage**

Run: `pnpm test:coverage`

Expected: Coverage maintained or improved for scout-logs handler

**Step 4: Verify no regressions**

Run: `pnpm run build && pnpm run lint`

Expected: Clean build, no linting errors

**Step 5: Final commit if needed**

If any cleanup was needed:
```bash
git add .
git commit -m "chore: verify full test suite passes"
```

---

## Completion Checklist

- [ ] Test written and fails initially
- [ ] Implementation added
- [ ] Test passes with implementation
- [ ] JSON format test added and passes
- [ ] All scout-logs tests pass
- [ ] Full test suite passes
- [ ] Coverage maintained
- [ ] Clean build and lint
- [ ] Code review feedback addressed

## Notes

- This implementation uses local filtering (JavaScript `includes()`) rather than shell grep to avoid command injection
- The approach matches the dmesg no-grep path pattern
- The grep parameter is validated by `shellGrepSchema` at the schema level
- The implementation is consistent with the existing pattern used in other subactions
