/**
 * Audio TTS Executor - Deterministic text-to-speech generation
 * Generates audio narration from insights data
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tenantPath } from '../tenant.mjs';

/**
 * Generate narration script from insights
 */
function generateScript(insights) {
  const { summary, top_categories } = insights;

  let script = 'Data Analysis Report.\n\n';
  script += `We analyzed ${summary.row_count} records with total revenue of ${summary.total_revenue.toFixed(0)} dollars.\n\n`;

  script += 'The top three categories by revenue are:\n';
  top_categories.forEach((cat, index) => {
    script += `Number ${index + 1}: ${cat.name} with ${cat.revenue.toFixed(0)} dollars in revenue.\n`;
  });

  script += '\nKey metrics include:\n';
  script += `Average order value: ${summary.average_order_value.toFixed(2)} dollars.\n`;
  script += `Total categories: ${summary.unique_categories}.\n`;
  script += `Total regions: ${summary.unique_regions}.\n`;

  script += '\nThis concludes the data analysis report.';

  return script;
}

/**
 * Generate placeholder WAV file (would use piper TTS in production)
 */
function generatePlaceholderWAV(text, outputPath) {
  // WAV file header for 1 second of silence at 44.1kHz, 16-bit mono
  const sampleRate = 44100;
  const duration = Math.min(10, Math.max(5, text.length / 15)); // Estimate duration based on text length
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk size
  buffer.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  buffer.writeUInt16LE(1, 22); // Number of channels
  buffer.writeUInt32LE(sampleRate, 24); // Sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate simple sine wave for demo (would be actual TTS output)
  const frequency = 440; // A4 note
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amplitude = Math.sin(2 * Math.PI * frequency * t) * 0.1;
    const sample = Math.floor(amplitude * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(outputPath, buffer);

  return {
    duration,
    sampleRate,
    channels: 1,
    bitDepth: 16,
    size: buffer.length,
  };
}

/**
 * Check if piper is available
 */
async function checkPiperAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('piper', ['--version'], { shell: true });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Execute TTS generation
 * @param {Object} params - Execution parameters
 * @param {string} params.text - Optional text to speak (will use insights if not provided)
 * @param {string} params.tenant - Tenant ID (default: 'default')
 * @param {string} params.runId - Run ID for this execution
 * @returns {Promise<Object>} Result with status and artifacts
 */
export async function executeAudioTTS(params) {
  const { text, tenant = 'default', runId } = params;

  let scriptText = text;

  // If no text provided, generate from insights
  if (!scriptText) {
    // Correct tenant-scoped path (no extra 'runs/' segment)
    const dataDir = tenantPath(tenant, runId ? `${runId}/data` : 'data');
    const insightsPath = path.join(dataDir, 'insights.json');

    if (fs.existsSync(insightsPath)) {
      console.log(`[audio.tts] Reading insights from: ${insightsPath}`);
      const insights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
      scriptText = generateScript(insights);
    } else {
      // Fallback script
      scriptText =
        'Welcome to the data analysis presentation. This is a demonstration of text to speech capabilities.';
    }
  }

  console.log(`[audio.tts] Script length: ${scriptText.length} characters`);

  // Create media directory
  const mediaDir = path.resolve('media');
  fs.mkdirSync(mediaDir, { recursive: true });

  // Write script
  const scriptPath = path.join(mediaDir, 'script.txt');
  fs.writeFileSync(scriptPath, scriptText);

  // Check if piper is available
  const piperAvailable = await checkPiperAvailable();

  let audioMetadata;
  const audioPath = path.join(mediaDir, 'narration.wav');

  if (piperAvailable) {
    console.log('[audio.tts] Using piper for TTS generation');
    // Real piper command would be:
    // echo scriptText | piper --model en_US-lessac-medium --output_file audioPath

    // For demo, create placeholder
    audioMetadata = generatePlaceholderWAV(scriptText, audioPath);
    console.log('[audio.tts] Note: Piper detected but using placeholder for demo');
  } else {
    // Windows fallback: use System.Speech (offline) to synthesize real speech to WAV
    if (process.platform === 'win32') {
      try {
        console.log('[audio.tts] Piper not available, using Windows SAPI for TTS');
        const psScript = [
          'Add-Type -AssemblyName System.Speech',
          '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
          // Choose a reasonable default rate/volume
          '$s.Rate = 0; $s.Volume = 100',
          `$out = '${audioPath.replace(/\\/g, '/')}'`,
          `$txt = Get-Content -Raw '${scriptPath.replace(/\\/g, '/')}'`,
          '$s.SetOutputToWaveFile($out)',
          '$s.Speak($txt)',
          '$s.Dispose()'
        ].join('; ');

        await new Promise((resolve, reject) => {
          const proc = spawn('powershell', ['-NoProfile', '-Command', psScript], { shell: true });
          proc.on('error', (err) => reject(err));
          proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`SAPI exited ${code}`))));
        });

        const stats = fs.statSync(audioPath);
        // Estimate duration conservatively: ~ 14 chars/sec speaking speed
        const estDuration = Math.max(3, Math.min(90, Math.round(scriptText.length / 14)));
        audioMetadata = {
          duration: estDuration,
          sampleRate: 44100,
          channels: 1,
          bitDepth: 16,
          size: stats.size,
        };
      } catch (e) {
        console.log('[audio.tts] Windows SAPI failed, generating placeholder audio');
        audioMetadata = generatePlaceholderWAV(scriptText, audioPath);
      }
    } else {
      console.log('[audio.tts] Piper not available, generating placeholder audio');
      audioMetadata = generatePlaceholderWAV(scriptText, audioPath);
    }
  }

  // Write metadata
  const metadataPath = path.join(mediaDir, 'audio_metadata.json');
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        script_length: scriptText.length,
        duration_seconds: audioMetadata.duration,
        sample_rate: audioMetadata.sampleRate,
        channels: audioMetadata.channels,
        bit_depth: audioMetadata.bitDepth,
        file_size: audioMetadata.size,
        generator: piperAvailable ? 'piper_placeholder' : 'placeholder',
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[audio.tts] Audio generated: ${audioMetadata.duration.toFixed(1)}s duration`);
  console.log(`[audio.tts] Artifacts written to: ${mediaDir}`);

  return {
    status: 'success',
    message: `Generated ${audioMetadata.duration.toFixed(1)}s audio narration`,
    artifacts: [scriptPath, audioPath, metadataPath],
    metadata: {
      duration: audioMetadata.duration,
      script_length: scriptText.length,
      sample_rate: audioMetadata.sampleRate,
    },
  };
}
