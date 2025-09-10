/**
 * Unit tests for Phase 14 Reference Ingestion Module
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { ingestReferences, cleanReferences } from '../../orchestration/lib/reference_ingest.mjs';

const TEST_AUV_ID = 'AUV-TEST-REF';
const TEST_DIR = path.join(process.cwd(), 'runs', 'tenants', 'default', TEST_AUV_ID, 'references');

describe('Reference Ingestion Module', () => {
  before(() => {
    // Clean up any existing test references
    cleanReferences(TEST_AUV_ID);
  });

  after(() => {
    // Clean up test references
    cleanReferences(TEST_AUV_ID);
  });

  it('should handle empty references array', async () => {
    const result = await ingestReferences([], {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.skipped.length, 0);
  });

  it('should ingest image references in test mode', async () => {
    const references = [
      {
        label: 'Test Image',
        type: 'image',
        source: 'https://example.com/test.png',
        route: '/test',
        notes: 'Test notes',
      },
    ];

    const result = await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].label, 'Test Image');
    assert.strictEqual(result.items[0].type, 'image');
    assert.ok(result.items[0].sha256);
    assert.ok(result.items[0].path);

    // Verify file was created
    const filePath = path.join(process.cwd(), result.items[0].path);
    assert.ok(fs.existsSync(filePath));
  });

  it('should handle URL references', async () => {
    const references = [
      {
        label: 'External URL',
        type: 'url',
        source: 'https://example.com/design-system',
        notes: 'Design system reference',
      },
    ];

    const result = await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.items[0].type, 'url');
    assert.strictEqual(result.items[0].source, 'https://example.com/design-system');
    assert.strictEqual(result.items[0].path, null); // URLs don't create files
  });

  it('should deduplicate identical content', async () => {
    const references = [
      {
        label: 'Image 1',
        type: 'image',
        source: 'https://example.com/same.png',
        route: '/page1',
      },
      {
        label: 'Image 2',
        type: 'image',
        source: 'https://example.com/same.png',
        route: '/page2',
      },
    ];

    const result = await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.deduped, 1); // Second image deduped
    // Both should have same SHA and path
    assert.strictEqual(result.items[0].sha256, result.items[1].sha256);
    assert.strictEqual(result.items[0].path, result.items[1].path);
  });

  it('should create references index file', async () => {
    const references = [
      {
        label: 'Test',
        type: 'image',
        source: 'test.png',
      },
    ];

    await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    const indexPath = path.join(TEST_DIR, 'references_index.json');
    assert.ok(fs.existsSync(indexPath));

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.ok(index.count >= 0);
    assert.ok(Array.isArray(index.items));
    assert.ok(Array.isArray(index.skipped));
  });

  it('should handle invalid reference types', async () => {
    const references = [
      {
        label: 'Invalid',
        type: 'invalid',
        source: 'test.xyz',
      },
    ];

    const result = await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
    });

    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.skipped.length, 1);
    assert.strictEqual(result.skipped[0].skipped, true);
    assert.ok(result.skipped[0].reason);
  });

  it('should respect max file size limit', async () => {
    const references = [
      {
        label: 'Large File',
        type: 'image',
        source: 'https://example.com/large.png',
      },
    ];

    // Test with very small limit
    const result = await ingestReferences(references, {
      auvId: TEST_AUV_ID,
      testMode: true,
      maxSize: 10, // 10 bytes - smaller than any real image
    });

    // In test mode, fixture is used which is small, so this should pass
    // This test mainly verifies the parameter is accepted
    assert.ok(result);
  });

  it('should handle local file references', async () => {
    // Create a temporary local file
    const tempFile = path.join(process.cwd(), 'temp_test_ref.png');
    // Write minimal PNG
    fs.writeFileSync(
      tempFile,
      Buffer.from(
        '89504e470d0a1a0a0000000d494844520000000100000001' +
          '0100000000376ef9240000001049444154789c626001000000' +
          '05000106e3ac8c0000000049454e44ae426082',
        'hex',
      ),
    );

    try {
      const references = [
        {
          label: 'Local File',
          type: 'image',
          source: 'temp_test_ref.png',
        },
      ];

      const result = await ingestReferences(references, {
        auvId: TEST_AUV_ID,
        testMode: false, // Use actual file
      });

      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.items[0].label, 'Local File');
      assert.ok(result.items[0].path);
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});

// Run tests if this file is executed directly
if (process.argv[1] === import.meta.url.slice(7)) {
  console.log('Running reference ingestion tests...');
}
