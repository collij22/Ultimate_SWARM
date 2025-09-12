#!/usr/bin/env node
/**
 * Synthetic test for audio transcribe capability
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

describe('Audio Transcribe Capability', () => {
  const tenant = 'test-tenant';
  const runId = 'test-asr-' + Date.now();
  
  it('should transcribe audio in TEST_MODE', async () => {
    process.env.TEST_MODE = 'true';
    
    const toolRequest = {
      capability: 'audio.transcribe',
      input_spec: {
        audio_path: '/tmp/test-audio.wav',
        language: 'en',
        format: 'json'
      }
    };
    
    const result = await executeToolRequest({ 
      tenant, 
      runId,
      toolRequest,
      selectedTools: [{ tool_id: 'whisper-local', capabilities: ['audio.transcribe'] }]
    });
    
    assert.strictEqual(result.capability, 'audio.transcribe');
    assert.ok(result.artifacts);
    assert.ok(result.artifacts.length > 0);
    
    // Check transcript artifact
    const transcriptPath = result.artifacts.find(a => a.includes('transcript.json'));
    assert.ok(transcriptPath);
    assert.ok(fs.existsSync(transcriptPath));
    
    const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
    assert.ok(transcript.text);
    assert.ok(transcript.segments);
    assert.ok(transcript.language);
    assert.strictEqual(transcript.language, 'en');
    assert.ok(transcript.duration);
    
    // Verify segment structure
    if (transcript.segments.length > 0) {
      const segment = transcript.segments[0];
      assert.ok(typeof segment.start === 'number');
      assert.ok(typeof segment.end === 'number');
      assert.ok(segment.text);
    }
  });
  
  it('should validate ASR output with validator', async () => {
    const { validateASROutput } = await import('../../../orchestration/lib/asr_validator.mjs');
    
    // Create test transcript
    const testTranscript = {
      text: 'This is a test transcript with multiple segments.',
      language: 'en',
      duration: 10.5,
      segments: [
        { start: 0.0, end: 2.5, text: 'This is a test' },
        { start: 2.5, end: 5.0, text: 'transcript with' },
        { start: 5.0, end: 7.5, text: 'multiple segments.' }
      ],
      confidence: 0.95,
      audio_file: 'test.wav'
    };
    
    const testPath = `/tmp/test-transcript-${Date.now()}.json`;
    fs.writeFileSync(testPath, JSON.stringify(testTranscript, null, 2));
    
    const validation = validateASROutput({ 
      artifactPath: testPath,
      config: { min_confidence: 0.8, max_segment_gap: 1.0 }
    });
    
    assert.ok(validation.valid);
    assert.ok(validation.hasText);
    assert.ok(validation.hasSegments);
    assert.strictEqual(validation.segmentCount, 3);
    
    // Clean up
    fs.unlinkSync(testPath);
  });
});