#!/usr/bin/env node
/**
 * Artifact Consistency Check
 * Verifies alignment between expected artifacts definitions
 * Now uses shared module as single source of truth
 */

import assert from 'node:assert/strict';
import { expectedArtifacts, getAuvsWithArtifacts } from './expected_artifacts.mjs';

console.log('Checking artifact consistency (using shared module)...');

// Get all AUVs that have expected artifacts defined
const auvs = getAuvsWithArtifacts();

for (const id of auvs) {
  const artifacts = expectedArtifacts(id);

  // Ensure each AUV has at least one artifact defined
  assert(artifacts.length > 0, `${id}: no artifacts defined`);

  console.log(`\n${id}:`);
  console.log(`  Expected artifacts: ${artifacts.join(', ')}`);
  console.log(`  ✅ ${artifacts.length} artifacts defined`);
}

console.log('\n✅ All artifact definitions loaded from shared module successfully');
