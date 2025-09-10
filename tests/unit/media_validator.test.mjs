/**
 * Unit tests for media validation functions
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateMediaCompose } from '../../orchestration/lib/media_validator.mjs';
import { writeFile, rm, mkdir } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('Media Validator', () => {
  const tempDir = path.join(tmpdir(), 'media-validator-test');

  async function createTempFile(filename, content) {
    const filePath = path.join(tempDir, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return filePath;
  }

  // Clean up temp files after tests
  async function cleanup() {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {}
  }

  describe('validateMediaCompose', () => {
    it('should validate a correct media composition metadata', async () => {
      const validMetadata = {
        generated_at: new Date().toISOString(),
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 60,
        actual_duration_s: 61,
        duration_variance_pct: 1.67,
        video_width: 1920,
        video_height: 1080,
        video_format: 'H.264',
        has_audio_track: true,
        audio_format: 'AAC',
        framerate: 30,
        file_size_bytes: 5000000,
      };

      const metadataPath = await createTempFile(
        'compose-metadata.json',
        JSON.stringify(validMetadata),
      );
      const result = await validateMediaCompose(metadataPath, { validateFiles: false });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.schemaValid, true);
      assert.strictEqual(result.durationValid, true);
      assert.strictEqual(result.dimensionsValid, true);
      assert.strictEqual(result.audioTrackValid, true);
      assert.strictEqual(result.errors.length, 0);

      await cleanup();
    });

    it('should fail when duration variance exceeds tolerance', async () => {
      const metadata = {
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 60,
        actual_duration_s: 70, // 16.7% variance
        video_width: 1920,
        video_height: 1080,
        has_audio_track: true,
      };

      const metadataPath = await createTempFile('compose-metadata.json', JSON.stringify(metadata));
      const result = await validateMediaCompose(metadataPath, {
        validateFiles: false,
        duration_tolerance_pct: 10, // 10% tolerance
      });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.durationValid, false);
      assert.ok(result.errors.some((e) => e.includes('Duration variance')));

      await cleanup();
    });

    it('should fail when video dimensions are below minimum', async () => {
      const metadata = {
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 60,
        actual_duration_s: 60,
        video_width: 320, // Below default minimum
        video_height: 240, // Below default minimum
        has_audio_track: true,
      };

      const metadataPath = await createTempFile('compose-metadata.json', JSON.stringify(metadata));
      const result = await validateMediaCompose(metadataPath, {
        validateFiles: false,
        min_width: 640,
        min_height: 480,
      });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.dimensionsValid, false);
      assert.ok(result.errors.some((e) => e.includes('below minimum')));

      await cleanup();
    });

    it('should fail when audio track is missing and required', async () => {
      const metadata = {
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 60,
        actual_duration_s: 60,
        video_width: 1920,
        video_height: 1080,
        has_audio_track: false, // No audio track
      };

      const metadataPath = await createTempFile('compose-metadata.json', JSON.stringify(metadata));
      const result = await validateMediaCompose(metadataPath, {
        validateFiles: false,
        required_audio_track: true,
      });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.audioTrackValid, false);
      assert.ok(result.errors.some((e) => e.includes('missing audio track')));

      await cleanup();
    });

    it('should pass when audio track is missing but not required', async () => {
      const metadata = {
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 60,
        actual_duration_s: 60,
        video_width: 1920,
        video_height: 1080,
        has_audio_track: false,
      };

      const metadataPath = await createTempFile('compose-metadata.json', JSON.stringify(metadata));
      const result = await validateMediaCompose(metadataPath, {
        validateFiles: false,
        required_audio_track: false,
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.audioTrackValid, true);

      await cleanup();
    });

    it('should fail on invalid schema', async () => {
      const invalidMetadata = {
        // Missing required fields
        video_width: 1920,
        video_height: 1080,
      };

      const metadataPath = await createTempFile(
        'compose-metadata.json',
        JSON.stringify(invalidMetadata),
      );
      const result = await validateMediaCompose(metadataPath, { validateFiles: false });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.schemaValid, false);
      assert.ok(result.errors.some((e) => e.includes('Schema validation failed')));

      await cleanup();
    });

    it('should return error for non-existent file', async () => {
      const result = await validateMediaCompose('/non/existent/file.json');

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('File not found')));
    });

    it('should return error for invalid JSON', async () => {
      const metadataPath = await createTempFile('invalid.json', 'not valid json');
      const result = await validateMediaCompose(metadataPath);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Invalid JSON')));

      await cleanup();
    });

    it('should calculate duration variance correctly', async () => {
      const metadata = {
        script_path: 'script.txt',
        audio_path: 'audio.mp3',
        video_path: 'video.mp4',
        expected_duration_s: 100,
        actual_duration_s: 105, // 5% variance
        video_width: 1920,
        video_height: 1080,
        has_audio_track: true,
      };

      const metadataPath = await createTempFile('compose-metadata.json', JSON.stringify(metadata));
      const result = await validateMediaCompose(metadataPath, {
        validateFiles: false,
        duration_tolerance_pct: 10,
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.durationValid, true);
      assert.strictEqual(result.metadata.durationVariance, 0.05);

      await cleanup();
    });
  });
});
