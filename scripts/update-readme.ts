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
  // Use flexible patterns that support multi-line descriptions and varying whitespace
  const toolsTableRegex = /#### flux\s*\n+([\s\S]*?)\n+(?=####|##|$)/i;
  const scoutTableRegex = /#### scout\s*\n+([\s\S]*?)\n+(?=####|##|$)/i;
  
  let updated = readme;

  const fluxMatch = toolsTableRegex.test(readme);
  const scoutMatch = scoutTableRegex.test(readme);

  if (!fluxMatch) {
    console.error('⚠️ Could not find "#### flux" section in README.md');
  }
  if (!scoutMatch) {
    console.error('⚠️ Could not find "#### scout" section in README.md');
  }

  // Exit if critical sections are missing
  if (!fluxMatch || !scoutMatch) {
    console.error('❌ Cannot update README - required sections not found');
    process.exit(1);
  }

  // Update flux description
  updated = updated.replace(
    toolsTableRegex,
    `#### flux\n\n${fluxDesc}\n\n`
  );

  // Update scout description
  updated = updated.replace(
    scoutTableRegex,
    `#### scout\n\n${scoutDesc}\n\n`
  );

  // Check if README needs updating
  if (updated === readme) {
    console.log('✓ README already up-to-date');
    return; // Success - no changes needed
  }

  // Write updated README
  await writeFile(readmePath, updated, 'utf-8');
  console.log('✅ README.md updated successfully');
}

updateReadme().catch((error) => {
  console.error('❌ Failed to update README:', error);
  process.exit(1);
});
