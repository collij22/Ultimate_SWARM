/**
 * Synthetic test for video composition capability
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { validateMediaCompose } from '../../../orchestration/lib/media_validator.mjs';

test('video.compose fast-tier: produces final.mp4 with audio track (stub)', async () => {
  const testDir = 'runs/test-video-compose';
  const mediaDir = path.join(testDir, 'media');

  try {
    // Setup test directory
    await mkdir(mediaDir, { recursive: true });

    // Create mock script file
    const scriptContent = `Welcome to our demo video.
This video demonstrates our media composition pipeline.
The pipeline converts text to speech and combines it with visuals.
Thank you for watching.`;

    const scriptPath = path.join(mediaDir, 'script.txt');
    await writeFile(scriptPath, scriptContent);

    // Create mock audio file (just a placeholder)
    const audioPath = path.join(mediaDir, 'narration.mp3');
    await writeFile(audioPath, Buffer.from('mock audio data'));

    // Create mock video file (just a placeholder)
    const videoPath = path.join(mediaDir, 'final.mp4');
    await writeFile(videoPath, Buffer.from('mock video data'));

    // Create composition metadata
    const composeMetadata = {
      generated_at: new Date().toISOString(),
      script_path: 'media/script.txt',
      audio_path: 'media/narration.mp3',
      video_path: 'media/final.mp4',
      expected_duration_s: 30,
      actual_duration_s: 31.5,
      duration_variance_pct: 5.0,
      video_width: 1920,
      video_height: 1080,
      video_format: 'H.264',
      has_audio_track: true,
      audio_format: 'AAC',
      audio_bitrate: 128,
      video_bitrate: 2500,
      framerate: 30,
      file_size_bytes: 9437500, // ~9.4MB for 30s at 2.5Mbps
      slides: [
        {
          index: 0,
          duration_s: 8,
          image_path: 'media/slides/slide_001.png',
          transition: 'fade',
          narration_text: 'Welcome to our demo video.',
        },
        {
          index: 1,
          duration_s: 8,
          image_path: 'media/slides/slide_002.png',
          transition: 'crossfade',
          narration_text: 'This video demonstrates our media composition pipeline.',
        },
        {
          index: 2,
          duration_s: 9,
          image_path: 'media/slides/slide_003.png',
          transition: 'dissolve',
          narration_text: 'The pipeline converts text to speech and combines it with visuals.',
        },
        {
          index: 3,
          duration_s: 6.5,
          image_path: 'media/slides/slide_004.png',
          transition: 'fade',
          narration_text: 'Thank you for watching.',
        },
      ],
      tts_metadata: {
        engine: 'piper',
        voice: 'en_US-amy-medium',
        language: 'en-US',
        speed: 1.0,
        word_count: 24,
      },
      processing_time_ms: 4500,
      validation_passed: true,
      validation_messages: [],
    };

    // Write metadata file
    const metadataPath = path.join(mediaDir, 'compose-metadata.json');
    await writeFile(metadataPath, JSON.stringify(composeMetadata, null, 2));

    // Create thumbnails for slides (placeholders)
    const slidesDir = path.join(mediaDir, 'slides');
    await mkdir(slidesDir, { recursive: true });
    for (const slide of composeMetadata.slides) {
      const slidePath = path.join(testDir, slide.image_path);
      await mkdir(path.dirname(slidePath), { recursive: true });
      await writeFile(slidePath, Buffer.from('mock PNG data'));
    }

    // Validate the composition using the validator
    const validation = await validateMediaCompose(metadataPath, {
      validateFiles: false, // Skip actual file validation since we have placeholders
      duration_tolerance_pct: 10,
      min_width: 640,
      min_height: 480,
      required_audio_track: true,
    });

    // Assertions
    assert.ok(existsSync(scriptPath), 'Script file should exist');
    assert.ok(existsSync(audioPath), 'Audio file should exist');
    assert.ok(existsSync(videoPath), 'Video file should exist');
    assert.ok(existsSync(metadataPath), 'Metadata file should exist');

    assert.strictEqual(validation.valid, true, 'Composition should pass validation');
    assert.strictEqual(validation.schemaValid, true, 'Schema should be valid');
    assert.strictEqual(validation.durationValid, true, 'Duration should be within tolerance');
    assert.strictEqual(validation.dimensionsValid, true, 'Dimensions should meet requirements');
    assert.strictEqual(validation.audioTrackValid, true, 'Audio track should be present');

    // Test with stricter tolerances
    const strictValidation = await validateMediaCompose(metadataPath, {
      validateFiles: false,
      duration_tolerance_pct: 3, // Stricter tolerance
      min_width: 3840, // 4K requirement
      min_height: 2160,
    });

    assert.strictEqual(strictValidation.valid, false, 'Should fail with stricter requirements');
    assert.strictEqual(strictValidation.durationValid, false, 'Should fail duration check');
    assert.strictEqual(strictValidation.dimensionsValid, false, 'Should fail dimension check');

    // Test without audio track requirement
    const noAudioMetadata = { ...composeMetadata, has_audio_track: false };
    const noAudioPath = path.join(mediaDir, 'compose-metadata-noaudio.json');
    await writeFile(noAudioPath, JSON.stringify(noAudioMetadata, null, 2));

    const noAudioValidation = await validateMediaCompose(noAudioPath, {
      validateFiles: false,
      required_audio_track: false,
    });

    assert.strictEqual(
      noAudioValidation.valid,
      true,
      'Should pass without audio when not required',
    );
    assert.strictEqual(
      noAudioValidation.audioTrackValid,
      true,
      'Audio check should pass when not required',
    );
  } finally {
    // Cleanup
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  }
});
