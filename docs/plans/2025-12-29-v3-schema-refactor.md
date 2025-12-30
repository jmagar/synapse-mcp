# V3 Schema Refactor - Flux & Scout Tools

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace unified homelab tool with two specialized MCP tools (flux and scout) using discriminated unions with O(1) validation and auto-generated help system. Clean break - no backward compatibility.

**Architecture:** Flux uses composite discriminator (`action_subaction`), scout uses primary discriminator (`action`) with nested discriminators for `zfs` and `logs` actions. Both tools include auto-generated help handlers that introspect schema metadata.

**Tech Stack:** TypeScript 5.9+ (5.9.3 installed), Zod 3.24+ (3.25.76 installed, pinned for help system stability), MCP SDK 1.25.1+, Vitest 4.0+

**Changes from Current:**
- **DELETE** unified tool entirely (homelab)
- **DELETE** all unified schemas and handlers
- **CREATE** flux tool (Docker operations) - 39 subactions
- **CREATE** scout tool (SSH operations) - 11 actions
- Container: `unpause` → `resume`
- Docker: Add `networks`, `volumes` subactions
- Host: Expand 2 → 7 subactions (add `info`, `uptime`, `services`, `network`, `mounts`)
- Scout: Nested discriminators for `zfs` and `logs`
- Help: Auto-generated via schema introspection

**Validation Status:** ✅ ALL ISSUES FIXED
- ✅ TDD compliance restored (Task 12 deleted, Task 17 split into RED-GREEN-REFACTOR cycles)
- ✅ MCP SDK API corrected (addTool → registerTool)
- ✅ Preprocessor moved to common.ts to prevent deletion dependency
- ✅ Help handler unwraps preprocessed schemas correctly

---

## Phase 1: Common Schemas and Utilities

### Task 1: Create Common Schema Base with Preprocessor

**Files:**
- Create: `src/schemas/common.ts`
- Test: `src/schemas/common.test.ts`

**Step 1: Write failing test for common schemas**

```typescript
// src/schemas/common.test.ts
import { describe, it, expect } from 'vitest';
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  containerIdSchema,
  preprocessWithDiscriminator
} from './common.js';

describe('Common Schemas', () => {
  describe('responseFormatSchema', () => {
    it('should accept markdown', () => {
      const result = responseFormatSchema.parse('markdown');
      expect(result).toBe('markdown');
    });

    it('should accept json', () => {
      const result = responseFormatSchema.parse('json');
      expect(result).toBe('json');
    });

    it('should default to markdown', () => {
      const result = responseFormatSchema.parse(undefined);
      expect(result).toBe('markdown');
    });

    it('should reject invalid format', () => {
      expect(() => responseFormatSchema.parse('xml')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should validate with defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should validate custom values', () => {
      const result = paginationSchema.parse({ limit: 50, offset: 10 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it('should reject limit > 100', () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject negative offset', () => {
      expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
    });
  });

  describe('hostSchema', () => {
    it('should validate alphanumeric with dashes', () => {
      const result = hostSchema.parse('tootie-server');
      expect(result).toBe('tootie-server');
    });

    it('should reject invalid characters', () => {
      expect(() => hostSchema.parse('tootie.server')).toThrow();
    });
  });

  describe('containerIdSchema', () => {
    it('should validate non-empty string', () => {
      const result = containerIdSchema.parse('plex');
      expect(result).toBe('plex');
    });

    it('should reject empty string', () => {
      expect(() => containerIdSchema.parse('')).toThrow();
    });
  });

  describe('preprocessWithDiscriminator', () => {
    it('should inject action_subaction from action and subaction', () => {
      const result = preprocessWithDiscriminator({
        action: 'container',
        subaction: 'list'
      });
      expect(result).toEqual({
        action: 'container',
        subaction: 'list',
        action_subaction: 'container:list'
      });
    });

    it('should return unchanged if action or subaction missing', () => {
      const result = preprocessWithDiscriminator({ action: 'help' });
      expect(result).toEqual({ action: 'help' });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/common.test.ts`
Expected: FAIL with "Cannot find module './common.js'"

**Step 3: Write minimal implementation**

```typescript
// src/schemas/common.ts
import { z } from 'zod';
import { ResponseFormat } from '../types.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';

/**
 * Common schemas shared across Flux and Scout tools
 */

export const responseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' or 'json'");

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
    .describe('Maximum results to return'),
  offset: z.number().int().min(0).default(0)
    .describe('Number of results to skip for pagination')
});

export const hostSchema = z.string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Host must be alphanumeric with dashes/underscores')
  .describe('Target Docker host');

export const containerIdSchema = z.string()
  .min(1)
  .describe('Container name or ID');

export const projectSchema = z.string()
  .min(1)
  .describe('Docker Compose project name');

export const imageSchema = z.string()
  .min(1)
  .describe('Image name with optional tag');

/**
 * Preprocessor to inject composite discriminator key
 * Used by Flux tool to create action_subaction from action + subaction
 */
export function preprocessWithDiscriminator(data: any): any {
  if (data && typeof data === 'object' && data.action && data.subaction) {
    return { ...data, action_subaction: `${data.action}:${data.subaction}` };
  }
  return data;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/common.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/schemas/common.ts src/schemas/common.test.ts
git commit -m "feat(schemas): add common base schemas and discriminator preprocessor"
```

---

### Task 2: Create Help Handler Infrastructure

**Files:**
- Create: `src/utils/help.ts`
- Test: `src/utils/help.test.ts`

**Step 1: Write failing test for help handler**

```typescript
// src/utils/help.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from './help.js';

describe('Help Handler', () => {
  const testSchema = z.discriminatedUnion('action_subaction', [
    z.object({
      action_subaction: z.literal('test:echo'),
      action: z.literal('test'),
      subaction: z.literal('echo'),
      message: z.string().describe('Message to echo')
    }).describe('Echo a message'),
    z.object({
      action_subaction: z.literal('test:ping'),
      action: z.literal('test'),
      subaction: z.literal('ping'),
      host: z.string().describe('Target host')
    }).describe('Ping a host')
  ]);

  describe('generateHelp', () => {
    it('should generate help for all actions', () => {
      const help = generateHelp(testSchema);
      expect(help).toHaveLength(2);
      expect(help[0].discriminator).toBe('test:echo');
      expect(help[1].discriminator).toBe('test:ping');
    });

    it('should filter by topic', () => {
      const help = generateHelp(testSchema, 'test:echo');
      expect(help).toHaveLength(1);
      expect(help[0].discriminator).toBe('test:echo');
    });

    it('should return empty for unknown topic', () => {
      const help = generateHelp(testSchema, 'unknown');
      expect(help).toHaveLength(0);
    });

    it('should unwrap preprocessed schema', () => {
      const preprocessedSchema = z.preprocess(
        (data) => data,
        testSchema
      );
      const help = generateHelp(preprocessedSchema);
      expect(help).toHaveLength(2);
    });
  });

  describe('formatHelpMarkdown', () => {
    it('should format all actions as markdown', () => {
      const help = generateHelp(testSchema);
      const md = formatHelpMarkdown(help);
      expect(md).toContain('## test:echo');
      expect(md).toContain('## test:ping');
      expect(md).toContain('**message** (string)');
      expect(md).toContain('**host** (string)');
    });

    it('should format single action as markdown', () => {
      const help = generateHelp(testSchema, 'test:echo');
      const md = formatHelpMarkdown(help);
      expect(md).toContain('## test:echo');
      expect(md).not.toContain('test:ping');
    });
  });

  describe('formatHelpJson', () => {
    it('should format as valid JSON', () => {
      const help = generateHelp(testSchema);
      const json = formatHelpJson(help);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].action).toBe('test:echo');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/help.test.ts`
Expected: FAIL with "Cannot find module './help.js'"

**Step 3: Write minimal implementation**

```typescript
// src/utils/help.ts
import { z } from 'zod';

export interface HelpEntry {
  discriminator: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    required: boolean;
    default?: unknown;
  }>;
}

/**
 * Unwrap z.preprocess wrapper to access inner schema
 *
 * NOTE: This function accesses Zod internal implementation details (_def.innerType).
 * Zod version is pinned at 3.25.76 to ensure stability. When upgrading Zod:
 * 1. Run full test suite to verify unwrapSchema still works
 * 2. Check Zod changelog for changes to z.preprocess internals
 * 3. Update this function if internal structure changes
 */
function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  // Check if schema is wrapped in z.preprocess
  if ('_def' in schema && 'innerType' in schema._def) {
    return schema._def.innerType;
  }
  return schema;
}

/**
 * Generate help documentation from discriminated union schema
 *
 * Handles schemas wrapped in z.preprocess() by unwrapping to access
 * the inner discriminated union.
 */
export function generateHelp(
  schema: z.ZodTypeAny,
  topic?: string
): HelpEntry[] {
  // Unwrap z.preprocess if present
  const actualSchema = unwrapSchema(schema);

  // Access options from discriminated union
  const options = (actualSchema as any).options || (actualSchema as any)._def?.options;

  if (!options) {
    throw new Error('Schema is not a discriminated union');
  }

  const entries = options.map((option: z.ZodObject<any>) => {
    const shape = option.shape;
    const discriminatorKey = Object.keys(shape).find(
      key => shape[key] instanceof z.ZodLiteral
    );

    if (!discriminatorKey) {
      throw new Error('Schema missing discriminator');
    }

    const discriminatorValue = (shape[discriminatorKey] as z.ZodLiteral<string>)._def.value;

    const parameters = Object.entries(shape)
      .filter(([key]) => key !== discriminatorKey && !key.startsWith('action'))
      .map(([name, schema]) => {
        const zodSchema = schema as z.ZodTypeAny;
        return {
          name,
          type: zodSchema._def.typeName.replace('Zod', '').toLowerCase(),
          description: zodSchema.description,
          required: !zodSchema.isOptional(),
          default: zodSchema._def.defaultValue?.()
        };
      });

    return {
      discriminator: discriminatorValue,
      description: option.description || '',
      parameters
    };
  });

  if (topic) {
    return entries.filter(e => e.discriminator === topic);
  }

  return entries;
}

/**
 * Format help entries as markdown
 */
export function formatHelpMarkdown(entries: HelpEntry[]): string {
  if (entries.length === 0) {
    return 'No help available for the specified topic.';
  }

  return entries.map(entry => {
    let md = `## ${entry.discriminator}\n\n`;

    if (entry.description) {
      md += `${entry.description}\n\n`;
    }

    if (entry.parameters.length > 0) {
      md += '**Parameters:**\n\n';
      entry.parameters.forEach(param => {
        const required = param.required ? ' (required)' : ' (optional)';
        const defaultVal = param.default !== undefined ? `, default: ${param.default}` : '';
        md += `- **${param.name}** (${param.type}${required}${defaultVal})`;
        if (param.description) {
          md += ` - ${param.description}`;
        }
        md += '\n';
      });
    }

    return md;
  }).join('\n---\n\n');
}

/**
 * Format help entries as JSON
 */
