#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { validateChart, validateCharts } from '../../orchestration/lib/chart_validator.mjs';

const TEST_DIR = 'test-temp-chart-validator';

// Create a minimal valid PNG buffer
function createPNG(width, height) {
  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Length + Type + Data + CRC
  const ihdrChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]), // length
    Buffer.from('IHDR'),
    ihdr,
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // simplified CRC
  ]);
  chunks.push(ihdrChunk);

  // IDAT chunk (minimal compressed data)
  const idatData = Buffer.from([
    0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01,
  ]);
  const idatChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, idatData.length]),
    Buffer.from('IDAT'),
    idatData,
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  chunks.push(idatChunk);

  // IEND chunk
  chunks.push(
    Buffer.from([
      0x00,
      0x00,
      0x00,
      0x00, // length
      0x49,
      0x45,
      0x4e,
      0x44, // IEND
      0xae,
      0x42,
      0x60,
      0x82, // CRC
    ]),
  );

  return Buffer.concat(chunks);
}

test('chart_validator', async (t) => {
  // Setup test directory
  await t.before(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
  });

  // Cleanup
  await t.after(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  await t.test('validates valid PNG chart', async () => {
    const pngBuffer = createPNG(1024, 768);
    // Add some data to make it look like it has content
    const chartBuffer = Buffer.concat([pngBuffer, Buffer.alloc(25000)]);

    const chartPath = path.join(TEST_DIR, 'valid-chart.png');
    await writeFile(chartPath, chartBuffer);

    const result = await validateChart(chartPath);

    assert.equal(result.valid, true);
    assert.equal(result.exists, true);
    assert.equal(result.isPNG, true);
    assert.equal(result.dimensionsValid, true);
    assert.equal(result.metadata.width, 1024);
    assert.equal(result.metadata.height, 768);
  });

  await t.test('fails on missing file', async () => {
    const result = await validateChart('non-existent.png');

    assert.equal(result.valid, false);
    assert.equal(result.exists, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal(result.errors[0].includes('not found'), true);
  });

  await t.test('fails on non-PNG file', async () => {
    const jpegPath = path.join(TEST_DIR, 'not-a-png.jpg');
    await writeFile(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG header

    const result = await validateChart(jpegPath);

    assert.equal(result.valid, false);
    assert.equal(result.isPNG, false);
    assert.equal(
      result.errors.some((e) => e.includes('not a valid PNG')),
      true,
    );
  });

  await t.test('fails on dimensions below minimum', async () => {
    const smallPNG = createPNG(400, 300);
    const chartPath = path.join(TEST_DIR, 'small-chart.png');
    await writeFile(chartPath, smallPNG);

    const result = await validateChart(chartPath, { minWidth: 800, minHeight: 600 });

    assert.equal(result.valid, false);
    assert.equal(result.dimensionsValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('below minimum')),
      true,
    );
  });

  await t.test('warns on blank/uniform content', async () => {
    const blankPNG = createPNG(800, 600);
    // Small file size suggests blank content
    const chartPath = path.join(TEST_DIR, 'blank-chart.png');
    await writeFile(chartPath, blankPNG);

    const result = await validateChart(chartPath);

    assert.equal(result.valid, false); // Fails by default
    assert.equal(result.hasContent, false);
    assert.equal(
      result.warnings.some((w) => w.includes('blank')),
      true,
    );
  });

  await t.test('allows blank content with requireContent=false', async () => {
    const blankPNG = createPNG(800, 600);
    const chartPath = path.join(TEST_DIR, 'blank-allowed.png');
    await writeFile(chartPath, blankPNG);

    const result = await validateChart(chartPath, { requireContent: false });

    assert.equal(result.valid, true);
    assert.equal(result.hasContent, false);
    assert.equal(
      result.warnings.some((w) => w.includes('blank')),
      true,
    );
  });

  await t.test('validates multiple charts', async () => {
    // Create 3 charts: 2 valid, 1 invalid
    const chart1 = createPNG(1024, 768);
    const chart2 = createPNG(800, 600);
    const chart3 = createPNG(400, 300); // Too small

    // Add content to make them look non-blank
    const validChart1 = Buffer.concat([chart1, Buffer.alloc(30000)]);
    const validChart2 = Buffer.concat([chart2, Buffer.alloc(25000)]);

    const paths = [
      path.join(TEST_DIR, 'chart1.png'),
      path.join(TEST_DIR, 'chart2.png'),
      path.join(TEST_DIR, 'chart3.png'),
    ];

    await writeFile(paths[0], validChart1);
    await writeFile(paths[1], validChart2);
    await writeFile(paths[2], chart3);

    const results = await validateCharts(paths);

    assert.equal(results.valid, false);
    assert.equal(results.total, 3);
    assert.equal(results.passed, 2);
    assert.equal(results.failed, 1);
    assert.equal(
      results.errors.some((e) => e.includes('chart3.png')),
      true,
    );
  });

  await t.test('calculates SHA-256 checksum', async () => {
    const pngBuffer = createPNG(800, 600);
    const chartPath = path.join(TEST_DIR, 'checksum-test.png');
    await writeFile(chartPath, pngBuffer);

    const result = await validateChart(chartPath, { requireContent: false });

    assert.equal(result.valid, true);
    assert.equal(typeof result.metadata.sha256, 'string');
    assert.equal(result.metadata.sha256.length, 64); // SHA-256 hex length
  });

  await t.test('warns on unusual aspect ratio', async () => {
    const widePNG = createPNG(2400, 600); // 4:1 aspect ratio
    const wideChart = Buffer.concat([widePNG, Buffer.alloc(25000)]);
    const chartPath = path.join(TEST_DIR, 'wide-chart.png');
    await writeFile(chartPath, wideChart);

    const result = await validateChart(chartPath);

    assert.equal(result.valid, true);
    assert.equal(
      result.warnings.some((w) => w.includes('aspect ratio')),
      true,
    );
    assert.equal(result.metadata.aspectRatio, '4.00');
  });

  await t.test('handles custom dimension requirements', async () => {
    const hdPNG = createPNG(1920, 1080);
    const hdChart = Buffer.concat([hdPNG, Buffer.alloc(50000)]);
    const chartPath = path.join(TEST_DIR, 'hd-chart.png');
    await writeFile(chartPath, hdChart);

    const result = await validateChart(chartPath, {
      minWidth: 1920,
      minHeight: 1080,
    });

    assert.equal(result.valid, true);
    assert.equal(result.dimensionsValid, true);
    assert.equal(result.metadata.width, 1920);
    assert.equal(result.metadata.height, 1080);
  });
});
