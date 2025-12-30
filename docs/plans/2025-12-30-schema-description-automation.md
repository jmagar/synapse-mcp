# Schema Description Automation Implementation Plan

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automate tool description generation from Zod schemas and auto-update README documentation.

**Architecture:** Add `.describe()` to top-level Flux and Scout schemas, extract descriptions using `getSchemaDescription()` in tool registration, and create a build-time script to auto-generate the tools table in README.md.

**Tech Stack:**
- TypeScript 5.7+ with Zod 4.2+
- MCP SDK 1.25.1 (`getSchemaDescription()`)
- Node.js fs/promises for file operations
- tsx for running TypeScript scripts

---

## Task 1: Add Schema Descriptions

**Files:**
- Modify: `src/schemas/flux/index.ts:164-167`
- Modify: `src/schemas/scout/index.ts:33-48`
- Test: `src/schemas/flux/index.test.ts` (new)
- Test: `src/schemas/scout/index.test.ts` (new)

**Step 1: Write failing test for FluxSchema description**

Create: `src/schemas/flux/index.test.ts`

```typescript
// src/schemas/flux/index.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema } from './index.js';

describe('FluxSchema', () => {
  it('should have a description', () => {
    expect(FluxSchema.description).toBeDefined();
    expect(FluxSchema.description).toContain('Docker infrastructure management');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/flux/index.test.ts`
Expected: FAIL with "expected undefined to be defined"

**Step 3: Add .describe() to FluxSchema**

Modify: `src/schemas/flux/index.ts:164-167`

```typescript
export const FluxSchema = z.preprocess(
  preprocessWithDiscriminator,
  z.discriminatedUnion("action_subaction", allSchemas)
).describe("Docker infrastructure management - container, compose, docker, and host operations");
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/flux/index.test.ts`
Expected: PASS

**Step 5: Write failing test for ScoutSchema description**

Create: `src/schemas/scout/index.test.ts`

```typescript
// src/schemas/scout/index.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutSchema } from './index.js';

describe('ScoutSchema', () => {
  it('should have a description', () => {
    expect(ScoutSchema.description).toBeDefined();
    expect(ScoutSchema.description).toContain('SSH remote operations');
  });
});
```

**Step 6: Run test to verify it fails**

Run: `pnpm test src/schemas/scout/index.test.ts`
Expected: FAIL with "expected undefined to be defined"

**Step 7: Add .describe() to ScoutSchema**

Modify: `src/schemas/scout/index.ts:33-48`

```typescript
export const ScoutSchema = z.union([
  // Simple actions (9)
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema,

  // Nested discriminators (2) - these are already discriminated unions
  scoutZfsSchema,
  scoutLogsSchema
]).describe("SSH remote operations - file, process, and system inspection");
```

**Step 8: Run test to verify it passes**

Run: `pnpm test src/schemas/scout/index.test.ts`
Expected: PASS

**Step 9: Commit schema descriptions**

```bash
git add src/schemas/flux/index.ts src/schemas/flux/index.test.ts
git add src/schemas/scout/index.ts src/schemas/scout/index.test.ts
git commit -m "feat: add descriptions to FluxSchema and ScoutSchema

- Add .describe() to FluxSchema with Docker infrastructure description
- Add .describe() to ScoutSchema with SSH operations description
- Add unit tests to verify schema descriptions are defined
- Prepares schemas for automated description extraction"
```

---

## Task 2: Update Tool Registration

**Files:**
- Modify: `src/tools/index.ts:6,23,55`
- Modify: `src/tools/index.test.ts:48,57`

**Step 1: Write failing test for description extraction**

Modify: `src/tools/index.test.ts:48,57`

Add import at top:
```typescript
import { getSchemaDescription } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { FluxSchema } from '../schemas/flux/index.js';
import { ScoutSchema } from '../schemas/scout/index.js';
```

