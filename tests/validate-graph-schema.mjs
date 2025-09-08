#!/usr/bin/env node
/**
 * Standalone graph schema validation test
 * Validates demo graphs against the schema
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import Ajv from 'ajv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Graph Schema Validation Test\n');

// Load the schema
const schemaPath = path.join(__dirname, '../orchestration/graph/spec.schema.yaml');
const schema = yaml.parse(fs.readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

// Test demo files
const demoFiles = [
  'demo-validation.yaml',
  'working-demo.yaml',
  'compiled-demo.yaml',
  'demo-01.yaml',
  'minimal-test.yaml',
];

let passed = 0;
let failed = 0;
const results = [];

for (const file of demoFiles) {
  const graphPath = path.join(__dirname, '../orchestration/graph/projects/', file);

  if (fs.existsSync(graphPath)) {
    const graph = /** @type {any} */ (yaml.parse(fs.readFileSync(graphPath, 'utf8')));
    const valid = validate(graph);

    if (valid) {
      console.log(`✅ ${file} is valid`);
      console.log(
        `   Project: ${graph.project_id}, Nodes: ${graph.nodes.length}, Edges: ${graph.edges?.length || 0}`,
      );
      passed++;
      results.push({ file, valid: true, project: graph.project_id });
    } else {
      console.log(`❌ ${file} is invalid:`);
      validate.errors.forEach((err) => {
        console.log(`   ${err.instancePath}: ${err.message}`);
      });
      failed++;
      results.push({ file, valid: false, errors: validate.errors });
    }
  } else {
    console.log(`⚠️ ${file} not found`);
  }
  console.log();
}

// Test schema constraints
console.log('📋 Testing Schema Constraints:\n');

const constraintTests = [
  {
    name: 'Invalid version',
    graph: { version: '2.0', project_id: 'test', nodes: [] },
    expectValid: false,
  },
  {
    name: 'Valid minimal graph',
    graph: { version: '1.0', project_id: 'test', nodes: [] },
    expectValid: true,
  },
  {
    name: 'Invalid node type',
    graph: {
      version: '1.0',
      project_id: 'test',
      nodes: [{ id: 'test', type: 'invalid_type' }],
    },
    expectValid: false,
  },
  {
    name: 'Valid node types',
    graph: {
      version: '1.0',
      project_id: 'test',
      nodes: [
        { id: 'n1', type: 'server' },
        { id: 'n2', type: 'playwright', params: { specs: ['test.ts'] } },
        { id: 'n3', type: 'lighthouse', params: { url: 'http://test', out: 'test.json' } },
        { id: 'n4', type: 'cvf', params: { auv: 'AUV-0001' } },
      ],
    },
    expectValid: true,
  },
  {
    name: 'Invalid concurrency (too high)',
    graph: { version: '1.0', project_id: 'test', concurrency: 11, nodes: [] },
    expectValid: false,
  },
  {
    name: 'Valid concurrency',
    graph: { version: '1.0', project_id: 'test', concurrency: 5, nodes: [] },
    expectValid: true,
  },
];

let constraintPassed = 0;
let constraintFailed = 0;

for (const test of constraintTests) {
  const valid = validate(test.graph);
  const result = valid === test.expectValid;

  if (result) {
    console.log(`✅ ${test.name}`);
    constraintPassed++;
  } else {
    console.log(`❌ ${test.name}`);
    if (!valid && validate.errors) {
      validate.errors.forEach((err) => {
        console.log(`   ${err.instancePath}: ${err.message}`);
      });
    }
    constraintFailed++;
  }
}

// Summary
console.log('\n📊 Summary:');
console.log(`  Graph Files: ${passed}/${passed + failed} valid`);
console.log(`  Constraints: ${constraintPassed}/${constraintPassed + constraintFailed} passed`);
console.log(
  `  Total: ${passed + constraintPassed}/${passed + failed + constraintPassed + constraintFailed} passed`,
);

const exitCode = failed + constraintFailed > 0 ? 1 : 0;
process.exit(exitCode);
