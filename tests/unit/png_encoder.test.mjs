/**
 * PNG Encoder Unit Test
 * Validates that our custom PNG encoder produces valid, decodeable PNG files
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { executeChartRender } from '../../orchestration/lib/deterministic/chart_render_executor.mjs';
import { executeDataIngest } from '../../orchestration/lib/deterministic/data_ingest_executor.mjs';
import { executeDataInsights } from '../../orchestration/lib/deterministic/data_insights_executor.mjs';

describe('PNG Encoder Validation', () => {
  const testRunId = 'test-png-encoder';
  const testTenant = 'default';
  let chartPath;

  before(async () => {
    // Create test data pipeline
    console.log('Setting up test data...');

    // Run data ingest
    await executeDataIngest({
      input: 'tests/fixtures/sample-data.csv',
      tenant: testTenant,
      runId: testRunId,
    });

    // Run data insights
    await executeDataInsights({
      tenant: testTenant,
      runId: testRunId,
    });
  });

  after(() => {
    // Clean up test artifacts
    const testDirs = [
      `runs/${testRunId}`,
      `runs/default/${testRunId}`,
    ];

    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('should generate a valid PNG that can be decoded', async () => {
    // Generate chart
    const result = await executeChartRender({
      tenant: testTenant,
      runId: testRunId,
    });

    assert.equal(result.status, 'success', 'Chart render should succeed');

    // Find the PNG path
    chartPath = result.artifacts.find(a => a.endsWith('.png'));
    assert.ok(chartPath, 'Should have generated a PNG file');
    assert.ok(fs.existsSync(chartPath), 'PNG file should exist');
  });

  it('should decode PNG with correct dimensions', async () => {
    // Read and decode the PNG
    const pngData = fs.readFileSync(chartPath);

    await new Promise((resolve, reject) => {
      const png = new PNG();

      png.on('parsed', function() {
        try {
          // Verify dimensions
          assert.equal(this.width, 1280, 'PNG width should be 1280');
          assert.equal(this.height, 720, 'PNG height should be 720');

          console.log(`✓ PNG decoded successfully: ${this.width}x${this.height}`);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      png.on('error', reject);

      // Parse the PNG
      png.parse(pngData);
    });
  });

  it('should have non-uniform pixel content (not blank)', async () => {
    const pngData = fs.readFileSync(chartPath);

    await new Promise((resolve, reject) => {
      const png = new PNG();

      png.on('parsed', function() {
        try {
          const pixels = this.data;
          const pixelCount = this.width * this.height;

          // Build color histogram
          const colorMap = new Map();

          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const color = `${r},${g},${b}`;

            colorMap.set(color, (colorMap.get(color) || 0) + 1);
          }

          // Check for diversity
          const uniqueColors = colorMap.size;
          const dominantColorCount = Math.max(...colorMap.values());
          const dominantColorRatio = dominantColorCount / pixelCount;

          console.log(`Color analysis: ${uniqueColors} unique colors`);
          console.log(`Dominant color ratio: ${(dominantColorRatio * 100).toFixed(2)}%`);

          // Should have multiple colors (not monochrome)
          assert.ok(uniqueColors >= 3, `Should have at least 3 colors, got ${uniqueColors}`);

          // No single color should dominate more than 95%
          assert.ok(dominantColorRatio < 0.95,
            `Image too uniform: ${(dominantColorRatio * 100).toFixed(2)}% is same color`);

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      png.on('error', reject);
      png.parse(pngData);
    });
  });

  it('should have chart-like content patterns', async () => {
    const pngData = fs.readFileSync(chartPath);

    await new Promise((resolve, reject) => {
      const png = new PNG();

      png.on('parsed', function() {
        try {
          const { width, height, data } = this;

          // Check for bar-like vertical structures
          // Sample middle row to look for color changes (bars)
          const middleY = Math.floor(height / 2);
          let colorChanges = 0;
          let lastColor = null;

          for (let x = 0; x < width; x++) {
            const idx = (middleY * width + x) * 4;
            const color = `${data[idx]},${data[idx+1]},${data[idx+2]}`;

            if (lastColor && lastColor !== color) {
              colorChanges++;
            }
            lastColor = color;
          }

          console.log(`Detected ${colorChanges} color transitions in middle row`);

          // Should have at least some color changes (bars + background)
          assert.ok(colorChanges >= 4,
            `Should have bar-like structures, found ${colorChanges} transitions`);

          // Check for non-white pixels (actual chart content)
          let nonWhitePixels = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 255 || data[i+1] !== 255 || data[i+2] !== 255) {
              nonWhitePixels++;
            }
          }

          const nonWhiteRatio = nonWhitePixels / (width * height);
          console.log(`Non-white pixel ratio: ${(nonWhiteRatio * 100).toFixed(2)}%`);

          // Should have at least 5% non-white pixels (chart content)
          assert.ok(nonWhiteRatio > 0.05,
            `Chart should have visible content, only ${(nonWhiteRatio * 100).toFixed(2)}% non-white`);

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      png.on('error', reject);
      png.parse(pngData);
    });
  });

  it('should have valid PNG chunk structure', async () => {
    const pngData = fs.readFileSync(chartPath);

    // Check PNG signature
    const signature = pngData.slice(0, 8);
    const expectedSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    assert.deepEqual(signature, expectedSignature, 'PNG signature should be valid');

    // Parse chunks
    let offset = 8;
    const chunks = [];

    while (offset < pngData.length) {
      const length = pngData.readUInt32BE(offset);
      const type = pngData.slice(offset + 4, offset + 8).toString('ascii');

      chunks.push({ type, length });

      // Move to next chunk (length + type + data + crc)
      offset += 12 + length;

      if (type === 'IEND') break;
    }

    console.log('PNG chunks:', chunks.map(c => c.type).join(', '));

    // Verify required chunks
    const chunkTypes = chunks.map(c => c.type);
    assert.ok(chunkTypes.includes('IHDR'), 'Should have IHDR chunk');
    assert.ok(chunkTypes.includes('IDAT'), 'Should have IDAT chunk');
    assert.ok(chunkTypes.includes('IEND'), 'Should have IEND chunk');

    // IHDR should be first
    assert.equal(chunks[0].type, 'IHDR', 'IHDR should be first chunk');

    // IEND should be last
    assert.equal(chunks[chunks.length - 1].type, 'IEND', 'IEND should be last chunk');
  });

  it('should compress data efficiently', async () => {
    const pngData = fs.readFileSync(chartPath);
    const fileSize = pngData.length;

    // For a 1280x720 RGBA image, uncompressed would be ~3.7MB
    const uncompressedSize = 1280 * 720 * 4;
    const compressionRatio = fileSize / uncompressedSize;

    console.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`Compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

    // Should have reasonable compression (chart with large uniform areas)
    assert.ok(compressionRatio < 0.5,
      `Compression too poor: ${(compressionRatio * 100).toFixed(2)}% of uncompressed`);

    // But not suspiciously small (indicates no real content)
    assert.ok(fileSize > 5000,
      `File too small (${fileSize} bytes), likely missing content`);
  });
});