Add new test after existing tests:
```typescript
it('should extract descriptions from schemas', () => {
  const server = {
    registerTool: vi.fn()
  } as unknown as McpServer;

  const container = {} as ServiceContainer;

  registerTools(server, container);

  const mockFn = server.registerTool as ReturnType<typeof vi.fn>;

  // Verify flux description matches schema
  const fluxCall = mockFn.mock.calls[0] as unknown[];
  const fluxConfig = fluxCall[1] as { description: string };
  expect(fluxConfig.description).toBe(getSchemaDescription(FluxSchema));

  // Verify scout description matches schema
  const scoutCall = mockFn.mock.calls[1] as unknown[];
  const scoutConfig = scoutCall[1] as { description: string };
  expect(scoutConfig.description).toBe(getSchemaDescription(ScoutSchema));
});

it('should not use fallback descriptions', () => {
  // Ensure .describe() was actually added to schemas
  const fluxDesc = getSchemaDescription(FluxSchema);
  const scoutDesc = getSchemaDescription(ScoutSchema);

  expect(fluxDesc).not.toBeNull();
  expect(fluxDesc).not.toBeUndefined();
  expect(scoutDesc).not.toBeNull();
  expect(scoutDesc).not.toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/index.test.ts`
Expected: FAIL with description mismatch

**Step 3: Update tool registration to use getSchemaDescription()**

Modify: `src/tools/index.ts:6,23,55`

Add import at line 6:
```typescript
import { getSchemaDescription } from '@modelcontextprotocol/sdk/server/zod-compat.js';
```

Replace line 23:
```typescript
description: getSchemaDescription(FluxSchema) ?? 'Docker infrastructure management',
```

Replace line 55:
```typescript
description: getSchemaDescription(ScoutSchema) ?? 'SSH remote operations',
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/index.test.ts`
Expected: PASS

**Step 5: Commit tool registration changes**

```bash
git add src/tools/index.ts src/tools/index.test.ts
git commit -m "feat: extract tool descriptions from schemas

- Import getSchemaDescription from MCP SDK
- Replace hardcoded descriptions with schema extraction
- Add fallback descriptions for safety
- Add test to verify descriptions match schema definitions
- Establishes single source of truth for tool descriptions"
```

---

## Task 3: Add tsx Dependency

**Files:**
- Modify: `package.json:71-84`

**Step 1: Write test for tsx availability**

Manual test plan:
1. Run `pnpm tsx --version`
2. Verify tsx is available

**Step 2: Install tsx as dev dependency**

Run: `pnpm add -D tsx`

**Step 3: Verify tsx installation**

Run: `pnpm tsx --version`
Expected: Version number displayed (e.g., "4.x.x")

**Step 4: Test TypeScript script execution**

Run: `pnpm tsx --help`
Expected: tsx help output displayed

**Step 5: Commit package.json and lockfile**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add tsx for TypeScript script execution

- Add tsx as dev dependency
- Enables running update-readme.ts directly
- No compilation step needed for scripts"
```

---

## Task 4: Create README Update Script

**Files:**
- Create: `scripts/update-readme.ts`
- Test: Manual verification (script execution)

**Step 1: Create scripts directory**

Run: `mkdir -p scripts`

**Step 2: Write README update script**

Create: `scripts/update-readme.ts`

```typescript
#!/usr/bin/env tsx
// scripts/update-readme.ts
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSchemaDescription } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { FluxSchema } from '../src/schemas/flux/index.js';
import { ScoutSchema } from '../src/schemas/scout/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const readmePath = join(rootDir, 'README.md');

async function updateReadme(): Promise<void> {
  console.log('📖 Reading README.md...');
  const readme = await readFile(readmePath, 'utf-8');

  // Extract descriptions from schemas
  const fluxDesc = getSchemaDescription(FluxSchema) ?? 'Docker infrastructure management';
  const scoutDesc = getSchemaDescription(ScoutSchema) ?? 'SSH remote operations';

  console.log('✓ Flux description:', fluxDesc);
  console.log('✓ Scout description:', scoutDesc);

  // Find the "Available Tools" section and replace the tool descriptions
  const toolsTableRegex = /#### flux\n\n([^\n]+)\n/;
  const scoutTableRegex = /#### scout\n\n([^\n]+)\n/;

  let updated = readme;

  // Update flux description
  updated = updated.replace(
    toolsTableRegex,
    `#### flux\n\n${fluxDesc}\n`
  );

  // Update scout description
  updated = updated.replace(
    scoutTableRegex,
    `#### scout\n\n${scoutDesc}\n`
  );

  // Verify that replacements occurred
  if (updated === readme) {
    console.error('⚠️  WARNING: No changes detected in README');
    console.error('Regex patterns may not match current README structure');
    process.exit(1);
  }

  // Write updated README
  await writeFile(readmePath, updated, 'utf-8');
  console.log('✅ README.md updated successfully');
}

