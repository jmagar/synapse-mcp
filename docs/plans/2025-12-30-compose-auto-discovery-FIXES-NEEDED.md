# Compose Auto-Discovery Plan - Remaining Fixes

## ✅ COMPLETED FIXES

1. **Task 0**: Added TDD test-first approach with proper interface testing
2. **Task 1**: Removed Zod schema dependency (using TypeScript interfaces only)
3. **Task 4**: Added RED verification steps (3a-verify, 3b-verify, 3c-verify)

## ⚠️ REMAINING MANUAL FIXES NEEDED

### Critical Fix 1: Split Task 8 (Currently Too Large)

**Problem**: Task 8 has 11 steps mixing 7+ files - violates 2-5 minute step guideline

**Solution**: Split into 3 separate tasks:

```markdown
## Task 8a: Integrate Discovery into ComposeService (DONE - already split in plan)
- Steps 1-4 (ComposeService integration tests and implementation)
- Estimated: 20 minutes

## Task 8b: Wire Services in Container
- Step 5-6: Update ComposeDiscovery constructor
- Step 8: ServiceContainer wiring (initialize discovery, inject into compose service)
- Estimated: 15 minutes

## Task 8c: Add Handler Cache Invalidation
- Step 7: Create compose-utils.ts with withCacheInvalidation()
- Step 9: Update ALL compose handlers to wrap operations
- Step 10: Update Services interface to include composeDiscovery
- Step 11: Commit
- Estimated: 30 minutes
```

**Action Required**:
1. Insert "## Task 8b:" after current Task 8a Step 4
2. Move Steps 5-6, 8 to Task 8b
3. Insert "## Task 8c:" after Task 8b
4. Move Steps 7, 9-11 to Task 8c
5. Renumber subsequent tasks (Task 9 → Task 10, etc.)

### Critical Fix 2: Extract ComposeProjectLister Service (Architectural)

**Problem**: Bidirectional dependency between ComposeService ↔ ComposeDiscovery

**Current Approach**: Acknowledged as technical debt in plan (line 1391)

**Recommended Fix** (optional, can defer):
Create new file `src/services/compose-project-lister.ts`:

```typescript
export class ComposeProjectLister implements IComposeProjectLister {
  constructor(
    private sshService: ISSHService,
    private localExecutor: ILocalExecutorService
  ) {}

  async listComposeProjects(host: HostConfig): Promise<ComposeProject[]> {
    // Extract logic from ComposeService.listComposeProjects()
  }
}
```

Then:
- ComposeDiscovery depends on ComposeProjectLister
- ComposeService can also use ComposeProjectLister
- No circular dependency!

**Action**: Either (a) add as new Task 8b and renumber, or (b) accept technical debt and address in future PR

### Warning Fix 3: Task 10 - Redundant .gitignore Entry

**Problem**: `.cache/` already exists at line 27, adding `.cache/compose-projects/` is redundant

**Solution**: Update Task 10 to:

```markdown
## Task 10: Verify Cache Directory in .gitignore

**Step 1: Check if .cache/ is in .gitignore**

Run: `grep "^\.cache/" .gitignore`
Expected: Should find `.cache/` entry

**Step 2: If found, skip to commit. If NOT found, add it**

```bash
echo ".cache/" >> .gitignore
```

**Step 3: Commit (only if added)**

```bash
git add .gitignore
git commit -m "chore: ensure cache directory is ignored"
```
```

## 📋 VALIDATION SUMMARY

After applying these fixes:

- **Blockers**: 0 (both resolved)
- **Critical**: 2 (Task 8 split, ComposeProjectLister extraction)
- **Warnings**: 1 (Task 10 redundancy)

**Recommended approach**:
1. Split Task 8 manually (10 minutes)
2. Accept ComposeProjectLister technical debt (document it)
3. Fix Task 10 redundancy (2 minutes)

Then re-run `/validate-plan` to verify all fixes applied correctly.

## 🎯 NEXT STEPS

1. **Option A (Recommended)**: Manually edit plan to split Task 8 into 8a/8b/8c
2. **Option B**: Proceed with execution, accepting that Task 8 will take longer (acceptable for single implementer)
3. **Option C**: Have me create a fully corrected plan file (will take additional time)

Choose your preferred path forward.
