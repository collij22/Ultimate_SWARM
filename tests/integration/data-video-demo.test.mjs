/**
 * Integration test for Data-to-Video Analytics Pipeline (AUV-1201)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';

/**
 * Run a command and capture output
 */
async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: true,
      env: { ...process.env, TEST_MODE: 'true' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

describe('Data-Video Demo Integration Tests', () => {
  it('should execute data.ingest capability', async () => {
    // Test data ingestion
    const { executeDataIngest } = await import(
      '../../orchestration/lib/deterministic/data_ingest_executor.mjs'
    );

    const result = await executeDataIngest({
      input: 'tests/fixtures/sample-data.csv',
      tenant: 'default',
      runId: 'test-data-ingest',
    });

    assert.equal(result.status, 'success');
    assert.ok(result.metadata.row_count >= 100, 'Should have at least 100 rows');
    assert.ok(result.artifacts.length > 0, 'Should produce artifacts');

    // Verify checksum manifest
    const manifestPath = path.resolve('runs/test-data-ingest/data/checksum_manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'Checksum manifest should exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.files.length, 2, 'Should have 2 files in manifest');
  });

  it('should execute data.insights capability', async () => {
    // Test insights generation
    const { executeDataInsights } = await import(
      '../../orchestration/lib/deterministic/data_insights_executor.mjs'
    );

    const result = await executeDataInsights({
      tenant: 'default',
      runId: 'test-data-ingest',
    });

    assert.equal(result.status, 'success');
    assert.ok(result.metadata.metric_count >= 3, 'Should generate at least 3 metrics');

    // Verify insights.json
    const insightsPath = path.resolve('runs/test-data-ingest/data/insights.json');
    assert.ok(fs.existsSync(insightsPath), 'Insights file should exist');

    const insights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
    assert.ok(insights.top_categories.length === 3, 'Should have top 3 categories');
    assert.ok(insights.metrics.length >= 3, 'Should have at least 3 metrics');
  });

  it('should execute chart.render capability', async () => {
    // Test chart rendering
    const { executeChartRender } = await import(
      '../../orchestration/lib/deterministic/chart_render_executor.mjs'
    );

    const result = await executeChartRender({
      tenant: 'default',
      runId: 'test-data-ingest',
    });

    assert.equal(result.status, 'success');
    assert.equal(result.metadata.width, 1280, 'Chart width should be 1280');
    assert.equal(result.metadata.height, 720, 'Chart height should be 720');

    // Verify chart files
    const chartPath = path.resolve('runs/test-data-ingest/charts/bar.svg');
    assert.ok(fs.existsSync(chartPath), 'Chart SVG should exist');

    // Verify PNG was also created
    const pngPath = path.resolve('runs/test-data-ingest/charts/bar.png');
    assert.ok(fs.existsSync(pngPath), 'Chart PNG should exist');
  });

  it('should generate valid PNG with proper content', async () => {
    const pngPath = path.resolve('runs/test-data-ingest/charts/bar.png');
    assert.ok(fs.existsSync(pngPath), 'PNG should exist from previous test');

    const pngData = fs.readFileSync(pngPath);

    // Validate PNG with decoder
    await new Promise((resolve, reject) => {
      const png = new PNG();

      png.on('parsed', function () {
        try {
          // Verify dimensions
          assert.equal(this.width, 1280, 'PNG width should be 1280');
          assert.equal(this.height, 720, 'PNG height should be 720');

          // Analyze pixel content
          const colorMap = new Map();
          let nonWhitePixels = 0;

          for (let i = 0; i < this.data.length; i += 4) {
            const r = this.data[i];
            const g = this.data[i + 1];
            const b = this.data[i + 2];
            const color = `${r},${g},${b}`;

            colorMap.set(color, (colorMap.get(color) || 0) + 1);

            if (r !== 255 || g !== 255 || b !== 255) {
              nonWhitePixels++;
            }
          }

          const pixelCount = this.width * this.height;
          const nonWhiteRatio = nonWhitePixels / pixelCount;

          console.log(
            `PNG Content: ${colorMap.size} unique colors, ${(nonWhiteRatio * 100).toFixed(2)}% non-white`,
          );

          // Validate chart has actual content
          assert.ok(
            colorMap.size >= 3,
            `Chart should have at least 3 colors (got ${colorMap.size})`,
          );
          assert.ok(
            nonWhiteRatio > 0.05,
            `Chart should have >5% non-white pixels (got ${(nonWhiteRatio * 100).toFixed(2)}%)`,
          );

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      png.on('error', reject);
      png.parse(pngData);
    });
  });

  it('should execute audio.tts capability', async () => {
    // Test TTS generation
    const { executeAudioTTS } = await import(
      '../../orchestration/lib/deterministic/audio_tts_executor.mjs'
    );

    const result = await executeAudioTTS({
      text: 'Test narration for demo',
      tenant: 'default',
      runId: 'test-data-ingest',
    });

    assert.equal(result.status, 'success');
    assert.ok(result.metadata.duration > 0, 'Audio should have duration');

    // Verify audio files
    const audioPath = path.resolve('media/narration.wav');
    assert.ok(fs.existsSync(audioPath), 'Audio file should exist');

    const scriptPath = path.resolve('media/script.txt');
    assert.ok(fs.existsSync(scriptPath), 'Script file should exist');
  });

  it('should execute video.compose capability', async () => {
    // Test video composition
    const { executeVideoCompose } = await import(
      '../../orchestration/lib/deterministic/video_compose_executor.mjs'
    );

    const result = await executeVideoCompose({
      tenant: 'default',
      runId: 'test-data-ingest',
    });

    assert.equal(result.status, 'success');
    assert.ok(result.metadata.has_audio, 'Video should have audio track');
    assert.equal(result.metadata.width, 1280, 'Video width should be 1280');
    assert.equal(result.metadata.height, 720, 'Video height should be 720');

    // Verify video files
    const videoPath = path.resolve('media/final.mp4');
    assert.ok(fs.existsSync(videoPath), 'Video file should exist');

    const metadataPath = path.resolve('media/compose-metadata.json');
    assert.ok(fs.existsSync(metadataPath), 'Compose metadata should exist');

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    assert.ok(metadata.has_audio_track, 'Video should have audio track');
  });

  it('should run full data-video-demo DAG successfully', { timeout: 60000 }, async () => {
    // Run the full DAG
    const dagPath = path.resolve('orchestration/graph/projects/data-video-demo.yaml');

    const result = await runCommand('node', ['orchestration/graph/runner.mjs', `"${dagPath}"`]);

    // Check exit code
    if (result.code !== 0) {
      console.error('DAG failed with stderr:', result.stderr);
      console.error('DAG stdout:', result.stdout);
    }
    assert.equal(result.code, 0, 'DAG should complete successfully');

    // Verify key outputs
    assert.ok(result.stdout.includes('[data.ingest]'), 'Should execute data ingest');
    assert.ok(result.stdout.includes('[data.insights]'), 'Should execute insights');
    assert.ok(result.stdout.includes('[chart.render]'), 'Should execute chart render');
    assert.ok(result.stdout.includes('[audio.tts]'), 'Should execute TTS');
    assert.ok(result.stdout.includes('[video.compose]'), 'Should execute video compose');
  });
});
