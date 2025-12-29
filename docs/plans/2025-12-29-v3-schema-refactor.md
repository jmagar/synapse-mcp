# V3 Schema Refactor - Flux & Scout Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace unified homelab tool with two specialized MCP tools (flux and scout) using discriminated unions with O(1) validation and auto-generated help system. Clean break - no backward compatibility.

**Architecture:** Flux uses composite discriminator (`action_subaction`), scout uses primary discriminator (`action`) with nested discriminators for `zfs` and `logs` actions. Both tools include auto-generated help handlers that introspect schema metadata.

**Tech Stack:** TypeScript 5.7+, Zod 3.24+, MCP SDK 1.12+, Vitest 4.0+

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

---

## Phase 1: Common Schemas and Utilities

### Task 1: Create Common Schema Base

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
  containerIdSchema
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/schemas/common.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/schemas/common.ts src/schemas/common.test.ts
git commit -m "feat(schemas): add common base schemas for V3 refactor"
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
 * Generate help documentation from discriminated union schema
 */
export function generateHelp(
  schema: z.ZodDiscriminatedUnion<string, z.ZodObject<any>[]>,
  topic?: string
): HelpEntry[] {
  const options = schema.options as z.ZodObject<any>[];

  const entries = options.map((option) => {
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
git commit -m "feat(utils): add help handler with schema introspection"
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
import { preprocessWithDiscriminator } from '../discriminator.js';
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
    const discriminatedUnion = FluxSchema._def.schema as any;
    const help = generateHelp(discriminatedUnion, helpInput.topic);

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

## Phase 5: Handler Stub Implementation

### Task 12: Create Action Handler Stubs

**Note:** This task creates minimal handler stubs that delegate to existing service layer. Full implementation will reuse existing logic from `src/tools/unified.ts`.

**Files:**
- Create: `src/tools/handlers/container.ts`
- Create: `src/tools/handlers/compose.ts`
- Create: `src/tools/handlers/docker.ts`
- Create: `src/tools/handlers/host.ts`
- Create: `src/tools/handlers/scout-simple.ts`
- Create: `src/tools/handlers/scout-zfs.ts`
- Create: `src/tools/handlers/scout-logs.ts`

**Step 1: Write stub for container handler**

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
      // Delegate to existing service - implementation in Task 13
      const containers = await dockerService.listContainers([], { state: input.state });
      return JSON.stringify(containers);
    case 'resume':
      // New: maps to unpause in service layer
      throw new Error('Not implemented yet');
    default:
      throw new Error(`Unknown subaction: ${input.subaction}`);
  }
}
```

**Step 2: Create minimal stubs for other handlers**

```typescript
// src/tools/handlers/compose.ts
export async function handleComposeAction(input: any, container: any): Promise<string> {
  throw new Error('Compose handler not implemented');
}

// src/tools/handlers/docker.ts
export async function handleDockerAction(input: any, container: any): Promise<string> {
  throw new Error('Docker handler not implemented');
}

// src/tools/handlers/host.ts
export async function handleHostAction(input: any, container: any): Promise<string> {
  throw new Error('Host handler not implemented');
}

// src/tools/handlers/scout-simple.ts
export async function handleNodesAction(input: any, container: any): Promise<string> {
  throw new Error('Not implemented');
}
// ... (export stubs for other scout simple actions)

// src/tools/handlers/scout-zfs.ts
export async function handleZfsAction(input: any, container: any): Promise<string> {
  throw new Error('Not implemented');
}

// src/tools/handlers/scout-logs.ts
export async function handleLogsAction(input: any, container: any): Promise<string> {
  throw new Error('Not implemented');
}
```

**Step 3: Commit stubs**

```bash
git add src/tools/handlers/
git commit -m "feat(tools): add handler stubs for flux and scout actions"
```

---

## Phase 6: Tool Registration and Integration

### Task 13: Register Flux and Scout Tools

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
      addTool: vi.fn()
    } as unknown as McpServer;

    const container = {} as ServiceContainer;

    registerTools(server, container);

    expect(server.addTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'flux' })
    );
    expect(server.addTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'scout' })
    );
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

  // Register Flux tool
  server.addTool({
    name: 'flux',
    description: 'Docker infrastructure management (read/write operations)',
    inputSchema: zodToJsonSchema(FluxSchema),
    handler: async (input) => {
      const result = await handleFluxTool(input, container);
      return { content: [{ type: 'text', text: result }] };
    }
  });

  // Register Scout tool
  server.addTool({
    name: 'scout',
    description: 'SSH remote operations (read-mostly)',
    inputSchema: zodToJsonSchema(ScoutSchema),
    handler: async (input) => {
      const result = await handleScoutTool(input, container);
      return { content: [{ type: 'text', text: result }] };
    }
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/tools/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/index.ts src/tools/index.test.ts
git commit -m "feat(tools): register flux and scout tools with MCP server"
```

---

## Phase 7: Delete Unified Tool

### Task 14: Remove Unified Tool and Old Schemas

**Files:**
- Delete: `src/tools/unified.ts`
- Delete: `src/tools/unified.test.ts`
- Delete: `src/tools/unified.integration.test.ts`
- Delete: `src/schemas/unified.ts`
- Delete: `src/schemas/unified.test.ts`
- Delete: `src/schemas/unified.bench.test.ts`
- Delete: `src/schemas/discriminator.ts`
- Delete: `src/schemas/discriminator.test.ts`
- Modify: `src/schemas/index.ts`

**Step 1: Delete unified tool files**

```bash
git rm src/tools/unified.ts src/tools/unified.test.ts src/tools/unified.integration.test.ts
```

**Step 2: Delete old schema files**

```bash
git rm src/schemas/unified.ts src/schemas/unified.test.ts src/schemas/unified.bench.test.ts
git rm src/schemas/discriminator.ts src/schemas/discriminator.test.ts
```

**Step 3: Update schema exports**

```typescript
// src/schemas/index.ts
/**
 * Schema exports for homelab MCP server
 */
export * from "./common.js";
export * from "./flux/index.js";
export * from "./scout/index.js";
```

**Step 4: Run tests to verify deletions**

Run: `pnpm test`
Expected: Tests pass (unified tests removed)

**Step 5: Commit**

```bash
git add -A  # Stage deletions and modifications
git commit -m "refactor: delete unified tool and old schemas for V3"
```

---

## Phase 8: Documentation and Completion

### Task 15: Update README and Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/ARCHITECTURE.md`

**Step 1: Update README with new tools**

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

**Step 2: Create architecture documentation**

```markdown
<!-- docs/ARCHITECTURE.md -->
# Architecture: V3 Schema Refactor

## Design Principles

1. **Tool Separation**: Docker operations (flux) separated from SSH operations (scout)
2. **O(1) Validation**: Discriminated unions for constant-time schema validation
3. **Auto-Generated Help**: Schema introspection for documentation
4. **Backward Compatibility**: Deprecated unified tool remains available

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
│   ├── common.ts           # Shared schemas
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
    └── help.ts             # Help introspection
```

## Performance

### Validation
- **Before (union)**: O(n) worst-case (try each schema)
- **After (discriminated union)**: O(1) (direct lookup)
- **Latency**: <0.005ms typical

### Help Generation
- Uses Zod schema introspection
- Extracts types, descriptions, defaults from schema metadata
- No manual documentation maintenance

## Breaking Changes

**V3 is a complete rewrite:**
- Unified `homelab` tool deleted entirely
- Two new tools: `flux` (Docker) and `scout` (SSH)
- `container:unpause` → `container:resume`
- Scout actions restructured with nested discriminators
```

**Step 3: Commit**

```bash
git add README.md docs/ARCHITECTURE.md
git commit -m "docs: update README and add architecture documentation for V3"
```

---

## Verification and Testing

### Task 16: Integration Tests

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

## Final Task: Complete Handler Implementation

### Task 17: Implement All Action Handlers

**Note:** This task migrates existing logic from `src/tools/unified.ts` to the new handler structure. Each handler should:
1. Reuse existing service layer methods
2. Apply formatting from `src/formatters/index.ts`
3. Handle errors with custom error classes
4. Support both markdown and JSON output formats

**Files:**
- Modify: All files in `src/tools/handlers/`

**Step 1: Implement container handler**

Review `src/tools/unified.ts` lines 100-400 (container operations) and migrate logic to `src/tools/handlers/container.ts`.

Map `resume` subaction to existing `unpause` service method.

**Step 2: Implement remaining handlers**

Follow same pattern for:
- compose (migrate from unified.ts compose section)
- docker (migrate from unified.ts docker section)
- host (migrate from unified.ts host section + add new operations)
- scout-simple (migrate from unified.ts scout section)
- scout-zfs (new implementation using SSH service)
- scout-logs (new implementation using SSH service)

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Run type check**

Run: `pnpm build`
Expected: No type errors

**Step 5: Final commit**

```bash
git add src/tools/handlers/
git commit -m "feat(tools): complete handler implementation with service layer delegation"
```

---

## Summary

**Plan complete!**

Total tasks: 17
Total commits: 17 (one per task)

**Key deliverables:**
- ✅ Common schema base with pagination, response format
- ✅ Flux tool with 39 subactions (4 actions × varying subactions)
- ✅ Scout tool with 11 actions (9 simple + 2 nested)
- ✅ Auto-generated help system via schema introspection
- ✅ **Complete removal of unified tool** (clean break)
- ✅ Architecture docs (no migration guide needed)
- ✅ Full test coverage (unit + integration)

**Breaking changes (V2 → V3):**
- **DELETED**: Unified `homelab` tool completely removed
- **NEW**: `flux` tool for Docker operations (39 subactions)
- **NEW**: `scout` tool for SSH operations (11 actions)
- `container:unpause` → `container:resume`
- Scout operations restructured with nested discriminators

**New features:**
- Help action for both tools (`{ "action": "help" }`)
- Docker: `networks`, `volumes` subactions
- Host: 5 new subactions (`info`, `uptime`, `services`, `network`, `mounts`)
- Scout: Nested discriminators for `zfs` and `logs`