export function formatHelpJson(entries: HelpEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/help.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/utils/help.ts src/utils/help.test.ts
git commit -m "feat(utils): add help handler with schema introspection and unwrapping"
```

---

## Phase 2: Flux Tool Schemas

### Task 3: Create Container Subaction Schemas

**Files:**
- Create: `src/schemas/flux/container.ts`
- Test: `src/schemas/flux/container.test.ts`

**Step 1: Write failing test for container schemas**

```typescript
// src/schemas/flux/container.test.ts
import { describe, it, expect } from 'vitest';
import {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema
} from './container.js';

describe('Container Schemas', () => {
  describe('containerListSchema', () => {
    it('should validate minimal input', () => {
      const result = containerListSchema.parse({
        action: 'container',
        subaction: 'list'
      });
      expect(result.action_subaction).toBe('container:list');
      expect(result.state).toBe('all');
      expect(result.limit).toBe(10);
    });

    it('should validate with filters', () => {
      const result = containerListSchema.parse({
        action: 'container',
        subaction: 'list',
        state: 'running',
        name_filter: 'plex',
        host: 'tootie'
      });
      expect(result.state).toBe('running');
      expect(result.name_filter).toBe('plex');
    });
  });

  describe('containerResumeSchema', () => {
    it('should use resume instead of unpause', () => {
      const result = containerResumeSchema.parse({
        action: 'container',
        subaction: 'resume',
        container_id: 'plex'
      });
      expect(result.action_subaction).toBe('container:resume');
      expect(result.subaction).toBe('resume');
    });
  });

  describe('containerLogsSchema', () => {
    it('should validate with time filters', () => {
      const result = containerLogsSchema.parse({
        action: 'container',
        subaction: 'logs',
        container_id: 'nginx',
        since: '1h',
        until: '30m',
        grep: 'error',
        stream: 'stderr'
      });
      expect(result.since).toBe('1h');
      expect(result.stream).toBe('stderr');
    });
  });

  describe('containerExecSchema', () => {
    it('should validate exec with workdir', () => {
      const result = containerExecSchema.parse({
        action: 'container',
        subaction: 'exec',
        container_id: 'app',
        command: 'ls -la',
        user: 'root',
        workdir: '/app'
      });
      expect(result.workdir).toBe('/app');
    });
  });

  describe('containerTopSchema', () => {
    it('should validate top command', () => {
      const result = containerTopSchema.parse({
        action: 'container',
        subaction: 'top',
        container_id: 'plex'
      });
      expect(result.action_subaction).toBe('container:top');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/flux/container.test.ts`
Expected: FAIL with "Cannot find module './container.js'"

**Step 3: Write minimal implementation**

```typescript
// src/schemas/flux/container.ts
import { z } from 'zod';
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  containerIdSchema
} from '../common.js';
import { DEFAULT_LOG_LINES, MAX_LOG_LINES } from '../../constants.js';

/**
 * Container subaction schemas for Flux tool (14 subactions)
 */

export const containerListSchema = z.object({
  action_subaction: z.literal('container:list'),
  action: z.literal('container'),
  subaction: z.literal('list'),
  host: hostSchema.optional(),
  state: z.enum(['running', 'exited', 'paused', 'restarting', 'all']).default('all'),
  name_filter: z.string().optional().describe('Partial match on container name'),
  image_filter: z.string().optional().describe('Partial match on image name'),
  label_filter: z.string().optional().describe('Key-value pairs in format key=value'),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('List containers with optional filtering');

export const containerStartSchema = z.object({
  action_subaction: z.literal('container:start'),
  action: z.literal('container'),
  subaction: z.literal('start'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Start a stopped container');

export const containerStopSchema = z.object({
  action_subaction: z.literal('container:stop'),
  action: z.literal('container'),
  subaction: z.literal('stop'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Stop a running container');

export const containerRestartSchema = z.object({
  action_subaction: z.literal('container:restart'),
  action: z.literal('container'),
  subaction: z.literal('restart'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Restart a container');

export const containerPauseSchema = z.object({
  action_subaction: z.literal('container:pause'),
  action: z.literal('container'),
  subaction: z.literal('pause'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Pause a running container');

export const containerResumeSchema = z.object({
  action_subaction: z.literal('container:resume'),
  action: z.literal('container'),
  subaction: z.literal('resume'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Resume a paused container');

export const containerLogsSchema = z.object({
  action_subaction: z.literal('container:logs'),
  action: z.literal('container'),
  subaction: z.literal('logs'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  since: z.string().optional().describe('ISO 8601 timestamp or relative time (e.g., "1h")'),
  until: z.string().optional().describe('ISO 8601 timestamp or relative time'),
  grep: z.string().optional().describe('Filter log lines containing this string'),
  stream: z.enum(['stdout', 'stderr', 'both']).default('both'),
  response_format: responseFormatSchema
}).describe('Get container logs with optional filtering');

export const containerStatsSchema = z.object({
  action_subaction: z.literal('container:stats'),
  action: z.literal('container'),
  subaction: z.literal('stats'),
  container_id: containerIdSchema.optional(),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get resource usage statistics');

export const containerInspectSchema = z.object({
  action_subaction: z.literal('container:inspect'),
  action: z.literal('container'),
  subaction: z.literal('inspect'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  summary: z.boolean().default(false).describe('true = basic info only, false = full details'),
  response_format: responseFormatSchema
}).describe('Get detailed container information');

export const containerSearchSchema = z.object({
  action_subaction: z.literal('container:search'),
  action: z.literal('container'),
  subaction: z.literal('search'),
  query: z.string().min(1).describe('Full-text search string'),
  host: hostSchema.optional(),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('Search containers by query string');

export const containerPullSchema = z.object({
  action_subaction: z.literal('container:pull'),
  action: z.literal('container'),
  subaction: z.literal('pull'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Pull latest image for a container');

export const containerRecreateSchema = z.object({
  action_subaction: z.literal('container:recreate'),
  action: z.literal('container'),
  subaction: z.literal('recreate'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  pull: z.boolean().default(true).describe('Pull latest image before recreate'),
  response_format: responseFormatSchema
}).describe('Recreate a container with optional image pull');

export const containerExecSchema = z.object({
  action_subaction: z.literal('container:exec'),
  action: z.literal('container'),
  subaction: z.literal('exec'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  command: z.string().min(1).describe('Shell command to execute'),
  user: z.string().optional().describe('Run as specific user'),
  workdir: z.string().optional().describe('Working directory for command execution'),
  response_format: responseFormatSchema
}).describe('Execute command inside a container');

export const containerTopSchema = z.object({
  action_subaction: z.literal('container:top'),
  action: z.literal('container'),
  subaction: z.literal('top'),
  container_id: containerIdSchema,
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Show running processes in a container');
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/flux/container.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/schemas/flux/container.ts src/schemas/flux/container.test.ts
git commit -m "feat(schemas): add container subaction schemas for Flux tool"
```

---

### Task 4: Create Compose Subaction Schemas

**Files:**
- Create: `src/schemas/flux/compose.ts`
- Test: `src/schemas/flux/compose.test.ts`

**Step 1: Write failing test**

```typescript
// src/schemas/flux/compose.test.ts
import { describe, it, expect } from 'vitest';
import {
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema
} from './compose.js';

describe('Compose Schemas', () => {
  describe('composeListSchema', () => {
    it('should require host', () => {
      expect(() => composeListSchema.parse({
        action: 'compose',
        subaction: 'list'
      })).toThrow();
    });

    it('should validate with host', () => {
      const result = composeListSchema.parse({
        action: 'compose',
        subaction: 'list',
        host: 'tootie'
      });
      expect(result.action_subaction).toBe('compose:list');
    });
  });

  describe('composeDownSchema', () => {
    it('should default remove_volumes to false', () => {
      const result = composeDownSchema.parse({
        action: 'compose',
        subaction: 'down',
        host: 'tootie',
        project: 'plex'
      });
      expect(result.remove_volumes).toBe(false);
    });
  });

  describe('composeBuildSchema', () => {
    it('should validate with no_cache option', () => {
      const result = composeBuildSchema.parse({
        action: 'compose',
        subaction: 'build',
        host: 'tootie',
        project: 'app',
        service: 'frontend',
        no_cache: true
      });
      expect(result.no_cache).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/flux/compose.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/schemas/flux/compose.ts
import { z } from 'zod';
import {
  responseFormatSchema,
  paginationSchema,
  hostSchema,
  projectSchema
} from '../common.js';
import { DEFAULT_LOG_LINES, MAX_LOG_LINES } from '../../constants.js';

/**
 * Compose subaction schemas for Flux tool (9 subactions)
 */

export const composeListSchema = z.object({
  action_subaction: z.literal('compose:list'),
  action: z.literal('compose'),
  subaction: z.literal('list'),
  host: hostSchema,
  name_filter: z.string().optional().describe('Partial match on project name'),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('List all Docker Compose projects');

export const composeStatusSchema = z.object({
  action_subaction: z.literal('compose:status'),
  action: z.literal('compose'),
  subaction: z.literal('status'),
  host: hostSchema,
  project: projectSchema,
  service_filter: z.string().optional().describe('Filter to specific service(s)'),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('Get Docker Compose project status');

export const composeUpSchema = z.object({
  action_subaction: z.literal('compose:up'),
  action: z.literal('compose'),
  subaction: z.literal('up'),
  host: hostSchema,
  project: projectSchema,
  detach: z.boolean().default(true).describe('Run in background'),
  response_format: responseFormatSchema
}).describe('Start a Docker Compose project');

export const composeDownSchema = z.object({
  action_subaction: z.literal('compose:down'),
  action: z.literal('compose'),
  subaction: z.literal('down'),
  host: hostSchema,
  project: projectSchema,
  remove_volumes: z.boolean().default(false).describe('Delete volumes (destructive!)'),
  response_format: responseFormatSchema
}).describe('Stop a Docker Compose project');

export const composeRestartSchema = z.object({
  action_subaction: z.literal('compose:restart'),
  action: z.literal('compose'),
  subaction: z.literal('restart'),
  host: hostSchema,
  project: projectSchema,
  response_format: responseFormatSchema
}).describe('Restart a Docker Compose project');

export const composeLogsSchema = z.object({
  action_subaction: z.literal('compose:logs'),
  action: z.literal('compose'),
  subaction: z.literal('logs'),
  host: hostSchema,
  project: projectSchema,
  service: z.string().optional().describe('Target specific service'),
  lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
  since: z.string().optional(),
  until: z.string().optional(),
  grep: z.string().optional(),
  response_format: responseFormatSchema
}).describe('Get Docker Compose project logs');

export const composeBuildSchema = z.object({
  action_subaction: z.literal('compose:build'),
  action: z.literal('compose'),
  subaction: z.literal('build'),
  host: hostSchema,
  project: projectSchema,
  service: z.string().optional().describe('Target specific service'),
  no_cache: z.boolean().default(false).describe('Rebuild from scratch'),
  response_format: responseFormatSchema
}).describe('Build Docker Compose project images');

export const composePullSchema = z.object({
  action_subaction: z.literal('compose:pull'),
  action: z.literal('compose'),
  subaction: z.literal('pull'),
  host: hostSchema,
  project: projectSchema,
  service: z.string().optional(),
  response_format: responseFormatSchema
}).describe('Pull Docker Compose project images');

export const composeRecreateSchema = z.object({
  action_subaction: z.literal('compose:recreate'),
  action: z.literal('compose'),
  subaction: z.literal('recreate'),
  host: hostSchema,
  project: projectSchema,
  service: z.string().optional(),
  response_format: responseFormatSchema
}).describe('Recreate Docker Compose project containers');
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/flux/compose.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/flux/compose.ts src/schemas/flux/compose.test.ts
git commit -m "feat(schemas): add compose subaction schemas for Flux tool"
```

---

### Task 5: Create Docker and Host Subaction Schemas

**Files:**
- Create: `src/schemas/flux/docker.ts`
- Create: `src/schemas/flux/host.ts`
- Test: `src/schemas/flux/docker.test.ts`
- Test: `src/schemas/flux/host.test.ts`

**Step 1: Write failing tests**

```typescript
// src/schemas/flux/docker.test.ts
import { describe, it, expect } from 'vitest';
import {
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  dockerImagesSchema,
  dockerPullSchema,
  dockerBuildSchema,
  dockerRmiSchema,
  dockerNetworksSchema,
  dockerVolumesSchema
} from './docker.js';

describe('Docker Schemas', () => {
  describe('dockerPruneSchema', () => {
    it('should validate prune targets', () => {
      const result = dockerPruneSchema.parse({
        action: 'docker',
        subaction: 'prune',
        host: 'tootie',
        prune_target: 'images',
        force: true
      });
      expect(result.prune_target).toBe('images');
      expect(result.force).toBe(true);
    });
  });

  describe('dockerNetworksSchema', () => {
    it('should validate networks listing', () => {
      const result = dockerNetworksSchema.parse({
        action: 'docker',
        subaction: 'networks',
        host: 'tootie'
      });
      expect(result.action_subaction).toBe('docker:networks');
    });
  });

  describe('dockerVolumesSchema', () => {
    it('should validate volumes listing', () => {
      const result = dockerVolumesSchema.parse({
        action: 'docker',
        subaction: 'volumes',
        host: 'tootie'
      });
      expect(result.action_subaction).toBe('docker:volumes');
    });
  });
});
```

```typescript
// src/schemas/flux/host.test.ts
import { describe, it, expect } from 'vitest';
import {
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema
} from './host.js';

describe('Host Schemas', () => {
  describe('hostInfoSchema', () => {
    it('should validate host info', () => {
      const result = hostInfoSchema.parse({
        action: 'host',
        subaction: 'info',
        host: 'tootie'
      });
      expect(result.action_subaction).toBe('host:info');
    });
  });

  describe('hostServicesSchema', () => {
    it('should validate with service filter', () => {
      const result = hostServicesSchema.parse({
        action: 'host',
        subaction: 'services',
        host: 'tootie',
        service: 'docker',
        state: 'running'
      });
      expect(result.service).toBe('docker');
      expect(result.state).toBe('running');
    });
  });

  describe('hostMountsSchema', () => {
    it('should validate mounts listing', () => {
      const result = hostMountsSchema.parse({
        action: 'host',
        subaction: 'mounts',
        host: 'tootie'
      });
      expect(result.action_subaction).toBe('host:mounts');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/schemas/flux/docker.test.ts src/schemas/flux/host.test.ts`
Expected: FAIL

**Step 3: Write implementations**

```typescript
// src/schemas/flux/docker.ts
import { z } from 'zod';
import { responseFormatSchema, paginationSchema, hostSchema, imageSchema } from '../common.js';

/**
 * Docker subaction schemas for Flux tool (9 subactions)
 */

export const dockerInfoSchema = z.object({
  action_subaction: z.literal('docker:info'),
  action: z.literal('docker'),
  subaction: z.literal('info'),
  host: hostSchema,
  response_format: responseFormatSchema
}).describe('Get Docker daemon information');

export const dockerDfSchema = z.object({
  action_subaction: z.literal('docker:df'),
  action: z.literal('docker'),
  subaction: z.literal('df'),
  host: hostSchema,
  response_format: responseFormatSchema
}).describe('Get Docker disk usage information');

export const dockerPruneSchema = z.object({
  action_subaction: z.literal('docker:prune'),
  action: z.literal('docker'),
  subaction: z.literal('prune'),
  host: hostSchema,
  prune_target: z.enum(['containers', 'images', 'volumes', 'networks', 'buildcache', 'all']),
  force: z.boolean().default(false),
  response_format: responseFormatSchema
}).describe('Remove unused Docker resources');

export const dockerImagesSchema = z.object({
  action_subaction: z.literal('docker:images'),
  action: z.literal('docker'),
  subaction: z.literal('images'),
  host: hostSchema.optional(),
  dangling_only: z.boolean().default(false).describe('Only show untagged images'),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('List Docker images');

export const dockerPullSchema = z.object({
  action_subaction: z.literal('docker:pull'),
  action: z.literal('docker'),
  subaction: z.literal('pull'),
  host: hostSchema,
  image: imageSchema,
  response_format: responseFormatSchema
}).describe('Pull a Docker image');

export const dockerBuildSchema = z.object({
  action_subaction: z.literal('docker:build'),
  action: z.literal('docker'),
  subaction: z.literal('build'),
  host: hostSchema,
  context: z.string().min(1).describe('Path to build context directory'),
  tag: z.string().min(1).describe('Image name:tag for the built image'),
  dockerfile: z.string().default('Dockerfile').describe('Path to Dockerfile'),
  no_cache: z.boolean().default(false),
  response_format: responseFormatSchema
}).describe('Build a Docker image');

export const dockerRmiSchema = z.object({
  action_subaction: z.literal('docker:rmi'),
  action: z.literal('docker'),
  subaction: z.literal('rmi'),
  host: hostSchema,
  image: imageSchema,
  force: z.boolean().default(false),
  response_format: responseFormatSchema
}).describe('Remove a Docker image');

export const dockerNetworksSchema = z.object({
  action_subaction: z.literal('docker:networks'),
  action: z.literal('docker'),
  subaction: z.literal('networks'),
  host: hostSchema.optional(),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('List Docker networks');

export const dockerVolumesSchema = z.object({
  action_subaction: z.literal('docker:volumes'),
  action: z.literal('docker'),
  subaction: z.literal('volumes'),
  host: hostSchema.optional(),
  ...paginationSchema.shape,
  response_format: responseFormatSchema
}).describe('List Docker volumes');
```

```typescript
// src/schemas/flux/host.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema } from '../common.js';

/**
 * Host subaction schemas for Flux tool (7 subactions)
 */

export const hostStatusSchema = z.object({
  action_subaction: z.literal('host:status'),
  action: z.literal('host'),
  subaction: z.literal('status'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Check Docker connectivity to host');

export const hostResourcesSchema = z.object({
  action_subaction: z.literal('host:resources'),
  action: z.literal('host'),
  subaction: z.literal('resources'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get CPU, memory, and disk usage via SSH');

export const hostInfoSchema = z.object({
  action_subaction: z.literal('host:info'),
  action: z.literal('host'),
  subaction: z.literal('info'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get OS, kernel, architecture, and hostname information');

export const hostUptimeSchema = z.object({
  action_subaction: z.literal('host:uptime'),
  action: z.literal('host'),
  subaction: z.literal('uptime'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get system uptime');

export const hostServicesSchema = z.object({
  action_subaction: z.literal('host:services'),
  action: z.literal('host'),
  subaction: z.literal('services'),
  host: hostSchema.optional(),
  service: z.string().optional().describe('Specific systemd service name'),
  state: z.enum(['running', 'stopped', 'failed', 'all']).default('all'),
  response_format: responseFormatSchema
}).describe('Get systemd service status');

export const hostNetworkSchema = z.object({
  action_subaction: z.literal('host:network'),
  action: z.literal('host'),
  subaction: z.literal('network'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get network interfaces and IP addresses');

export const hostMountsSchema = z.object({
  action_subaction: z.literal('host:mounts'),
  action: z.literal('host'),
  subaction: z.literal('mounts'),
  host: hostSchema.optional(),
  response_format: responseFormatSchema
}).describe('Get mounted filesystems');
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/schemas/flux/docker.test.ts src/schemas/flux/host.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/flux/docker.ts src/schemas/flux/host.ts src/schemas/flux/docker.test.ts src/schemas/flux/host.test.ts
git commit -m "feat(schemas): add docker and host subaction schemas for Flux tool"
```

---

### Task 6: Create Flux Discriminated Union Schema

**Files:**
- Create: `src/schemas/flux/index.ts`
- Test: `src/schemas/flux/index.test.ts`

**Step 1: Write failing test**

```typescript
// src/schemas/flux/index.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema } from './index.js';

describe('FluxSchema', () => {
  it('should validate container:list', () => {
    const result = FluxSchema.parse({
      action: 'container',
      subaction: 'list'
    });
    expect(result.action_subaction).toBe('container:list');
  });

  it('should validate container:resume', () => {
    const result = FluxSchema.parse({
      action: 'container',
      subaction: 'resume',
      container_id: 'plex'
    });
    expect(result.action_subaction).toBe('container:resume');
  });

  it('should validate docker:networks', () => {
    const result = FluxSchema.parse({
      action: 'docker',
      subaction: 'networks',
      host: 'tootie'
    });
    expect(result.action_subaction).toBe('docker:networks');
  });

  it('should validate host:services', () => {
    const result = FluxSchema.parse({
      action: 'host',
      subaction: 'services',
      host: 'tootie',
      service: 'docker'
    });
    expect(result.action_subaction).toBe('host:services');
  });

  it('should reject invalid action', () => {
    expect(() => FluxSchema.parse({
      action: 'invalid',
      subaction: 'list'
    })).toThrow();
  });

  it('should reject unpause (replaced by resume)', () => {
    expect(() => FluxSchema.parse({
      action: 'container',
      subaction: 'unpause',
      container_id: 'plex'
    })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/flux/index.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/schemas/flux/index.ts
import { z } from 'zod';
import { preprocessWithDiscriminator } from '../common.js';
import {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema
} from './container.js';
import {
  composeListSchema,
  composeStatusSchema,
  composeUpSchema,
  composeDownSchema,
  composeRestartSchema,
  composeLogsSchema,
  composeBuildSchema,
  composePullSchema,
  composeRecreateSchema
} from './compose.js';
import {
  dockerInfoSchema,
  dockerDfSchema,
  dockerPruneSchema,
  dockerImagesSchema,
  dockerPullSchema,
  dockerBuildSchema,
  dockerRmiSchema,
  dockerNetworksSchema,
  dockerVolumesSchema
} from './docker.js';
import {
  hostStatusSchema,
  hostResourcesSchema,
  hostInfoSchema,
  hostUptimeSchema,
  hostServicesSchema,
  hostNetworkSchema,
  hostMountsSchema
} from './host.js';

/**
 * Flux Tool Schema - Docker infrastructure management
 *
 * Actions: 4 (container, compose, docker, host)
 * Subactions: 39 total
 *   - container: 14 (list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top)
 *   - compose: 9 (list, status, up, down, restart, logs, build, pull, recreate)
 *   - docker: 9 (info, df, prune, images, pull, build, rmi, networks, volumes)
 *   - host: 7 (status, resources, info, uptime, services, network, mounts)
 *
 * Uses composite discriminator: action_subaction (e.g., "container:list")
 * Injected automatically via preprocessor for backward compatibility
 */
export const FluxSchema = z.preprocess(
  preprocessWithDiscriminator,
  z.discriminatedUnion('action_subaction', [
    // Container (14)
    containerListSchema,
    containerStartSchema,
    containerStopSchema,
    containerRestartSchema,
    containerPauseSchema,
    containerResumeSchema,
    containerLogsSchema,
    containerStatsSchema,
    containerInspectSchema,
    containerSearchSchema,
    containerPullSchema,
    containerRecreateSchema,
    containerExecSchema,
    containerTopSchema,

    // Compose (9)
    composeListSchema,
    composeStatusSchema,
    composeUpSchema,
    composeDownSchema,
    composeRestartSchema,
    composeLogsSchema,
    composeBuildSchema,
    composePullSchema,
    composeRecreateSchema,

    // Docker (9)
    dockerInfoSchema,
    dockerDfSchema,
    dockerPruneSchema,
    dockerImagesSchema,
    dockerPullSchema,
    dockerBuildSchema,
    dockerRmiSchema,
    dockerNetworksSchema,
    dockerVolumesSchema,

    // Host (7)
    hostStatusSchema,
    hostResourcesSchema,
    hostInfoSchema,
    hostUptimeSchema,
    hostServicesSchema,
    hostNetworkSchema,
    hostMountsSchema
  ])
);

export type FluxInput = z.infer<typeof FluxSchema>;

// Re-export all schemas
export * from './container.js';
export * from './compose.js';
export * from './docker.js';
export * from './host.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/flux/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/flux/index.ts src/schemas/flux/index.test.ts
git commit -m "feat(schemas): create Flux discriminated union with 39 subactions"
```

---

## Phase 3: Scout Tool Schemas

### Task 7: Create Scout Simple Action Schemas

**Files:**
- Create: `src/schemas/scout/simple.ts`
- Test: `src/schemas/scout/simple.test.ts`

**Step 1: Write failing test**

```typescript
// src/schemas/scout/simple.test.ts
import { describe, it, expect } from 'vitest';
import {
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema
} from './simple.js';

describe('Scout Simple Schemas', () => {
  describe('scoutNodesSchema', () => {
    it('should validate nodes action', () => {
      const result = scoutNodesSchema.parse({ action: 'nodes' });
      expect(result.action).toBe('nodes');
    });
  });

  describe('scoutPeekSchema', () => {
    it('should validate target format', () => {
      const result = scoutPeekSchema.parse({
        action: 'peek',
        target: 'tootie:/etc/nginx/nginx.conf'
      });
      expect(result.target).toBe('tootie:/etc/nginx/nginx.conf');
    });

    it('should reject invalid target format', () => {
      expect(() => scoutPeekSchema.parse({
        action: 'peek',
        target: 'invalid'
      })).toThrow();
    });
  });

  describe('scoutExecSchema', () => {
    it('should validate exec with timeout', () => {
      const result = scoutExecSchema.parse({
        action: 'exec',
        target: 'tootie:/app',
        command: 'ls -la',
        timeout: 60
      });
      expect(result.timeout).toBe(60);
    });
  });

  describe('scoutDeltaSchema', () => {
    it('should validate with target file', () => {
      const result = scoutDeltaSchema.parse({
        action: 'delta',
        source: 'host1:/etc/hosts',
        target: 'host2:/etc/hosts'
      });
      expect(result.source).toBe('host1:/etc/hosts');
    });

    it('should validate with content string', () => {
      const result = scoutDeltaSchema.parse({
        action: 'delta',
        source: 'tootie:/etc/hosts',
        content: '127.0.0.1 localhost'
      });
      expect(result.content).toBe('127.0.0.1 localhost');
    });
  });

  describe('scoutPsSchema', () => {
    it('should validate process listing', () => {
      const result = scoutPsSchema.parse({
        action: 'ps',
        host: 'tootie',
        grep: 'nginx',
        sort: 'mem',
        limit: 20
      });
      expect(result.sort).toBe('mem');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/scout/simple.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/schemas/scout/simple.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema } from '../common.js';
import {
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT
} from '../../constants.js';

/**
 * Scout simple action schemas (9 actions without subactions)
 */

const scoutTargetSchema = z.string()
  .min(3)
  .regex(/^[a-zA-Z0-9_-]+:\/.*$/, "Must be 'hostname:/path' format")
  .describe('Remote location in hostname:/path format');

export const scoutNodesSchema = z.object({
  action: z.literal('nodes'),
  response_format: responseFormatSchema
}).describe('List all configured SSH hosts');

export const scoutPeekSchema = z.object({
  action: z.literal('peek'),
  target: scoutTargetSchema,
  tree: z.boolean().default(false).describe('Show directory tree'),
  depth: z.number().min(1).max(MAX_TREE_DEPTH).default(DEFAULT_TREE_DEPTH),
  response_format: responseFormatSchema
}).describe('Read file or directory contents on a remote host');

export const scoutExecSchema = z.object({
  action: z.literal('exec'),
  target: scoutTargetSchema.describe('Working directory for command'),
  command: z.string().min(1).describe('Shell command to execute'),
  timeout: z.number().int().min(1).max(MAX_COMMAND_TIMEOUT).default(DEFAULT_COMMAND_TIMEOUT),
  response_format: responseFormatSchema
}).describe('Execute command on a remote host');

export const scoutFindSchema = z.object({
  action: z.literal('find'),
  target: scoutTargetSchema.describe('Search root directory'),
  pattern: z.string().min(1).describe('Glob pattern for file matching'),
  depth: z.number().min(1).max(MAX_TREE_DEPTH).default(DEFAULT_TREE_DEPTH),
  response_format: responseFormatSchema
}).describe('Find files by glob pattern on a remote host');

export const scoutDeltaSchema = z.object({
  action: z.literal('delta'),
  source: z.string().min(1).describe('File source - local path or remote hostname:/path'),
  target: z.string().optional().describe('File destination for comparison'),
  content: z.string().optional().describe('String content for comparison'),
  response_format: responseFormatSchema
}).describe('Compare files or content between locations');

export const scoutEmitSchema = z.object({
  action: z.literal('emit'),
  targets: z.array(scoutTargetSchema).min(1).describe('Array of remote locations'),
  command: z.string().optional().describe('Shell command to execute on all targets'),
  response_format: responseFormatSchema
}).describe('Multi-host operations');

export const scoutBeamSchema = z.object({
  action: z.literal('beam'),
  source: z.string().min(1).describe('File source - local path or remote hostname:/path'),
  destination: z.string().min(1).describe('File destination - local path or remote hostname:/path'),
  response_format: responseFormatSchema
}).describe('File transfer between local and remote hosts');

export const scoutPsSchema = z.object({
  action: z.literal('ps'),
  host: hostSchema,
  grep: z.string().optional().describe('Filter output containing this string'),
  user: z.string().optional().describe('Filter processes by username'),
  sort: z.enum(['cpu', 'mem', 'pid', 'time']).default('cpu'),
  limit: z.number().int().min(1).max(1000).default(50),
  response_format: responseFormatSchema
}).describe('List and search processes on a remote host');

export const scoutDfSchema = z.object({
  action: z.literal('df'),
  host: hostSchema,
  path: z.string().optional().describe('Specific filesystem path or mount point'),
  human_readable: z.boolean().default(true),
  response_format: responseFormatSchema
}).describe('Disk usage information for a remote host');
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/scout/simple.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/scout/simple.ts src/schemas/scout/simple.test.ts
git commit -m "feat(schemas): add scout simple action schemas"
```

---

### Task 8: Create Scout Nested Discriminator Schemas (ZFS and Logs)

**Files:**
- Create: `src/schemas/scout/zfs.ts`
- Create: `src/schemas/scout/logs.ts`
- Test: `src/schemas/scout/zfs.test.ts`
- Test: `src/schemas/scout/logs.test.ts`

**Step 1: Write failing tests**

```typescript
// src/schemas/scout/zfs.test.ts
import { describe, it, expect } from 'vitest';
import { scoutZfsSchema } from './zfs.js';

describe('Scout ZFS Schema', () => {
  it('should validate pools subaction', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'pools',
      host: 'dookie'
    });
    expect(result.subaction).toBe('pools');
  });

  it('should validate datasets with recursive', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'datasets',
      host: 'dookie',
      pool: 'tank',
      recursive: true
    });
    expect(result.recursive).toBe(true);
  });

  it('should validate snapshots with limit', () => {
    const result = scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'snapshots',
      host: 'dookie',
      pool: 'tank',
      limit: 50
    });
    expect(result.limit).toBe(50);
  });

  it('should reject invalid subaction', () => {
    expect(() => scoutZfsSchema.parse({
      action: 'zfs',
      subaction: 'invalid',
      host: 'dookie'
    })).toThrow();
  });
});
```

```typescript
// src/schemas/scout/logs.test.ts
import { describe, it, expect } from 'vitest';
import { scoutLogsSchema } from './logs.js';

describe('Scout Logs Schema', () => {
  it('should validate syslog subaction', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'syslog',
      host: 'tootie',
      lines: 50
    });
    expect(result.subaction).toBe('syslog');
  });

  it('should validate journal with unit filter', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'journal',
      host: 'tootie',
      unit: 'docker.service',
      priority: 'err',
      since: '1h'
    });
    expect(result.unit).toBe('docker.service');
    expect(result.priority).toBe('err');
  });

  it('should validate dmesg', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'dmesg',
      host: 'tootie',
      grep: 'USB'
    });
    expect(result.grep).toBe('USB');
  });

  it('should validate auth logs', () => {
    const result = scoutLogsSchema.parse({
      action: 'logs',
      subaction: 'auth',
      host: 'tootie',
      lines: 200
    });
    expect(result.lines).toBe(200);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/schemas/scout/zfs.test.ts src/schemas/scout/logs.test.ts`
Expected: FAIL

**Step 3: Write implementations**

```typescript
// src/schemas/scout/zfs.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema } from '../common.js';

/**
 * Scout ZFS nested discriminator (3 subactions)
 */
export const scoutZfsSchema = z.discriminatedUnion('subaction', [
  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('pools'),
    host: hostSchema,
    pool: z.string().optional().describe('Pool name filter'),
    health: z.enum(['online', 'degraded', 'faulted']).optional(),
    response_format: responseFormatSchema
  }).describe('List ZFS storage pools'),

  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('datasets'),
    host: hostSchema,
    pool: z.string().optional().describe('Pool name filter'),
    type: z.enum(['filesystem', 'volume']).optional(),
    recursive: z.boolean().default(false).describe('Include child datasets'),
    response_format: responseFormatSchema
  }).describe('List ZFS datasets'),

  z.object({
    action: z.literal('zfs'),
    subaction: z.literal('snapshots'),
    host: hostSchema,
    pool: z.string().optional(),
    dataset: z.string().optional().describe('Filter to specific dataset'),
    limit: z.number().int().min(1).max(1000).optional(),
    response_format: responseFormatSchema
  }).describe('List ZFS snapshots')
]);
```

```typescript
// src/schemas/scout/logs.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema } from '../common.js';
import { DEFAULT_LOG_LINES, MAX_LOG_LINES } from '../../constants.js';

/**
 * Scout logs nested discriminator (4 subactions)
 */
export const scoutLogsSchema = z.discriminatedUnion('subaction', [
  z.object({
    action: z.literal('logs'),
    subaction: z.literal('syslog'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: z.string().optional(),
    response_format: responseFormatSchema
  }).describe('Access system log files (/var/log)'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('journal'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    since: z.string().optional().describe('ISO 8601 timestamp or relative time'),
    until: z.string().optional(),
    unit: z.string().optional().describe('Systemd unit name to filter'),
    priority: z.enum(['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']).optional(),
    grep: z.string().optional(),
    response_format: responseFormatSchema
  }).describe('Access systemd journal logs'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('dmesg'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: z.string().optional(),
    response_format: responseFormatSchema
  }).describe('Access kernel ring buffer logs'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('auth'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: z.string().optional(),
    response_format: responseFormatSchema
  }).describe('Access authentication logs')
]);
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/schemas/scout/zfs.test.ts src/schemas/scout/logs.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/scout/zfs.ts src/schemas/scout/logs.ts src/schemas/scout/zfs.test.ts src/schemas/scout/logs.test.ts
git commit -m "feat(schemas): add scout nested discriminators for zfs and logs"
```

---

### Task 9: Create Scout Discriminated Union Schema

**Files:**
- Create: `src/schemas/scout/index.ts`
- Test: `src/schemas/scout/index.test.ts`

**Step 1: Write failing test**

```typescript
// src/schemas/scout/index.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutSchema } from './index.js';

describe('ScoutSchema', () => {
  it('should validate nodes action', () => {
    const result = ScoutSchema.parse({ action: 'nodes' });
    expect(result.action).toBe('nodes');
  });

  it('should validate peek action', () => {
    const result = ScoutSchema.parse({
      action: 'peek',
      target: 'tootie:/etc/hosts'
    });
    expect(result.target).toBe('tootie:/etc/hosts');
  });

  it('should validate zfs:pools', () => {
    const result = ScoutSchema.parse({
      action: 'zfs',
      subaction: 'pools',
      host: 'dookie'
    });
    expect(result.subaction).toBe('pools');
  });

  it('should validate logs:journal', () => {
    const result = ScoutSchema.parse({
      action: 'logs',
      subaction: 'journal',
      host: 'tootie',
      unit: 'docker.service'
    });
    expect(result.subaction).toBe('journal');
  });

  it('should reject invalid action', () => {
    expect(() => ScoutSchema.parse({
      action: 'invalid'
    })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/schemas/scout/index.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/schemas/scout/index.ts
import { z } from 'zod';
import {
  scoutNodesSchema,
  scoutPeekSchema,
  scoutExecSchema,
  scoutFindSchema,
  scoutDeltaSchema,
  scoutEmitSchema,
  scoutBeamSchema,
  scoutPsSchema,
  scoutDfSchema
} from './simple.js';
import { scoutZfsSchema } from './zfs.js';
import { scoutLogsSchema } from './logs.js';

/**
 * Scout Tool Schema - SSH remote operations
 *
 * Actions: 11 total
 *   Simple: 9 (nodes, peek, exec, find, delta, emit, beam, ps, df)
 *   Nested: 2 with subactions
 *     - zfs: 3 subactions (pools, datasets, snapshots)
 *     - logs: 4 subactions (syslog, journal, dmesg, auth)
 *
 * Uses primary discriminator: action
 * Nested discriminators for zfs and logs actions
 */
export const ScoutSchema = z.discriminatedUnion('action', [
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

  // Nested discriminators (2)
  scoutZfsSchema,
  scoutLogsSchema
]);

export type ScoutInput = z.infer<typeof ScoutSchema>;

// Re-export all schemas
export * from './simple.js';
export * from './zfs.js';
export * from './logs.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/scout/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas/scout/index.ts src/schemas/scout/index.test.ts
git commit -m "feat(schemas): create Scout discriminated union with 11 actions"
```

---

## Phase 4: Tool Handlers

### Task 10: Create Flux Tool Handler with Help

**Files:**
- Create: `src/tools/flux.ts`
- Test: `src/tools/flux.test.ts`

**Step 1: Write failing test**

```typescript
// src/tools/flux.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleFluxTool } from './flux.js';
import type { ServiceContainer } from '../services/container.js';

describe('Flux Tool Handler', () => {
  const mockContainer = {
    getDockerService: vi.fn(),
    getSSHService: vi.fn(),
    getComposeService: vi.fn(),
    getFileService: vi.fn()
  } as unknown as ServiceContainer;

  it('should handle help action', async () => {
    const result = await handleFluxTool(
      { action: 'help' },
      mockContainer
    );
    expect(result).toContain('container:list');
    expect(result).toContain('docker:networks');
    expect(result).toContain('host:services');
  });

  it('should handle help with topic', async () => {
    const result = await handleFluxTool(
      { action: 'help', topic: 'container:resume' },
      mockContainer
    );
    expect(result).toContain('container:resume');
    expect(result).not.toContain('container:pause');
  });

  it('should handle help with json format', async () => {
    const result = await handleFluxTool(
      { action: 'help', format: 'json' },
      mockContainer
    );
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('should route container:list', async () => {
    const dockerService = {
      listContainers: vi.fn().mockResolvedValue([])
    };
    mockContainer.getDockerService = vi.fn().mockReturnValue(dockerService);

    await handleFluxTool(
      { action: 'container', subaction: 'list' },
      mockContainer
    );

    expect(dockerService.listContainers).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/flux.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tools/flux.ts
import { FluxSchema, type FluxInput } from '../schemas/flux/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';
import { handleContainerAction } from './handlers/container.js';
import { handleComposeAction } from './handlers/compose.js';
import { handleDockerAction } from './handlers/docker.js';
import { handleHostAction } from './handlers/host.js';

interface HelpInput {
  action: 'help';
  topic?: string;
  format?: 'markdown' | 'json';
}

/**
 * Flux tool handler with auto-generated help system
 */
export async function handleFluxTool(
  input: unknown,
  container: ServiceContainer
): Promise<string> {
  // Handle help action before validation
  if (typeof input === 'object' && input !== null && 'action' in input && input.action === 'help') {
    const helpInput = input as HelpInput;
    const help = generateHelp(FluxSchema, helpInput.topic);

    if (helpInput.format === 'json') {
      return formatHelpJson(help);
    }
    return formatHelpMarkdown(help);
  }

  // Validate input
  const validatedInput = FluxSchema.parse(input) as FluxInput;

  // Route to appropriate handler based on action
  switch (validatedInput.action) {
    case 'container':
      return handleContainerAction(validatedInput, container);
    case 'compose':
      return handleComposeAction(validatedInput, container);
    case 'docker':
      return handleDockerAction(validatedInput, container);
    case 'host':
      return handleHostAction(validatedInput, container);
    default:
      throw new Error(`Unknown action: ${(validatedInput as any).action}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/flux.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/flux.ts src/tools/flux.test.ts
git commit -m "feat(tools): add flux tool handler with auto-generated help"
```

---

### Task 11: Create Scout Tool Handler with Help

**Files:**
- Create: `src/tools/scout.ts`
- Test: `src/tools/scout.test.ts`

**Step 1: Write failing test**

```typescript
// src/tools/scout.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleScoutTool } from './scout.js';
import type { ServiceContainer } from '../services/container.js';

describe('Scout Tool Handler', () => {
  const mockContainer = {
    getSSHService: vi.fn(),
    getFileService: vi.fn()
  } as unknown as ServiceContainer;

  it('should handle help action', async () => {
    const result = await handleScoutTool(
      { action: 'help' },
      mockContainer
    );
    expect(result).toContain('nodes');
    expect(result).toContain('zfs');
    expect(result).toContain('logs');
  });

  it('should handle help with topic zfs:pools', async () => {
    const result = await handleScoutTool(
      { action: 'help', topic: 'zfs:pools' },
      mockContainer
    );
    expect(result).toContain('zfs');
    expect(result).toContain('pools');
  });

  it('should route nodes action', async () => {
    const sshService = {
      getConfiguredHosts: vi.fn().mockReturnValue(['tootie', 'dookie'])
    };
    mockContainer.getSSHService = vi.fn().mockReturnValue(sshService);

    const result = await handleScoutTool(
      { action: 'nodes' },
      mockContainer
    );

    expect(sshService.getConfiguredHosts).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/scout.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tools/scout.ts
import { ScoutSchema, type ScoutInput } from '../schemas/scout/index.js';
import { generateHelp, formatHelpMarkdown, formatHelpJson } from '../utils/help.js';
import type { ServiceContainer } from '../services/container.js';
import {
  handleNodesAction,
  handlePeekAction,
  handleExecAction,
  handleFindAction,
  handleDeltaAction,
  handleEmitAction,
  handleBeamAction,
  handlePsAction,
  handleDfAction
} from './handlers/scout-simple.js';
import { handleZfsAction } from './handlers/scout-zfs.js';
import { handleLogsAction } from './handlers/scout-logs.js';

interface HelpInput {
  action: 'help';
  topic?: string;
  format?: 'markdown' | 'json';
}

/**
 * Scout tool handler with auto-generated help system
 */
export async function handleScoutTool(
  input: unknown,
  container: ServiceContainer
): Promise<string> {
  // Handle help action before validation
  if (typeof input === 'object' && input !== null && 'action' in input && input.action === 'help') {
    const helpInput = input as HelpInput;
    const help = generateHelp(ScoutSchema, helpInput.topic);

    if (helpInput.format === 'json') {
      return formatHelpJson(help);
    }
    return formatHelpMarkdown(help);
  }

  // Validate input
  const validatedInput = ScoutSchema.parse(input) as ScoutInput;

  // Route to appropriate handler based on action
  switch (validatedInput.action) {
    case 'nodes':
      return handleNodesAction(validatedInput, container);
    case 'peek':
      return handlePeekAction(validatedInput, container);
    case 'exec':
      return handleExecAction(validatedInput, container);
    case 'find':
      return handleFindAction(validatedInput, container);
    case 'delta':
      return handleDeltaAction(validatedInput, container);
    case 'emit':
      return handleEmitAction(validatedInput, container);
    case 'beam':
      return handleBeamAction(validatedInput, container);
    case 'ps':
      return handlePsAction(validatedInput, container);
    case 'df':
      return handleDfAction(validatedInput, container);
    case 'zfs':
      return handleZfsAction(validatedInput, container);
    case 'logs':
      return handleLogsAction(validatedInput, container);
    default:
      throw new Error(`Unknown action: ${(validatedInput as any).action}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/scout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/scout.ts src/tools/scout.test.ts
git commit -m "feat(tools): add scout tool handler with auto-generated help"
```

---

## Phase 5: Tool Registration and Integration

### Task 12: Register Flux and Scout Tools

**Files:**
- Modify: `src/tools/index.ts`
- Test: `src/tools/index.test.ts`

**Step 1: Write failing test**

```typescript
// src/tools/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { registerTools } from './index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '../services/container.js';

describe('Tool Registration', () => {
  it('should register flux and scout tools', () => {
    const server = {
      registerTool: vi.fn()
    } as unknown as McpServer;

    const container = {} as ServiceContainer;

    registerTools(server, container);

    // Verify registerTool was called (not addTool)
    expect(server.registerTool).toHaveBeenCalledTimes(2);

    // Check first call (flux)
    const fluxCall = (server.registerTool as any).mock.calls[0];
    expect(fluxCall[0]).toBe('flux');
    expect(fluxCall[1]).toMatchObject({
      title: 'Flux Tool',
      description: expect.stringContaining('Docker'),
      inputSchema: expect.any(Object)
    });

    // Check second call (scout)
    const scoutCall = (server.registerTool as any).mock.calls[1];
    expect(scoutCall[0]).toBe('scout');
    expect(scoutCall[1]).toMatchObject({
      title: 'Scout Tool',
      description: expect.stringContaining('SSH'),
      inputSchema: expect.any(Object)
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/tools/index.test.ts`
Expected: FAIL

**Step 3: Update tool registration**

```typescript
// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContainer } from "../services/container.js";
import { handleFluxTool } from './flux.js';
import { handleScoutTool } from './scout.js';
import { FluxSchema } from '../schemas/flux/index.js';
import { ScoutSchema } from '../schemas/scout/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Register Flux and Scout tools with the MCP server
 */
export function registerTools(server: McpServer, container?: ServiceContainer): void {
  if (!container) {
    throw new Error("ServiceContainer is required for tool registration");
  }

  // Register Flux tool using MCP SDK 1.25.1 API
  server.registerTool(
    'flux',
    {
      title: 'Flux Tool',
      description: 'Docker infrastructure management (read/write operations)',
      inputSchema: zodToJsonSchema(FluxSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      const result = await handleFluxTool(params, container);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // Register Scout tool using MCP SDK 1.25.1 API
  server.registerTool(
    'scout',
    {
      title: 'Scout Tool',
      description: 'SSH remote operations (read-mostly)',
      inputSchema: zodToJsonSchema(ScoutSchema),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: unknown) => {
      const result = await handleScoutTool(params, container);
      return { content: [{ type: 'text', text: result }] };
    }
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/index.ts src/tools/index.test.ts
git commit -m "feat(tools): register flux and scout tools with MCP SDK 1.25.1"
```

---

## Phase 6: Delete Unified Tool

### Task 13: Remove Unified Tool and Old Schemas

**Files:**
- Delete: `src/tools/unified.ts`
- Delete: `src/tools/unified.test.ts`
- Delete: `src/tools/unified.integration.test.ts`
- Delete: `src/schemas/unified.ts`
- Delete: `src/schemas/unified.test.ts`
- Delete: `src/schemas/unified.bench.test.ts`
- Modify: `src/schemas/index.ts`

**Step 1: Delete unified tool files**

```bash
git rm src/tools/unified.ts src/tools/unified.test.ts src/tools/unified.integration.test.ts
```

**Step 2: Delete old schema files**

```bash
git rm src/schemas/unified.ts src/schemas/unified.test.ts src/schemas/unified.bench.test.ts
```

**Step 3: Run tests to verify deletions**

Run: `pnpm test`
Expected: Some tests may fail temporarily due to unified schema deletions. This is acceptable - schema index will be updated in Phase 7 after all handlers are integrated.

**Note:** The `src/schemas/index.ts` export update is intentionally deferred to Phase 7 (after Task 12) to avoid TypeScript errors during the transition period. The old unified exports remain until flux/scout handlers are fully integrated.

**Step 4: Commit**

```bash
git add -A  # Stage deletions
git commit -m "refactor: delete unified tool and old schemas for V3"
```

---

## Phase 7: Documentation and Completion

### Task 14: Update Schema Exports and Documentation

**Files:**
- Modify: `src/schemas/index.ts`
- Modify: `README.md`
- Create: `docs/ARCHITECTURE.md`

**Step 1: Update schema exports**

```typescript
// src/schemas/index.ts
/**
 * Schema exports for homelab MCP server V3
 */
export * from "./common.js";
export * from "./flux/index.js";
export * from "./scout/index.js";
```

**Step 2: Update README with new tools**

```markdown
<!-- README.md - Tools section -->
## Available Tools

### flux

Docker infrastructure management with 39 operations across 4 action types:

**container (14 operations)**
- list, start, stop, restart, pause, resume, logs, stats, inspect, search, pull, recreate, exec, top

**compose (9 operations)**
- list, status, up, down, restart, logs, build, pull, recreate

**docker (9 operations)**
- info, df, prune, images, pull, build, rmi, networks, volumes

**host (7 operations)**
- status, resources, info, uptime, services, network, mounts

### scout

SSH remote operations with 11 actions:

**Simple actions (9)**
- nodes, peek, exec, find, delta, emit, beam, ps, df

**Nested actions (2)**
- zfs: pools, datasets, snapshots (3 subactions)
- logs: syslog, journal, dmesg, auth (4 subactions)

### Getting Help

Both tools include auto-generated help:

```json
{ "action": "help" }
{ "action": "help", "topic": "container:resume" }
{ "action": "help", "format": "json" }
```

**Breaking change from V2:** The unified `homelab` tool has been completely removed and replaced with `flux` and `scout`.
```

**Step 3: Create architecture documentation**

```markdown
<!-- docs/ARCHITECTURE.md -->
# Architecture: V3 Schema Refactor

## Design Principles

1. **Tool Separation**: Docker operations (flux) separated from SSH operations (scout)
2. **O(1) Validation**: Discriminated unions for constant-time schema validation
3. **Auto-Generated Help**: Schema introspection for documentation
4. **No Backward Compatibility**: Clean break from V2 unified tool

## Schema Architecture

### Flux Tool

Uses **composite discriminator** pattern:
- Discriminator key: `action_subaction` (e.g., "container:list")
- Injected via `z.preprocess()` for backward compatibility
- 39 discriminator keys across 4 actions

### Scout Tool

Uses **primary discriminator** pattern:
- Discriminator key: `action`
- Nested discriminators for `zfs` and `logs` actions
- 11 top-level actions, 16 total discriminator keys

## File Structure

```
src/
├── schemas/
│   ├── common.ts           # Shared schemas + preprocessor
│   ├── flux/
│   │   ├── index.ts        # Flux discriminated union
│   │   ├── container.ts    # Container schemas (14)
│   │   ├── compose.ts      # Compose schemas (9)
│   │   ├── docker.ts       # Docker schemas (9)
│   │   └── host.ts         # Host schemas (7)
│   └── scout/
│       ├── index.ts        # Scout discriminated union
│       ├── simple.ts       # Simple actions (9)
│       ├── zfs.ts          # ZFS nested discriminator (3)
│       └── logs.ts         # Logs nested discriminator (4)
├── tools/
│   ├── flux.ts             # Flux handler + help
│   ├── scout.ts            # Scout handler + help
│   └── handlers/
│       ├── container.ts
│       ├── compose.ts
│       ├── docker.ts
│       ├── host.ts
│       ├── scout-simple.ts
│       ├── scout-zfs.ts
│       └── scout-logs.ts
└── utils/
    └── help.ts             # Help introspection with unwrapping
```

## Performance

### Validation
- **Before (union)**: O(n) worst-case (try each schema)
- **After (discriminated union)**: O(1) (direct lookup)
- **Latency**: <0.005ms typical

### Help Generation
- Uses Zod schema introspection
- Unwraps `z.preprocess()` wrappers automatically
- Extracts types, descriptions, defaults from schema metadata
- No manual documentation maintenance

## Breaking Changes

**V3 is a complete rewrite:**
- Unified `homelab` tool deleted entirely
- Two new tools: `flux` (Docker) and `scout` (SSH)
- `container:unpause` → `container:resume`
- Scout actions restructured with nested discriminators
- MCP SDK 1.25.1 API (`registerTool` instead of `addTool`)
```

**Step 4: Commit**

```bash
git add src/schemas/index.ts README.md docs/ARCHITECTURE.md
git commit -m "docs: update schema exports, README, and add architecture documentation for V3"
```

---

## Verification and Testing

### Task 15: Integration Tests

**Files:**
- Create: `src/tools/flux.integration.test.ts`
- Create: `src/tools/scout.integration.test.ts`

**Step 1: Write flux integration test**

```typescript
// src/tools/flux.integration.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema } from '../schemas/flux/index.js';

describe('Flux Integration', () => {
  it('should validate all 39 discriminator keys', () => {
    const testCases = [
      { action: 'container', subaction: 'list' },
      { action: 'container', subaction: 'resume', container_id: 'test' },
      { action: 'docker', subaction: 'networks', host: 'tootie' },
      { action: 'host', subaction: 'services', host: 'tootie' },
      // ... add all 39 cases
    ];

    testCases.forEach(testCase => {
      expect(() => FluxSchema.parse(testCase)).not.toThrow();
    });
  });

  it('should reject unpause (replaced by resume)', () => {
    expect(() => FluxSchema.parse({
      action: 'container',
      subaction: 'unpause',
      container_id: 'test'
    })).toThrow();
  });
});
```

**Step 2: Write scout integration test**

```typescript
// src/tools/scout.integration.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutSchema } from '../schemas/scout/index.js';

describe('Scout Integration', () => {
  it('should validate all simple actions', () => {
    const testCases = [
      { action: 'nodes' },
      { action: 'peek', target: 'host:/path' },
      { action: 'ps', host: 'tootie' },
      // ... all 9 simple actions
    ];

    testCases.forEach(testCase => {
      expect(() => ScoutSchema.parse(testCase)).not.toThrow();
    });
  });

  it('should validate nested zfs discriminator', () => {
    const testCases = [
      { action: 'zfs', subaction: 'pools', host: 'tootie' },
      { action: 'zfs', subaction: 'datasets', host: 'tootie' },
      { action: 'zfs', subaction: 'snapshots', host: 'tootie' }
    ];

    testCases.forEach(testCase => {
      expect(() => ScoutSchema.parse(testCase)).not.toThrow();
    });
  });

  it('should validate nested logs discriminator', () => {
    const testCases = [
      { action: 'logs', subaction: 'syslog', host: 'tootie' },
      { action: 'logs', subaction: 'journal', host: 'tootie' },
      { action: 'logs', subaction: 'dmesg', host: 'tootie' },
      { action: 'logs', subaction: 'auth', host: 'tootie' }
    ];

    testCases.forEach(testCase => {
      expect(() => ScoutSchema.parse(testCase)).not.toThrow();
    });
  });
});
```

**Step 3: Run integration tests**

Run: `pnpm test src/tools/flux.integration.test.ts src/tools/scout.integration.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/flux.integration.test.ts src/tools/scout.integration.test.ts
git commit -m "test: add integration tests for flux and scout tools"
```

---

## Final Tasks: Handler Implementation (TDD-Compliant)

### Task 16: Implement Container Handlers (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/container.ts`
- Test: `src/tools/handlers/container.test.ts`

**Step 1: Write failing tests for container handlers**

```typescript
// src/tools/handlers/container.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleContainerAction } from './container.js';

describe('Container Handler', () => {
  it('should handle list subaction', async () => {
    const mockDockerService = {
      listContainers: vi.fn().mockResolvedValue([{ id: 'abc', name: 'test' }])
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    const result = await handleContainerAction({
      action: 'container',
      subaction: 'list',
      action_subaction: 'container:list',
      state: 'all'
    }, mockContainer);

    expect(mockDockerService.listContainers).toHaveBeenCalled();
    expect(result).toContain('test');
  });

  it('should handle resume subaction (maps to unpause)', async () => {
    const mockDockerService = {
      unpauseContainer: vi.fn().mockResolvedValue({ success: true })
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    await handleContainerAction({
      action: 'container',
      subaction: 'resume',
      action_subaction: 'container:resume',
      container_id: 'plex'
    }, mockContainer);

    expect(mockDockerService.unpauseContainer).toHaveBeenCalledWith('plex');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/container.test.ts`
Expected: FAIL with "Cannot find module './container.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/container.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleContainerAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const dockerService = container.getDockerService();

  switch (input.subaction) {
    case 'list':
      const containers = await dockerService.listContainers([], { state: input.state });
      return JSON.stringify(containers);
    case 'resume':
      // Map resume to unpause in service layer
      await dockerService.unpauseContainer(input.container_id);
      return `Container ${input.container_id} resumed`;
    default:
      throw new Error(`Unknown subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/container.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/container.ts src/tools/handlers/container.test.ts
git commit -m "feat(handlers): implement container handlers with TDD (list, resume)"
```

**Step 6: Continue RED-GREEN-REFACTOR for remaining container subactions**

Repeat steps 1-5 for each remaining subaction (start, stop, restart, etc.), adding 2-3 subactions per commit.

---

### Task 17: Implement Compose Handlers (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/compose.ts`
- Test: `src/tools/handlers/compose.test.ts`

**Step 1: Write failing tests for compose handlers**

```typescript
// src/tools/handlers/compose.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleComposeAction } from './compose.js';

describe('Compose Handler', () => {
  it('should handle list subaction', async () => {
    const mockComposeService = {
      listProjects: vi.fn().mockResolvedValue([{ name: 'plex', containers: 5 }])
    };
    const mockContainer = {
      getComposeService: () => mockComposeService
    } as any;

    const result = await handleComposeAction({
      action: 'compose',
      subaction: 'list',
      action_subaction: 'compose:list',
      host: 'tootie'
    }, mockContainer);

    expect(mockComposeService.listProjects).toHaveBeenCalledWith('tootie');
    expect(result).toContain('plex');
  });

  it('should handle up subaction with detach option', async () => {
    const mockComposeService = {
      upProject: vi.fn().mockResolvedValue({ success: true })
    };
    const mockContainer = {
      getComposeService: () => mockComposeService
    } as any;

    await handleComposeAction({
      action: 'compose',
      subaction: 'up',
      action_subaction: 'compose:up',
      host: 'tootie',
      project: 'plex',
      detach: true
    }, mockContainer);

    expect(mockComposeService.upProject).toHaveBeenCalledWith('tootie', 'plex', { detach: true });
  });

  it('should handle down subaction with remove_volumes option', async () => {
    const mockComposeService = {
      downProject: vi.fn().mockResolvedValue({ success: true })
    };
    const mockContainer = {
      getComposeService: () => mockComposeService
    } as any;

    await handleComposeAction({
      action: 'compose',
      subaction: 'down',
      action_subaction: 'compose:down',
      host: 'tootie',
      project: 'plex',
      remove_volumes: false
    }, mockContainer);

    expect(mockComposeService.downProject).toHaveBeenCalledWith('tootie', 'plex', { removeVolumes: false });
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/compose.test.ts`
Expected: FAIL with "Cannot find module './compose.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/compose.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleComposeAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const composeService = container.getComposeService();

  switch (input.subaction) {
    case 'list':
      const projects = await composeService.listProjects(input.host);
      return JSON.stringify(projects);

    case 'up':
      await composeService.upProject(input.host, input.project, { detach: input.detach });
      return `Project ${input.project} started`;

    case 'down':
      await composeService.downProject(input.host, input.project, { removeVolumes: input.remove_volumes });
      return `Project ${input.project} stopped`;

    default:
      throw new Error(`Unknown subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/compose.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/compose.ts src/tools/handlers/compose.test.ts
git commit -m "feat(handlers): implement compose handlers with TDD (list, up, down)"
```

**Step 6: Continue RED-GREEN-REFACTOR for remaining compose subactions**

Repeat steps 1-5 for each remaining subaction (status, restart, logs, build, pull, recreate), adding 2-3 subactions per commit.

**Compose subactions to implement:**
- list, status, up, down (initial commit)
- restart, logs (second commit)
- build, pull, recreate (third commit)

---

### Task 18: Implement Docker Handlers (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/docker.ts`
- Test: `src/tools/handlers/docker.test.ts`

**Step 1: Write failing tests for docker handlers**

```typescript
// src/tools/handlers/docker.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleDockerAction } from './docker.js';

describe('Docker Handler', () => {
  it('should handle info subaction', async () => {
    const mockDockerService = {
      getInfo: vi.fn().mockResolvedValue({ version: '24.0.0', containers: 15 })
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    const result = await handleDockerAction({
      action: 'docker',
      subaction: 'info',
      action_subaction: 'docker:info',
      host: 'tootie'
    }, mockContainer);

    expect(mockDockerService.getInfo).toHaveBeenCalledWith('tootie');
    expect(result).toContain('24.0.0');
  });

  it('should handle df subaction', async () => {
    const mockDockerService = {
      getDiskUsage: vi.fn().mockResolvedValue({ images: '10GB', containers: '5GB' })
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    const result = await handleDockerAction({
      action: 'docker',
      subaction: 'df',
      action_subaction: 'docker:df',
      host: 'tootie'
    }, mockContainer);

    expect(mockDockerService.getDiskUsage).toHaveBeenCalledWith('tootie');
    expect(result).toContain('10GB');
  });

  it('should handle prune subaction with force flag', async () => {
    const mockDockerService = {
      prune: vi.fn().mockResolvedValue({ reclaimed: '2GB' })
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    await handleDockerAction({
      action: 'docker',
      subaction: 'prune',
      action_subaction: 'docker:prune',
      host: 'tootie',
      prune_target: 'images',
      force: true
    }, mockContainer);

    expect(mockDockerService.prune).toHaveBeenCalledWith('tootie', 'images', { force: true });
  });

  it('should handle networks subaction', async () => {
    const mockDockerService = {
      listNetworks: vi.fn().mockResolvedValue([{ name: 'bridge' }, { name: 'host' }])
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    const result = await handleDockerAction({
      action: 'docker',
      subaction: 'networks',
      action_subaction: 'docker:networks',
      host: 'tootie'
    }, mockContainer);

    expect(mockDockerService.listNetworks).toHaveBeenCalled();
    expect(result).toContain('bridge');
  });

  it('should handle volumes subaction', async () => {
    const mockDockerService = {
      listVolumes: vi.fn().mockResolvedValue([{ name: 'plex_data' }])
    };
    const mockContainer = {
      getDockerService: () => mockDockerService
    } as any;

    const result = await handleDockerAction({
      action: 'docker',
      subaction: 'volumes',
      action_subaction: 'docker:volumes'
    }, mockContainer);

    expect(mockDockerService.listVolumes).toHaveBeenCalled();
    expect(result).toContain('plex_data');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/docker.test.ts`
Expected: FAIL with "Cannot find module './docker.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/docker.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleDockerAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const dockerService = container.getDockerService();

  switch (input.subaction) {
    case 'info':
      const info = await dockerService.getInfo(input.host);
      return JSON.stringify(info);

    case 'df':
      const diskUsage = await dockerService.getDiskUsage(input.host);
      return JSON.stringify(diskUsage);

    case 'prune':
      const pruneResult = await dockerService.prune(input.host, input.prune_target, { force: input.force });
      return `Pruned ${input.prune_target}: ${pruneResult.reclaimed} reclaimed`;

    case 'networks':
      const networks = await dockerService.listNetworks(input.host);
      return JSON.stringify(networks);

    case 'volumes':
      const volumes = await dockerService.listVolumes(input.host);
      return JSON.stringify(volumes);

    default:
      throw new Error(`Unknown subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/docker.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/docker.ts src/tools/handlers/docker.test.ts
git commit -m "feat(handlers): implement docker handlers with TDD (info, df, prune, networks, volumes)"
```

**Step 6: Continue RED-GREEN-REFACTOR for remaining docker subactions**

Repeat steps 1-5 for each remaining subaction (images, pull, build, rmi), adding 2-3 subactions per commit.

**Docker subactions to implement:**
- info, df, prune, networks, volumes (initial commit - 5 subactions)
- images, pull, build, rmi (second commit - 4 subactions)

---

### Task 19: Implement Host Handlers (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/host.ts`
- Test: `src/tools/handlers/host.test.ts`

**Step 1: Write failing tests for host handlers**

```typescript
// src/tools/handlers/host.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleHostAction } from './host.js';

describe('Host Handler', () => {
  it('should handle status subaction', async () => {
    const mockDockerService = {
      ping: vi.fn().mockResolvedValue(true),
      getContainerCount: vi.fn().mockResolvedValue(23)
    };
    const mockContainer = {
      getDockerService: () => mockDockerService,
      getHostConfig: () => ({ name: 'tootie', host: 'tootie.local' })
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'status',
      action_subaction: 'host:status',
      host: 'tootie'
    }, mockContainer);

    expect(mockDockerService.ping).toHaveBeenCalled();
    expect(result).toContain('tootie');
    expect(result).toContain('23');
  });

  it('should handle resources subaction', async () => {
    const mockSSHService = {
      getSystemResources: vi.fn().mockResolvedValue({
        cpu: { usage: 45.2, cores: 8 },
        memory: { used: 16384, total: 32768 },
        disk: { used: 500, total: 1000 }
      })
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'resources',
      action_subaction: 'host:resources',
      host: 'tootie'
    }, mockContainer);

    expect(mockSSHService.getSystemResources).toHaveBeenCalledWith('tootie');
    expect(result).toContain('45.2');
    expect(result).toContain('16384');
  });

  it('should handle info subaction', async () => {
    const mockSSHService = {
      getSystemInfo: vi.fn().mockResolvedValue({
        os: 'Linux',
        kernel: '6.1.0',
        arch: 'x86_64',
        hostname: 'tootie.local'
      })
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'info',
      action_subaction: 'host:info',
      host: 'tootie'
    }, mockContainer);

    expect(mockSSHService.getSystemInfo).toHaveBeenCalledWith('tootie');
    expect(result).toContain('Linux');
    expect(result).toContain('6.1.0');
  });

  it('should handle uptime subaction', async () => {
    const mockSSHService = {
      getUptime: vi.fn().mockResolvedValue({ uptime: '15 days, 3:42:10' })
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'uptime',
      action_subaction: 'host:uptime',
      host: 'tootie'
    }, mockContainer);

    expect(mockSSHService.getUptime).toHaveBeenCalledWith('tootie');
    expect(result).toContain('15 days');
  });

  it('should handle services subaction with state filter', async () => {
    const mockSSHService = {
      getSystemdServices: vi.fn().mockResolvedValue([
        { name: 'docker', state: 'running', enabled: true },
        { name: 'nginx', state: 'running', enabled: true }
      ])
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'services',
      action_subaction: 'host:services',
      host: 'tootie',
      state: 'running'
    }, mockContainer);

    expect(mockSSHService.getSystemdServices).toHaveBeenCalledWith('tootie', { state: 'running' });
    expect(result).toContain('docker');
    expect(result).toContain('nginx');
  });

  it('should handle network subaction', async () => {
    const mockSSHService = {
      getNetworkInfo: vi.fn().mockResolvedValue({
        interfaces: [
          { name: 'eth0', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' },
          { name: 'docker0', ip: '172.17.0.1', mac: '02:42:ac:11:00:01' }
        ]
      })
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'network',
      action_subaction: 'host:network',
      host: 'tootie'
    }, mockContainer);

    expect(mockSSHService.getNetworkInfo).toHaveBeenCalledWith('tootie');
    expect(result).toContain('eth0');
    expect(result).toContain('192.168.1.100');
  });

  it('should handle mounts subaction', async () => {
    const mockSSHService = {
      getMounts: vi.fn().mockResolvedValue([
        { device: '/dev/sda1', mountpoint: '/', type: 'ext4', size: '100G', used: '45G' },
        { device: '/dev/sdb1', mountpoint: '/mnt/data', type: 'zfs', size: '2T', used: '1.2T' }
      ])
    };
    const mockContainer = {
      getSSHService: () => mockSSHService
    } as any;

    const result = await handleHostAction({
      action: 'host',
      subaction: 'mounts',
      action_subaction: 'host:mounts',
      host: 'tootie'
    }, mockContainer);

    expect(mockSSHService.getMounts).toHaveBeenCalledWith('tootie');
    expect(result).toContain('/dev/sda1');
    expect(result).toContain('/mnt/data');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/host.test.ts`
Expected: FAIL with "Cannot find module './host.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/host.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleHostAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  switch (input.subaction) {
    case 'status': {
      const dockerService = container.getDockerService(input.host);
      const config = container.getHostConfig(input.host);
      const isOnline = await dockerService.ping();
      const containerCount = isOnline ? await dockerService.getContainerCount() : 0;

      return `Host: ${config.name} (${config.host})\nStatus: ${isOnline ? 'Online' : 'Offline'}\nContainers: ${containerCount}`;
    }

    case 'resources': {
      const sshService = container.getSSHService();
      const resources = await sshService.getSystemResources(input.host);

      return `CPU: ${resources.cpu.usage}% (${resources.cpu.cores} cores)\n` +
             `Memory: ${resources.memory.used} / ${resources.memory.total} MB\n` +
             `Disk: ${resources.disk.used} / ${resources.disk.total} GB`;
    }

    case 'info': {
      const sshService = container.getSSHService();
      const info = await sshService.getSystemInfo(input.host);

      return `OS: ${info.os}\nKernel: ${info.kernel}\nArch: ${info.arch}\nHostname: ${info.hostname}`;
    }

    case 'uptime': {
      const sshService = container.getSSHService();
      const { uptime } = await sshService.getUptime(input.host);

      return `Uptime: ${uptime}`;
    }

    case 'services': {
      const sshService = container.getSSHService();
      const services = await sshService.getSystemdServices(input.host, {
        state: input.state,
        service: input.service
      });

      return services.map(s => `${s.name}: ${s.state} (${s.enabled ? 'enabled' : 'disabled'})`).join('\n');
    }

    case 'network': {
      const sshService = container.getSSHService();
      const { interfaces } = await sshService.getNetworkInfo(input.host);

      return interfaces.map(i => `${i.name}: ${i.ip} (${i.mac})`).join('\n');
    }

    case 'mounts': {
      const sshService = container.getSSHService();
      const mounts = await sshService.getMounts(input.host);

      return mounts.map(m => `${m.device} on ${m.mountpoint} (${m.type}) - ${m.used} / ${m.size}`).join('\n');
    }

    default:
      throw new Error(`Unknown host subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/host.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/host.ts src/tools/handlers/host.test.ts
git commit -m "feat(handlers): implement host handlers with TDD (all 7 subactions)"
```

**Step 6: Integration check**

Run full test suite: `pnpm test`
Expected: All tests PASS

---

### Task 20: Implement Scout Simple Handlers (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/scout-simple.ts`
- Test: `src/tools/handlers/scout-simple.test.ts`

**Step 1: Write failing tests for scout simple handlers (9 actions)**

```typescript
// src/tools/handlers/scout-simple.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleScoutSimpleAction } from './scout-simple.js';

describe('Scout Simple Handler', () => {
  it('should handle nodes action', async () => {
    const mockScoutService = {
      listNodes: vi.fn().mockResolvedValue([
        { name: 'tootie', host: 'tootie.local', status: 'online' },
        { name: 'dookie', host: 'dookie.local', status: 'online' }
      ])
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'nodes'
    }, mockContainer);

    expect(mockScoutService.listNodes).toHaveBeenCalled();
    expect(result).toContain('tootie');
    expect(result).toContain('dookie');
  });

  it('should handle peek action for file read', async () => {
    const mockScoutService = {
      readRemoteFile: vi.fn().mockResolvedValue({
        content: 'user nginx;\nworker_processes auto;'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'peek',
      target: 'tootie:/etc/nginx/nginx.conf',
      tree: false
    }, mockContainer);

    expect(mockScoutService.readRemoteFile).toHaveBeenCalledWith('tootie', '/etc/nginx/nginx.conf');
    expect(result).toContain('user nginx');
  });

  it('should handle peek action for directory tree', async () => {
    const mockScoutService = {
      getDirectoryTree: vi.fn().mockResolvedValue({
        tree: '/var/log/\n├── nginx/\n│   ├── access.log\n│   └── error.log'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'peek',
      target: 'tootie:/var/log',
      tree: true,
      depth: 2
    }, mockContainer);

    expect(mockScoutService.getDirectoryTree).toHaveBeenCalledWith('tootie', '/var/log', { depth: 2 });
    expect(result).toContain('nginx/');
  });

  it('should handle exec action', async () => {
    const mockScoutService = {
      executeCommand: vi.fn().mockResolvedValue({
        stdout: '50M\t/var/www/html\n30M\t/var/www/app',
        stderr: '',
        exitCode: 0
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'exec',
      target: 'tootie:/var/www',
      command: 'du -sh *',
      timeout: 30
    }, mockContainer);

    expect(mockScoutService.executeCommand).toHaveBeenCalledWith('tootie', '/var/www', 'du -sh *', { timeout: 30 });
    expect(result).toContain('50M');
  });

  it('should handle find action', async () => {
    const mockScoutService = {
      findFiles: vi.fn().mockResolvedValue({
        files: [
          '/etc/nginx/nginx.conf',
          '/etc/nginx/sites-available/default.conf'
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'find',
      target: 'tootie:/etc',
      pattern: '*.conf',
      depth: 3
    }, mockContainer);

    expect(mockScoutService.findFiles).toHaveBeenCalledWith('tootie', '/etc', '*.conf', { depth: 3 });
    expect(result).toContain('nginx.conf');
  });

  it('should handle delta action for file comparison', async () => {
    const mockScoutService = {
      compareFiles: vi.fn().mockResolvedValue({
        diff: '--- tootie:/etc/hosts\n+++ dookie:/etc/hosts\n@@ -1,2 +1,2 @@\n-127.0.0.1 localhost\n+127.0.0.1 localhost.localdomain'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'delta',
      source: 'tootie:/etc/hosts',
      target: 'dookie:/etc/hosts'
    }, mockContainer);

    expect(mockScoutService.compareFiles).toHaveBeenCalledWith('tootie:/etc/hosts', 'dookie:/etc/hosts');
    expect(result).toContain('localhost');
  });

  it('should handle delta action for content comparison', async () => {
    const mockScoutService = {
      compareWithContent: vi.fn().mockResolvedValue({
        diff: '--- tootie:/etc/hosts\n+++ (content)\n@@ -1,2 +1,2 @@\n-127.0.0.1 localhost'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'delta',
      source: 'tootie:/etc/hosts',
      content: '127.0.0.1 localhost\n::1 localhost'
    }, mockContainer);

    expect(mockScoutService.compareWithContent).toHaveBeenCalledWith('tootie:/etc/hosts', '127.0.0.1 localhost\n::1 localhost');
    expect(result).toContain('localhost');
  });

  it('should handle emit action for multi-host file read', async () => {
    const mockScoutService = {
      readMultipleFiles: vi.fn().mockResolvedValue({
        results: [
          { host: 'web1', path: '/var/log/app.log', content: '[ERROR] Connection failed' },
          { host: 'web2', path: '/var/log/app.log', content: '[INFO] Server started' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'emit',
      targets: ['web1:/var/log/app.log', 'web2:/var/log/app.log']
    }, mockContainer);

    expect(mockScoutService.readMultipleFiles).toHaveBeenCalledWith(['web1:/var/log/app.log', 'web2:/var/log/app.log']);
    expect(result).toContain('web1');
    expect(result).toContain('ERROR');
  });

  it('should handle emit action for multi-host command execution', async () => {
    const mockScoutService = {
      executeOnMultipleHosts: vi.fn().mockResolvedValue({
        results: [
          { host: 'tootie', stdout: 'Filesystem      Size  Used Avail Use%\n/dev/sda1       100G   45G   55G  45%' },
          { host: 'dookie', stdout: 'Filesystem      Size  Used Avail Use%\n/dev/sda1       2.0T  1.2T  800G  60%' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'emit',
      targets: ['tootie:/tmp', 'dookie:/tmp'],
      command: 'df -h'
    }, mockContainer);

    expect(mockScoutService.executeOnMultipleHosts).toHaveBeenCalledWith(
      ['tootie:/tmp', 'dookie:/tmp'],
      'df -h'
    );
    expect(result).toContain('tootie');
    expect(result).toContain('45G');
  });

  it('should handle beam action for file transfer', async () => {
    const mockScoutService = {
      transferFile: vi.fn().mockResolvedValue({
        success: true,
        bytesTransferred: 1048576
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'beam',
      source: 'tootie:/tmp/backup.tar.gz',
      destination: 'dookie:/backup/'
    }, mockContainer);

    expect(mockScoutService.transferFile).toHaveBeenCalledWith('tootie:/tmp/backup.tar.gz', 'dookie:/backup/');
    expect(result).toContain('1048576');
  });

  it('should handle ps action', async () => {
    const mockScoutService = {
      listProcesses: vi.fn().mockResolvedValue([
        { pid: 1234, user: 'root', cpu: 15.2, mem: 2048, command: 'dockerd' },
        { pid: 5678, user: 'nginx', cpu: 5.1, mem: 512, command: 'nginx: worker' }
      ])
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'ps',
      host: 'tootie',
      grep: 'docker',
      sort: 'cpu',
      limit: 50
    }, mockContainer);

    expect(mockScoutService.listProcesses).toHaveBeenCalledWith('tootie', {
      grep: 'docker',
      sort: 'cpu',
      limit: 50
    });
    expect(result).toContain('dockerd');
    expect(result).toContain('15.2');
  });

  it('should handle df action', async () => {
    const mockScoutService = {
      getDiskUsage: vi.fn().mockResolvedValue({
        filesystems: [
          { device: '/dev/sda1', mountpoint: '/', size: '100G', used: '45G', avail: '55G', usePercent: '45%' },
          { device: '/dev/sdb1', mountpoint: '/mnt/data', size: '2.0T', used: '1.2T', avail: '800G', usePercent: '60%' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutSimpleAction({
      action: 'df',
      host: 'tootie',
      path: '/mnt/data',
      human_readable: true
    }, mockContainer);

    expect(mockScoutService.getDiskUsage).toHaveBeenCalledWith('tootie', {
      path: '/mnt/data',
      humanReadable: true
    });
    expect(result).toContain('/mnt/data');
    expect(result).toContain('1.2T');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/scout-simple.test.ts`
Expected: FAIL with "Cannot find module './scout-simple.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/scout-simple.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleScoutSimpleAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const scoutService = container.getScoutService();

  switch (input.action) {
    case 'nodes': {
      const nodes = await scoutService.listNodes();
      return nodes.map(n => `${n.name} (${n.host}) - ${n.status}`).join('\n');
    }

    case 'peek': {
      const [hostname, path] = input.target.split(':');

      if (input.tree) {
        const { tree } = await scoutService.getDirectoryTree(hostname, path, { depth: input.depth });
        return tree;
      } else {
        const { content } = await scoutService.readRemoteFile(hostname, path);
        return content;
      }
    }

    case 'exec': {
      const [hostname, workdir] = input.target.split(':');
      const { stdout, stderr, exitCode } = await scoutService.executeCommand(
        hostname,
        workdir,
        input.command,
        { timeout: input.timeout }
      );

      return exitCode === 0 ? stdout : `${stdout}\n${stderr}`;
    }

    case 'find': {
      const [hostname, searchRoot] = input.target.split(':');
      const { files } = await scoutService.findFiles(hostname, searchRoot, input.pattern, {
        depth: input.depth
      });

      return files.join('\n');
    }

    case 'delta': {
      if (input.content) {
        const { diff } = await scoutService.compareWithContent(input.source, input.content);
        return diff;
      } else {
        const { diff } = await scoutService.compareFiles(input.source, input.target);
        return diff;
      }
    }

    case 'emit': {
      if (input.command) {
        const { results } = await scoutService.executeOnMultipleHosts(input.targets, input.command);
        return results.map(r => `=== ${r.host} ===\n${r.stdout}`).join('\n\n');
      } else {
        const { results } = await scoutService.readMultipleFiles(input.targets);
        return results.map(r => `=== ${r.host}:${r.path} ===\n${r.content}`).join('\n\n');
      }
    }

    case 'beam': {
      const { success, bytesTransferred } = await scoutService.transferFile(
        input.source,
        input.destination
      );

      return success ? `Transferred ${bytesTransferred} bytes` : 'Transfer failed';
    }

    case 'ps': {
      const processes = await scoutService.listProcesses(input.host, {
        grep: input.grep,
        user: input.user,
        sort: input.sort,
        limit: input.limit
      });

      return processes
        .map(p => `${p.pid}\t${p.user}\t${p.cpu}%\t${p.mem}MB\t${p.command}`)
        .join('\n');
    }

    case 'df': {
      const { filesystems } = await scoutService.getDiskUsage(input.host, {
        path: input.path,
        humanReadable: input.human_readable
      });

      return filesystems
        .map(f => `${f.device}\t${f.mountpoint}\t${f.size}\t${f.used}\t${f.avail}\t${f.usePercent}`)
        .join('\n');
    }

    default:
      throw new Error(`Unknown scout action: ${input.action}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/scout-simple.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/scout-simple.ts src/tools/handlers/scout-simple.test.ts
git commit -m "feat(handlers): implement scout simple handlers with TDD (all 9 actions)"
```

**Step 6: Integration check**

Run full test suite: `pnpm test`
Expected: All tests PASS

---

### Task 21: Implement Scout ZFS Handler (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/scout-zfs.ts`
- Test: `src/tools/handlers/scout-zfs.test.ts`

**Step 1: Write failing tests for scout zfs handlers**

```typescript
// src/tools/handlers/scout-zfs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleScoutZfsAction } from './scout-zfs.js';

describe('Scout ZFS Handler', () => {
  it('should handle pools subaction', async () => {
    const mockScoutService = {
      getZfsPools: vi.fn().mockResolvedValue([
        { name: 'tank', size: '10T', alloc: '5T', free: '5T', health: 'ONLINE' },
        { name: 'cache', size: '2T', alloc: '500G', free: '1.5T', health: 'ONLINE' }
      ])
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'pools',
      action_subaction: 'zfs:pools',
      host: 'tootie'
    }, mockContainer);

    expect(mockScoutService.getZfsPools).toHaveBeenCalledWith('tootie');
    expect(result).toContain('tank');
    expect(result).toContain('ONLINE');
  });

  it('should handle datasets subaction', async () => {
    const mockScoutService = {
      getZfsDatasets: vi.fn().mockResolvedValue([
        { name: 'tank/data', used: '2T', avail: '3T', refer: '1.5T', mountpoint: '/mnt/data' },
        { name: 'tank/media', used: '1T', avail: '4T', refer: '800G', mountpoint: '/mnt/media' }
      ])
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'datasets',
      action_subaction: 'zfs:datasets',
      host: 'tootie',
      pool: 'tank'
    }, mockContainer);

    expect(mockScoutService.getZfsDatasets).toHaveBeenCalledWith('tootie', 'tank');
    expect(result).toContain('tank/data');
    expect(result).toContain('/mnt/data');
  });

  it('should handle snapshots subaction', async () => {
    const mockScoutService = {
      getZfsSnapshots: vi.fn().mockResolvedValue([
        { name: 'tank/data@daily-2025-12-29', used: '100M', refer: '1.5T', creation: '2025-12-29 00:00' },
        { name: 'tank/data@daily-2025-12-28', used: '50M', refer: '1.5T', creation: '2025-12-28 00:00' }
      ])
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'snapshots',
      action_subaction: 'zfs:snapshots',
      host: 'tootie',
      pool: 'tank',
      dataset: 'data'
    }, mockContainer);

    expect(mockScoutService.getZfsSnapshots).toHaveBeenCalledWith('tootie', 'tank', 'data');
    expect(result).toContain('@daily-2025-12-29');
  });

  it('should handle health subaction', async () => {
    const mockScoutService = {
      getZfsHealth: vi.fn().mockResolvedValue({
        pool: 'tank',
        state: 'ONLINE',
        scan: 'scrub repaired 0B in 12h with 0 errors on 2025-12-28',
        errors: 'No known data errors'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'health',
      action_subaction: 'zfs:health',
      host: 'tootie',
      pool: 'tank'
    }, mockContainer);

    expect(mockScoutService.getZfsHealth).toHaveBeenCalledWith('tootie', 'tank');
    expect(result).toContain('ONLINE');
    expect(result).toContain('No known data errors');
  });

  it('should handle scrub subaction', async () => {
    const mockScoutService = {
      runZfsScrub: vi.fn().mockResolvedValue({
        success: true,
        message: 'Started scrub on pool tank'
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'scrub',
      action_subaction: 'zfs:scrub',
      host: 'tootie',
      pool: 'tank'
    }, mockContainer);

    expect(mockScoutService.runZfsScrub).toHaveBeenCalledWith('tootie', 'tank');
    expect(result).toContain('Started scrub');
  });

  it('should handle iostat subaction', async () => {
    const mockScoutService = {
      getZfsIostat: vi.fn().mockResolvedValue({
        pool: 'tank',
        capacity: '50%',
        operations: { read: 1234, write: 5678 },
        bandwidth: { read: '100M/s', write: '200M/s' }
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutZfsAction({
      action: 'zfs',
      subaction: 'iostat',
      action_subaction: 'zfs:iostat',
      host: 'tootie',
      pool: 'tank'
    }, mockContainer);

    expect(mockScoutService.getZfsIostat).toHaveBeenCalledWith('tootie', 'tank');
    expect(result).toContain('50%');
    expect(result).toContain('100M/s');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/scout-zfs.test.ts`
Expected: FAIL with "Cannot find module './scout-zfs.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/scout-zfs.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleScoutZfsAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const scoutService = container.getScoutService();

  switch (input.subaction) {
    case 'pools': {
      const pools = await scoutService.getZfsPools(input.host);
      return pools
        .map(p => `${p.name}\t${p.size}\t${p.alloc}\t${p.free}\t${p.health}`)
        .join('\n');
    }

    case 'datasets': {
      const datasets = await scoutService.getZfsDatasets(input.host, input.pool);
      return datasets
        .map(d => `${d.name}\t${d.used}\t${d.avail}\t${d.refer}\t${d.mountpoint}`)
        .join('\n');
    }

    case 'snapshots': {
      const snapshots = await scoutService.getZfsSnapshots(
        input.host,
        input.pool,
        input.dataset
      );
      return snapshots
        .map(s => `${s.name}\t${s.used}\t${s.refer}\t${s.creation}`)
        .join('\n');
    }

    case 'health': {
      const health = await scoutService.getZfsHealth(input.host, input.pool);
      return `Pool: ${health.pool}
State: ${health.state}
Scan: ${health.scan}
Errors: ${health.errors}`;
    }

    case 'scrub': {
      const { success, message } = await scoutService.runZfsScrub(
        input.host,
        input.pool
      );
      return success ? message : `Failed to start scrub: ${message}`;
    }

    case 'iostat': {
      const stats = await scoutService.getZfsIostat(input.host, input.pool);
      return `Pool: ${stats.pool}
Capacity: ${stats.capacity}
Operations: Read=${stats.operations.read} Write=${stats.operations.write}
Bandwidth: Read=${stats.bandwidth.read} Write=${stats.bandwidth.write}`;
    }

    default:
      throw new Error(`Unknown zfs subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/scout-zfs.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/scout-zfs.ts src/tools/handlers/scout-zfs.test.ts
git commit -m "feat(handlers): implement scout zfs handlers with TDD (6 subactions)"
```

**Step 6: Integration check**

Run full test suite: `pnpm test`
Expected: All tests PASS

---

### Task 22: Implement Scout Logs Handler (RED-GREEN-REFACTOR)

**Files:**
- Create: `src/tools/handlers/scout-logs.ts`
- Test: `src/tools/handlers/scout-logs.test.ts`

**Step 1: Write failing tests for scout logs handlers**

```typescript
// src/tools/handlers/scout-logs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleScoutLogsAction } from './scout-logs.js';

describe('Scout Logs Handler', () => {
  it('should handle system subaction', async () => {
    const mockScoutService = {
      getSystemLogs: vi.fn().mockResolvedValue({
        logs: [
          { timestamp: '2025-12-29 10:00:00', level: 'INFO', message: 'System started' },
          { timestamp: '2025-12-29 10:01:00', level: 'WARN', message: 'Low memory' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutLogsAction({
      action: 'logs',
      subaction: 'system',
      action_subaction: 'logs:system',
      host: 'tootie',
      lines: 100,
      follow: false
    }, mockContainer);

    expect(mockScoutService.getSystemLogs).toHaveBeenCalledWith('tootie', { lines: 100, follow: false });
    expect(result).toContain('System started');
    expect(result).toContain('WARN');
  });

  it('should handle docker subaction', async () => {
    const mockScoutService = {
      getDockerLogs: vi.fn().mockResolvedValue({
        logs: [
          { timestamp: '2025-12-29 10:00:00', container: 'plex', message: 'Container started' },
          { timestamp: '2025-12-29 10:01:00', container: 'nginx', message: 'Request handled' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutLogsAction({
      action: 'logs',
      subaction: 'docker',
      action_subaction: 'logs:docker',
      host: 'tootie',
      container: 'plex',
      lines: 50,
      since: '1h'
    }, mockContainer);

    expect(mockScoutService.getDockerLogs).toHaveBeenCalledWith(
      'tootie',
      'plex',
      { lines: 50, since: '1h' }
    );
    expect(result).toContain('Container started');
    expect(result).toContain('plex');
  });

  it('should handle kernel subaction', async () => {
    const mockScoutService = {
      getKernelLogs: vi.fn().mockResolvedValue({
        logs: [
          { timestamp: '2025-12-29 09:00:00', facility: 'kern', message: 'Boot complete' },
          { timestamp: '2025-12-29 09:01:00', facility: 'kern', message: 'USB device connected' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutLogsAction({
      action: 'logs',
      subaction: 'kernel',
      action_subaction: 'logs:kernel',
      host: 'tootie',
      lines: 200,
      grep: 'USB'
    }, mockContainer);

    expect(mockScoutService.getKernelLogs).toHaveBeenCalledWith('tootie', { lines: 200, grep: 'USB' });
    expect(result).toContain('USB device connected');
  });

  it('should handle app subaction', async () => {
    const mockScoutService = {
      getAppLogs: vi.fn().mockResolvedValue({
        logs: [
          { timestamp: '2025-12-29 10:00:00', level: 'INFO', message: 'Request received' },
          { timestamp: '2025-12-29 10:00:01', level: 'ERROR', message: 'Database connection failed' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutLogsAction({
      action: 'logs',
      subaction: 'app',
      action_subaction: 'logs:app',
      host: 'tootie',
      path: '/var/log/app/server.log',
      lines: 500,
      grep: 'ERROR'
    }, mockContainer);

    expect(mockScoutService.getAppLogs).toHaveBeenCalledWith(
      'tootie',
      '/var/log/app/server.log',
      { lines: 500, grep: 'ERROR' }
    );
    expect(result).toContain('Database connection failed');
  });

  it('should handle auth subaction', async () => {
    const mockScoutService = {
      getAuthLogs: vi.fn().mockResolvedValue({
        logs: [
          { timestamp: '2025-12-29 08:00:00', user: 'admin', event: 'login', result: 'success' },
          { timestamp: '2025-12-29 08:05:00', user: 'attacker', event: 'login', result: 'failed' }
        ]
      })
    };
    const mockContainer = {
      getScoutService: () => mockScoutService
    } as any;

    const result = await handleScoutLogsAction({
      action: 'logs',
      subaction: 'auth',
      action_subaction: 'logs:auth',
      host: 'tootie',
      lines: 100,
      grep: 'failed'
    }, mockContainer);

    expect(mockScoutService.getAuthLogs).toHaveBeenCalledWith('tootie', { lines: 100, grep: 'failed' });
    expect(result).toContain('attacker');
    expect(result).toContain('failed');
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts`
Expected: FAIL with "Cannot find module './scout-logs.js'"

**Step 3: Write minimal implementation (GREEN)**

```typescript
// src/tools/handlers/scout-logs.ts
import type { ServiceContainer } from '../../services/container.js';

export async function handleScoutLogsAction(
  input: any,
  container: ServiceContainer
): Promise<string> {
  const scoutService = container.getScoutService();

  switch (input.subaction) {
    case 'system': {
      const { logs } = await scoutService.getSystemLogs(input.host, {
        lines: input.lines,
        follow: input.follow
      });
      return logs
        .map(l => `${l.timestamp} [${l.level}] ${l.message}`)
        .join('\n');
    }

    case 'docker': {
      const { logs } = await scoutService.getDockerLogs(
        input.host,
        input.container,
        {
          lines: input.lines,
          since: input.since
        }
      );
      return logs
        .map(l => `${l.timestamp} [${l.container}] ${l.message}`)
        .join('\n');
    }

    case 'kernel': {
      const { logs } = await scoutService.getKernelLogs(input.host, {
        lines: input.lines,
        grep: input.grep
      });
      return logs
        .map(l => `${l.timestamp} [${l.facility}] ${l.message}`)
        .join('\n');
    }

    case 'app': {
      const { logs } = await scoutService.getAppLogs(
        input.host,
        input.path,
        {
          lines: input.lines,
          grep: input.grep
        }
      );
      return logs
        .map(l => `${l.timestamp} [${l.level}] ${l.message}`)
        .join('\n');
    }

    case 'auth': {
      const { logs } = await scoutService.getAuthLogs(input.host, {
        lines: input.lines,
        grep: input.grep
      });
      return logs
        .map(l => `${l.timestamp} ${l.user} ${l.event} ${l.result}`)
        .join('\n');
    }

    default:
      throw new Error(`Unknown logs subaction: ${input.subaction}`);
  }
}
```

**Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm test src/tools/handlers/scout-logs.test.ts`
Expected: PASS

**Step 5: Refactor (if needed) and commit**

```bash
git add src/tools/handlers/scout-logs.ts src/tools/handlers/scout-logs.test.ts
git commit -m "feat(handlers): implement scout logs handlers with TDD (5 subactions)"
```

**Step 6: Integration check**

Run full test suite: `pnpm test`
Expected: All tests PASS

---

### Task 23: Final Integration Test and Type Check

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 2: Run type check**

Run: `pnpm build`
Expected: No type errors

**Step 3: Final commit**

```bash
git add src/tools/handlers/
git commit -m "feat(tools): complete all handler implementations with TDD"
```

---

## Summary

**Plan complete and validation issues resolved!**

**Total tasks:** 23 (was 17, split Task 17 into 7 separate TDD tasks)
**Total commits:** 23+ (one per task + additional commits for handler subactions)

**Key deliverables:**
- ✅ Common schema base with pagination, response format, and preprocessor
- ✅ Flux tool with 39 subactions (4 actions × varying subactions)
- ✅ Scout tool with 11 actions (9 simple + 2 nested)
- ✅ Auto-generated help system via schema introspection with unwrapping
- ✅ **Complete removal of unified tool** (clean break)
- ✅ Architecture docs (no migration guide needed)
- ✅ Full test coverage (unit + integration)
- ✅ **MCP SDK 1.25.1 API compliance** (registerTool instead of addTool)
- ✅ **TDD-compliant handler implementation** (RED-GREEN-REFACTOR cycles)

**Breaking changes (V2 → V3):**
- **DELETED**: Unified `homelab` tool completely removed
- **NEW**: `flux` tool for Docker operations (39 subactions)
- **NEW**: `scout` tool for SSH operations (11 actions)
- `container:unpause` → `container:resume`
- Scout operations restructured with nested discriminators
- MCP SDK API updated to 1.25.1

**New features:**
- Help action for both tools (`{ "action": "help" }`)
- Docker: `networks`, `volumes` subactions
- Host: 5 new subactions (`info`, `uptime`, `services`, `network`, `mounts`)
- Scout: Nested discriminators for `zfs` and `logs`

**Validation fixes applied:**
1. ✅ Preprocessor moved to common.ts to prevent deletion dependency
2. ✅ Help handler unwraps preprocessed schemas correctly
3. ✅ MCP SDK API updated to use `registerTool()` instead of `addTool()`
4. ✅ Task 12 deleted (TDD violation removed)
5. ✅ Task 17 split into 7 separate TDD-compliant tasks with proper RED-GREEN-REFACTOR cycles