updateReadme().catch((error) => {
  console.error('❌ Failed to update README:', error);
  process.exit(1);
});
```

**Step 3: Make script executable**

Run: `chmod +x scripts/update-readme.ts`

**Step 4: Test script execution**

Run: `tsx scripts/update-readme.ts`
Expected: Console output showing descriptions and "README.md updated successfully"

**Step 5: Verify README was updated**

Run: `git diff README.md`
Expected: Tool descriptions in README match schema descriptions

**Step 6: Commit script**

```bash
git add scripts/update-readme.ts
git commit -m "feat: add automated README update script

- Create scripts/update-readme.ts to extract schema descriptions
- Auto-update tool descriptions in README.md
- Uses getSchemaDescription() for single source of truth
- Prevents documentation drift from schema definitions"
```

---

## Task 5: Integrate Script into Build Process

**Files:**
- Modify: `package.json:20-36`

**Step 1: Write test for docs:update script**

Manual test plan:
1. Run `pnpm docs:update`
2. Verify README.md is updated
3. Verify no errors in output

**Step 2: Add docs:update script to package.json**

Modify: `package.json` scripts section (after line 22)

```json
{
  "scripts": {
    "build": "pnpm docs:update && tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "clean": "rm -rf dist coverage",
    "docs:update": "tsx scripts/update-readme.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run \"**/*.integration.test.ts\"",
    "test:bench": "vitest run src/schemas/unified.bench.test.ts",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "format:check": "prettier --check src/",
    "prepublishOnly": "pnpm run build"
  }
}
```

**Step 3: Run docs:update to verify it works**

Run: `pnpm docs:update`
Expected: Script runs successfully, README updated

**Step 4: Run build to verify integration**

Run: `pnpm build`
Expected: README updates, then TypeScript compiles

**Step 5: Commit package.json changes**

```bash
git add package.json
git commit -m "feat: integrate docs:update into build process

- Add docs:update script to run README automation
- Prepend docs:update to build command
- Ensures README is always up-to-date before builds
- Uses tsx to execute TypeScript directly"
```

---

## Task 6: Final Verification

**Files:**
- Test: All modified files
- Verify: README.md, schema descriptions, tool registration

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass including new schema description tests

**Step 2: Build the project**

Run: `pnpm build`
Expected:
- README.md updates automatically
- TypeScript compiles without errors
- dist/ directory contains compiled code

**Step 3: Verify README tool descriptions**

Run: `grep -A 2 "#### flux" README.md && grep -A 2 "#### scout" README.md`
Expected: Tool descriptions match schema descriptions exactly

**Step 4: Manually test MCP server**

Run: `node dist/index.js`
In another terminal: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js`
Expected: Tool list shows flux and scout with correct descriptions

**Step 5: Verify git status**

Run: `git status`
Expected: Working directory clean, all changes committed

**Step 6: Create final summary commit**

```bash
git add docs/plans/2025-12-30-schema-description-automation.md
git commit -m "docs: complete schema description automation plan

Implementation summary:
- Task 1: ✅ Added .describe() to FluxSchema and ScoutSchema with tests
- Task 2: ✅ Updated tool registration to extract descriptions from schemas
- Task 3: ✅ Added tsx dependency for script execution
- Task 4: ✅ Created automated README update script
- Task 5: ✅ Integrated script into build process
- Task 6: ✅ Final verification complete

Results:
- Single source of truth for tool descriptions
- README auto-updates on build
- All tests passing
- Zero manual documentation sync needed"
```

---

## Success Criteria

- ✅ FluxSchema has `.describe()` with Docker description
- ✅ ScoutSchema has `.describe()` with SSH description
- ✅ Tool registration uses `getSchemaDescription()`
- ✅ README.md tool descriptions auto-update
- ✅ Build process includes docs:update
- ✅ All tests pass
- ✅ No hardcoded descriptions in tool registration
- ✅ Scripts directory created with update-readme.ts
- ✅ tsx dependency added

## Testing Strategy

### Unit Tests
- Schema description existence and content
- Description extraction in tool registration
- Exact match between schema and registration descriptions

### Integration Tests
- README update script execution
- Build process includes documentation updates
- Manual MCP server tool listing verification

### Manual Verification
- README tool descriptions match schemas
- No documentation drift after changes
- Build succeeds with auto-update

## Rollback Plan

If issues arise, revert in reverse order:
1. Remove tsx dependency
2. Remove docs:update from build script
3. Delete scripts/update-readme.ts
4. Restore hardcoded descriptions in tool registration
5. Remove .describe() from schemas
6. Delete schema description tests
