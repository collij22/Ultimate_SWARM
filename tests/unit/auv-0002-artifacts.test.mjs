// tests/unit/auv-0002-artifacts.test.mjs
import fs from 'fs';
import YAML from 'yaml';
import { test } from 'node:test';
import assert from 'node:assert';

test('AUV-0002 artifacts.required contains expected filenames', () => {
  const spec = YAML.parse(fs.readFileSync('capabilities/AUV-0002.yaml', 'utf8'));
  const required = spec?.artifacts?.required || [];

  assert(Array.isArray(required), 'artifacts.required must be an array');
  assert(required.length > 0, 'artifacts.required must not be empty');

  const expected = new Set([
    'runs/AUV-0002/ui/products_grid.png',
    'runs/AUV-0002/ui/product_detail.png',
    'runs/AUV-0002/perf/lighthouse.json',
  ]);

  for (const f of expected) {
    assert(
      required.includes(f),
      `Missing expected artifact: ${f}\nFound: ${JSON.stringify(required, null, 2)}`
    );
  }

  console.log('✅ AUV-0002 artifact names validated successfully');
});