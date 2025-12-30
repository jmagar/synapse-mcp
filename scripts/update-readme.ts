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
