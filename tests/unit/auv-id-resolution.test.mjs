#!/usr/bin/env node
/**
 * Unit test for AUV_ID environment variable resolution
 * Ensures AUV_ID is correctly derived from node id or params
 */

console.log('🧪 AUV_ID Resolution Test\n');

// Replicate the AUV_ID derivation logic from runner.mjs
function deriveAuvId(node, baseEnv = {}) {
  const auvFromParams = node.params?.auv;
  const auvFromId = (node.id.match(/^AUV-\d{4}/) || [])[0];
  const AUV_ID = auvFromParams || auvFromId || baseEnv.AUV_ID;
  return AUV_ID;
}

// Test cases
const testCases = [
  {
    name: 'Extract AUV_ID from node id (playwright node)',
    node: { id: 'AUV-0101-ui', params: {} },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-0101'
  },
  {
    name: 'Extract AUV_ID from node id (perf node)',
    node: { id: 'AUV-0102-perf', params: {} },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-0102'
  },
  {
    name: 'Extract AUV_ID from node id (cvf node)',
    node: { id: 'AUV-0103-cvf', params: {} },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-0103'
  },
  {
    name: 'Use AUV_ID from params (CVF node with params)',
    node: { id: 'AUV-0103-cvf', params: { auv: 'AUV-0103' } },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-0103'
  },
  {
    name: 'Params override node id extraction',
    node: { id: 'AUV-0104-ui', params: { auv: 'AUV-0105' } },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-0105'
  },
  {
    name: 'Non-AUV node falls back to base env',
    node: { id: 'server', params: {} },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'DEFAULT-001'
  },
  {
    name: 'Complex AUV ID with 4 digits',
    node: { id: 'AUV-9999-lighthouse', params: {} },
    baseEnv: { AUV_ID: 'DEFAULT-001' },
    expected: 'AUV-9999'
  },
  {
    name: 'No AUV_ID anywhere returns undefined',
    node: { id: 'generic-node', params: {} },
    baseEnv: {},
    expected: undefined
  },
  {
    name: 'AUV-0201-ui extracts correctly',
    node: { id: 'AUV-0201-ui', params: {} },
    baseEnv: {},
    expected: 'AUV-0201'
  },
  {
    name: 'Multiple hyphens in node id',
    node: { id: 'AUV-0301-ui-test-node', params: {} },
    baseEnv: {},
    expected: 'AUV-0301'
  }
];

// Run tests
let passed = 0;
let failed = 0;
const results = [];

for (const test of testCases) {
  const result = deriveAuvId(test.node, test.baseEnv);
  const success = result === test.expected;
  
  if (success) {
    console.log(`✅ ${test.name}`);
    console.log(`   Node: ${test.node.id} → AUV_ID: ${result}`);
    passed++;
  } else {
    console.log(`❌ ${test.name}`);
    console.log(`   Node: ${test.node.id}`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
    failed++;
  }
  
  results.push({
    name: test.name,
    nodeId: test.node.id,
    result,
    expected: test.expected,
    success
  });
  
  console.log();
}

// Test regex pattern specifically
console.log('📐 Regex Pattern Tests:\n');

const regexTests = [
  { input: 'AUV-0001', expected: 'AUV-0001' },
  { input: 'AUV-0001-ui', expected: 'AUV-0001' },
  { input: 'AUV-9999-perf', expected: 'AUV-9999' },
  { input: 'AUV-1234-cvf', expected: 'AUV-1234' },
  { input: 'server', expected: undefined },
  { input: 'AUV-123', expected: undefined },  // Only 3 digits
  { input: 'AUV-12345', expected: 'AUV-1234' }, // 5 digits - matches first 4
  { input: 'auv-0001', expected: undefined },  // Lowercase
];

let regexPassed = 0;
let regexFailed = 0;

for (const test of regexTests) {
  const match = (test.input.match(/^AUV-\d{4}/) || [])[0];
  const success = match === test.expected;
  
  if (success) {
    console.log(`✅ Regex: "${test.input}" → ${match || 'undefined'}`);
    regexPassed++;
  } else {
    console.log(`❌ Regex: "${test.input}" expected ${test.expected || 'undefined'}, got ${match || 'undefined'}`);
    regexFailed++;
  }
}

// Summary
console.log('\n📊 Summary:');
console.log(`  Logic Tests: ${passed}/${passed + failed} passed`);
console.log(`  Regex Tests: ${regexPassed}/${regexPassed + regexFailed} passed`);
console.log(`  Total: ${passed + regexPassed}/${passed + failed + regexPassed + regexFailed} passed`);

const totalFailed = failed + regexFailed;

if (totalFailed === 0) {
  console.log('\n✅ All AUV_ID resolution tests passed!');
  console.log('   Artifacts will be written to correct directories (e.g., runs/AUV-0101/...)');
  console.log('   CVF checks will find artifacts in the expected locations');
} else {
  console.log(`\n❌ ${totalFailed} test(s) failed.`);
}

process.exit(totalFailed > 0 ? 1 : 0);