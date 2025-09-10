#!/usr/bin/env node
/**
 * Media Validator for audio/video files
 *
 * Validates media composition outputs including duration tolerance,
 * format requirements, and track presence.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Default validation parameters
const DEFAULT_DURATION_TOLERANCE = 0.05; // 5% variance allowed
const DEFAULT_MIN_WIDTH = 1920;
const DEFAULT_MIN_HEIGHT = 1080;

/**
 * Load and compile media compose schema
 */
async function loadSchema() {
  const schemaPath = path.resolve(process.cwd(), 'schemas', 'media-compose.schema.json');
  const schemaData = await readFile(schemaPath, 'utf8');
  const schema = JSON.parse(schemaData);

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Get media info using ffprobe (if available)
 * @param {string} mediaPath - Path to media file
 * @returns {Promise<Object|null>} Media info or null if ffprobe not available
 */
async function getMediaInfo(mediaPath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      mediaPath,
    ]);

    let output = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      // Error output captured but not used - ffprobe outputs info to stderr sometimes
      data.toString();
    });

    ffprobe.on('error', () => {
      // ffprobe not available
      resolve(null);
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(output);
          resolve(info);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Extract media metadata from ffprobe output
 * @param {Object} info - ffprobe JSON output
 * @returns {Object} Extracted metadata
 */
function extractMediaMetadata(info) {
  const metadata = {
    duration: 0,
    width: 0,
    height: 0,
    hasVideo: false,
    hasAudio: false,
    videoCodec: null,
    audioCodec: null,
    bitrate: 0,
    framerate: 0,
  };

  if (info.format) {
    metadata.duration = parseFloat(info.format.duration) || 0;
    metadata.bitrate = parseInt(info.format.bit_rate) || 0;
  }

  if (info.streams) {
    info.streams.forEach((stream) => {
      if (stream.codec_type === 'video') {
        metadata.hasVideo = true;
        metadata.width = stream.width || 0;
        metadata.height = stream.height || 0;
        metadata.videoCodec = stream.codec_name;

        // Parse framerate
        if (stream.r_frame_rate) {
          const [num, den] = stream.r_frame_rate.split('/');
          metadata.framerate = parseInt(num) / parseInt(den);
        }
      } else if (stream.codec_type === 'audio') {
        metadata.hasAudio = true;
        metadata.audioCodec = stream.codec_name;
      }
    });
  }

  return metadata;
}

/**
 * Validate media composition metadata
 * @param {string} metadataPath - Path to media-compose.json
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateMediaCompose(metadataPath, options = {}) {
  const result = {
    valid: true,
    schemaValid: false,
    durationValid: false,
    dimensionsValid: false,
    audioTrackValid: false,
    fileChecksValid: false,
    errors: [],
    warnings: [],
    metadata: {},
    data: null,
  };

  // Check file exists
  if (!existsSync(metadataPath)) {
    result.valid = false;
    result.errors.push(`File not found: ${metadataPath}`);
    return result;
  }

  try {
    // Load metadata (robust JSON parsing)
    const metadataContent = await readFile(metadataPath, 'utf8');
    let metadata;
    try {
      metadata = JSON.parse(metadataContent);
    } catch (e) {
      result.valid = false;
      result.errors.push('Invalid JSON');
      return result;
    }
    result.data = metadata;

    // Validate against schema
    const validate = await loadSchema();
    const schemaValid = validate(metadata);
    result.schemaValid = schemaValid;

    if (!schemaValid) {
      result.valid = false;
      result.errors.push('Schema validation failed');
      if (validate.errors) {
        validate.errors.forEach((err) => {
          result.errors.push(`  ${err.instancePath || '/'}: ${err.message}`);
        });
      }
      return result;
    }

    // Validate duration tolerance
    const tolerancePct = options.duration_tolerance_pct ?? options.durationTolerance;
    const tolerance = tolerancePct ? tolerancePct / 100 : DEFAULT_DURATION_TOLERANCE;
    const expectedDuration = metadata.expected_duration_s;
    const actualDuration = metadata.actual_duration_s;
    const variance = Math.abs(actualDuration - expectedDuration) / expectedDuration;

    if (variance > tolerance) {
      result.valid = false;
      result.durationValid = false;
      result.errors.push(
        `Duration variance ${(variance * 100).toFixed(1)}% exceeds tolerance ${(tolerance * 100).toFixed(1)}%`,
      );
    } else {
      result.durationValid = true;
    }

    // Store metadata
    result.metadata.expectedDuration = expectedDuration;
    result.metadata.actualDuration = actualDuration;
    result.metadata.durationVariance = variance;

    // Validate dimensions
    const minWidth = options.min_width || options.minWidth || DEFAULT_MIN_WIDTH;
    const minHeight = options.min_height || options.minHeight || DEFAULT_MIN_HEIGHT;

    if (metadata.video_width < minWidth || metadata.video_height < minHeight) {
      result.valid = false;
      result.dimensionsValid = false;
      result.errors.push(
        `Video dimensions ${metadata.video_width}x${metadata.video_height} below minimum ${minWidth}x${minHeight}`,
      );
    } else {
      result.dimensionsValid = true;
    }

    // Validate audio track presence if required
    const requireAudio = options.required_audio_track ?? true;
    if (requireAudio && !metadata.has_audio_track) {
      result.valid = false;
      result.audioTrackValid = false;
      result.errors.push('Video missing audio track');
    } else {
      result.audioTrackValid = true;
    }

    // Validate actual files if paths provided
    if (options.validateFiles !== false) {
      const filesToCheck = [metadata.script_path, metadata.audio_path, metadata.video_path];

      const missingFiles = [];
      for (const filePath of filesToCheck) {
        if (filePath && !existsSync(filePath)) {
          missingFiles.push(filePath);
        }
      }

      if (missingFiles.length > 0) {
        result.fileChecksValid = false;
        result.warnings.push(`Referenced files not found: ${missingFiles.join(', ')}`);
      } else {
        result.fileChecksValid = true;

        // If ffprobe available, validate actual video file
        if (metadata.video_path && existsSync(metadata.video_path)) {
          const mediaInfo = await getMediaInfo(metadata.video_path);

          if (mediaInfo) {
            const extracted = extractMediaMetadata(mediaInfo);

            // Compare with metadata
            if (Math.abs(extracted.duration - actualDuration) > 1) {
              result.warnings.push(
                `Actual video duration (${extracted.duration.toFixed(1)}s) differs from metadata`,
              );
            }

            if (
              extracted.hasVideo &&
              (extracted.width !== metadata.video_width ||
                extracted.height !== metadata.video_height)
            ) {
              result.warnings.push(
                `Actual dimensions (${extracted.width}x${extracted.height}) differ from metadata`,
              );
            }

            result.metadata.ffprobeData = extracted;
          } else {
            result.warnings.push('ffprobe not available for deep validation');
          }
        }
      }
    }

    // Check TTS metadata if present
    if (metadata.tts_metadata) {
      if (!metadata.tts_metadata.word_count || metadata.tts_metadata.word_count < 10) {
        result.warnings.push('Script appears to have very few words');
      }
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Error processing media metadata: ${error.message}`);
  }

  return result;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Media Validator for composition metadata

Usage:
  node media_validator.mjs <media-compose.json> [options]

Options:
  --tolerance <0-1>      Duration tolerance as decimal (default: ${DEFAULT_DURATION_TOLERANCE})
  --min-width <N>        Minimum video width (default: ${DEFAULT_MIN_WIDTH})
  --min-height <N>       Minimum video height (default: ${DEFAULT_MIN_HEIGHT})
  --no-file-checks       Skip validation of referenced files

Examples:
  node media_validator.mjs media/compose-metadata.json
  node media_validator.mjs media/compose-metadata.json --tolerance 0.1
  node media_validator.mjs media/compose-metadata.json --min-width 1280 --min-height 720

Exit codes:
  0 - Validation passed
  1 - Validation failed
  308 - Media validation failure (reserved for CVF)
`);
    process.exit(0);
  }

  const metadataPath = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--tolerance' && args[i + 1]) {
      options.durationTolerance = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--min-width' && args[i + 1]) {
      options.minWidth = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--min-height' && args[i + 1]) {
      options.minHeight = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--no-file-checks') {
      options.validateFiles = false;
    }
  }

  try {
    const result = await validateMediaCompose(metadataPath, options);

    console.log(`\nValidation: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Schema: ${result.schemaValid ? '✓' : '✗'}`);
    console.log(`  Duration: ${result.durationValid ? '✓' : '✗'}`);
    console.log(`  Dimensions: ${result.dimensionsValid ? '✓' : '✗'}`);
    console.log(`  Audio Track: ${result.audioTrackValid ? '✓' : '✗'}`);
    console.log(`  File Checks: ${result.fileChecksValid ? '✓' : '✗'}`);

    if (result.metadata) {
      console.log('\nMetadata:');
      if (result.metadata.expectedDuration) {
        console.log(`  Expected Duration: ${result.metadata.expectedDuration}s`);
        console.log(`  Actual Duration: ${result.metadata.actualDuration}s`);
        console.log(`  Variance: ${(result.metadata.durationVariance * 100).toFixed(1)}%`);
      }

      if (result.metadata.ffprobeData) {
        const ffdata = result.metadata.ffprobeData;
        console.log('\nFFprobe Validation:');
        console.log(`  Duration: ${ffdata.duration.toFixed(1)}s`);
        console.log(`  Dimensions: ${ffdata.width}x${ffdata.height}`);
        console.log(`  Video: ${ffdata.hasVideo ? `Yes (${ffdata.videoCodec})` : 'No'}`);
        console.log(`  Audio: ${ffdata.hasAudio ? `Yes (${ffdata.audioCodec})` : 'No'}`);
        if (ffdata.framerate) {
          console.log(`  Framerate: ${ffdata.framerate.toFixed(1)} fps`);
        }
      }
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((err) => console.log(`  ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach((warn) => console.log(`  ${warn}`));
    }

    process.exit(result.valid ? 0 : 308);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
