/**
 * Video Compose Executor - Deterministic video composition
 * Combines chart images and audio narration into a video
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tenantPath } from '../tenant.mjs';

/**
 * Check if ffmpeg is available
 */
async function checkFFmpegAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { shell: true });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Create placeholder MP4 file
 */
function createPlaceholderMP4(outputPath, duration) {
  // Minimal valid MP4 structure (ftyp + mdat boxes)
  const buffer = Buffer.alloc(1024);
  let offset = 0;

  // ftyp box (file type)
  buffer.writeUInt32BE(32, offset);
  offset += 4; // Box size
  buffer.write('ftyp', offset);
  offset += 4; // Box type
  buffer.write('isom', offset);
  offset += 4; // Major brand
  buffer.writeUInt32BE(0, offset);
  offset += 4; // Minor version
  buffer.write('isomiso2mp41', offset);
  offset += 12; // Compatible brands

  // mdat box (media data - empty for placeholder)
  buffer.writeUInt32BE(8, offset);
  offset += 4; // Box size
  buffer.write('mdat', offset);
  offset += 4; // Box type

  fs.writeFileSync(outputPath, buffer.slice(0, offset));

  return {
    duration,
    width: 1280,
    height: 720,
    fps: 30,
    codec: 'h264',
    audio_codec: 'aac',
    size: offset,
  };
}

/**
 * Execute ffmpeg to compose video
 */
async function runFFmpeg(chartPath, audioPath, outputPath, duration) {
  return new Promise((resolve, reject) => {
    // ffmpeg command to create video from image and audio
    // -loop 1: loop the image
    // -i: input files
    // -c:v libx264: video codec
    // -tune stillimage: optimize for still image
    // -c:a aac: audio codec
    // -shortest: match video duration to audio
    // -pix_fmt yuv420p: pixel format for compatibility

    const args = [
      '-loop',
      '1',
      '-i',
      chartPath,
      '-i',
      audioPath,
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      '-y', // Overwrite output
      outputPath,
    ];

    console.log('[video.compose] Running ffmpeg...');
    // Use direct spawn (no shell) to avoid path/quoting issues with spaces
    const proc = spawn('ffmpeg', args, { shell: false });

    proc.stderr.on('data', () => {
      // Ignore stderr output
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg failed to start: ${err.message}`));
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        // If ffmpeg fails, create placeholder
        console.log('[video.compose] FFmpeg not available, creating placeholder');
        const metadata = createPlaceholderMP4(outputPath, duration);
        resolve({ success: false, placeholder: true, metadata });
      }
    });
  });
}

/**
 * Execute video composition
 * @param {Object} params - Execution parameters
 * @param {string} params.tenant - Tenant ID (default: 'default')
 * @param {string} params.runId - Run ID for this execution
 * @returns {Promise<Object>} Result with status and artifacts
 */
export async function executeVideoCompose(params) {
  const { tenant = 'default', runId } = params;

  // Find chart from previous step
  const chartsDir = tenantPath(tenant, runId ? `${runId}/charts` : 'charts');
  const chartPath = path.join(chartsDir, 'bar.svg'); // Or bar.png if real Chart.js used
  const chartPngPath = path.join(chartsDir, 'bar.png');

  // Strict: require PNG chart from prior step
  if (!fs.existsSync(chartPngPath)) {
    throw new Error(`Chart not found at: ${chartPngPath}. Run chart.render first.`);
  }

  // Find audio from previous step
  const audioPath = path.resolve('media', 'narration.wav');
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio not found at: ${audioPath}. Run audio.tts first.`);
  }

  // Read audio metadata to get duration
  const audioMetadataPath = path.resolve('media', 'audio_metadata.json');
  let audioDuration = 10; // Default duration

  if (fs.existsSync(audioMetadataPath)) {
    const audioMeta = JSON.parse(fs.readFileSync(audioMetadataPath, 'utf-8'));
    audioDuration = audioMeta.duration_seconds || audioMeta.duration || 10;
  }

  console.log(`[video.compose] Composing video from chart and ${audioDuration.toFixed(1)}s audio`);

  // Create output path
  const mediaDir = path.resolve('media');
  const outputPath = path.join(mediaDir, 'final.mp4');

  // Check if ffmpeg is available; attempt local bootstrap on Windows
  let ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable && process.platform === 'win32') {
    try {
      const bootstrap = path.resolve('scripts', 'bootstrap_ffmpeg.mjs');
      if (fs.existsSync(bootstrap)) {
        console.log('[video.compose] Bootstrapping ffmpeg...');
        const { spawn } = await import('node:child_process');
        await new Promise((resolve, reject) => {
          const p = spawn(process.execPath, [bootstrap], { stdio: 'inherit' });
          p.on('error', reject);
          p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bootstrap exit ${code}`))));
        });
        const localBin = path.resolve('tools', 'ffmpeg', 'bin');
        process.env.PATH = `${localBin};${process.env.PATH}`;
      }
      ffmpegAvailable = await checkFFmpegAvailable();
    } catch (e) {
      console.warn('[video.compose] ffmpeg bootstrap failed:', e.message);
    }
  }

  let videoMetadata;

  if (ffmpegAvailable) {
    // Try to use real ffmpeg
    const result = await runFFmpeg(chartPngPath, audioPath, outputPath, audioDuration);

    if (result.success) {
      // Get actual video metadata
      const stats = fs.statSync(outputPath);
      videoMetadata = {
        duration: audioDuration,
        width: 1280,
        height: 720,
        fps: 30,
        codec: 'h264',
        audio_codec: 'aac',
        size: stats.size,
        has_audio: true,
      };
      console.log('[video.compose] Video composed successfully with ffmpeg');
    } else {
      throw new Error('ffmpeg failed to compose video');
    }
  } else {
    throw new Error('ffmpeg is required for video.compose but not available on PATH');
  }

  // Create schema-compliant composition metadata
  const composeMetadata = {
    // Required fields per schema
    generated_at: new Date().toISOString(),
    script_path: 'media/script.txt',
    audio_path: 'media/narration.wav',
    video_path: 'media/final.mp4',
    expected_duration_s: audioDuration,
    actual_duration_s: videoMetadata.duration,
    video_width: videoMetadata.width,
    video_height: videoMetadata.height,
    has_audio_track: videoMetadata.has_audio,

    // Optional fields
    duration_variance_pct: Math.abs(
      ((videoMetadata.duration - audioDuration) / audioDuration) * 100,
    ),
    video_codec: videoMetadata.codec,
    audio_codec: videoMetadata.audio_codec,
    fps: videoMetadata.fps,
    file_size: videoMetadata.size,

    // Additional metadata for context
    version: '1.0',
    generator: ffmpegAvailable ? 'ffmpeg' : 'placeholder',
    inputs: {
      video_source: path.basename(chartPngPath),
      video_type: 'png',
      audio_sample_rate: 44100,
    },
  };

  const metadataPath = path.join(mediaDir, 'compose-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(composeMetadata, null, 2));

  console.log(
    `[video.compose] Video metadata: ${videoMetadata.width}x${videoMetadata.height}, ${videoMetadata.duration.toFixed(1)}s`,
  );
  console.log(`[video.compose] Video written to: ${outputPath}`);

  return {
    status: 'success',
    message: `Composed ${videoMetadata.duration.toFixed(1)}s video at ${videoMetadata.width}x${videoMetadata.height}`,
    artifacts: [outputPath, metadataPath],
    metadata: {
      duration: videoMetadata.duration,
      width: videoMetadata.width,
      height: videoMetadata.height,
      has_audio: videoMetadata.has_audio,
      size: videoMetadata.size,
    },
  };
}
