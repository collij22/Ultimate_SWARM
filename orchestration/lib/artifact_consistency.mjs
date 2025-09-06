import assert from 'node:assert/strict';
import { expectedArtifacts as rbExpected } from '../runbooks/auv_delivery.mjs';
import { expectedArtifacts as cvfExpected } from '../cvf-check.mjs';

console.log('Checking artifact consistency between runbook and CVF...');

for (const id of ['AUV-0002','AUV-0003','AUV-0004','AUV-0005']) {
  const a = new Set(rbExpected(id));
  const b = new Set(cvfExpected(id));
  
  console.log(`\n${id}:`);
  console.log(`  Runbook expects: ${Array.from(a).join(', ')}`);
  console.log(`  CVF expects:     ${Array.from(b).join(', ')}`);
  
  assert.equal(a.size, b.size, `${id}: artifact counts differ (runbook: ${a.size}, CVF: ${b.size})`);
  for (const x of a) {
    assert.ok(b.has(x), `${id}: missing in CVF: ${x}`);
  }
  for (const x of b) {
    assert.ok(a.has(x), `${id}: missing in runbook: ${x}`);
  }
  console.log(`  ✅ Consistent (${a.size} artifacts)`);
}

console.log('\n✅ Artifact maps are consistent between runbook and CVF');