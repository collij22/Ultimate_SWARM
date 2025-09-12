#!/usr/bin/env node
/**
 * Live integration tests for TTS Cloud (audio.tts.cloud)
 * These tests are gated by API keys and will skip if not available
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

const SKIP_LIVE_TESTS = !process.env.TTS_CLOUD_API_KEY;

describe('TTS Cloud Live Integration', { skip: SKIP_LIVE_TESTS }, () => {
  const tenant = 'test-tenant';
  
  before(() => {
    // Ensure we're in live mode
    process.env.TEST_MODE = 'false';
    console.log('Running TTS Cloud live tests with:', {
      provider: process.env.TTS_PROVIDER || 'google',
      hasKey: !!process.env.TTS_CLOUD_API_KEY
    });
  });
  
  describe('Audio Generation', () => {
    it('should generate audio from text', async () => {
      const runId = 'test-tts-live-generate-' + Date.now();
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: 'Hello, this is a live test of the text-to-speech system.',
          voice: 'en-US-Standard-A'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
      });
      
      // Verify capability
      assert.strictEqual(result.capability, 'audio.tts.cloud');
      assert.ok(result.artifacts, 'Should have artifacts');
      assert.ok(result.artifacts.length > 0, 'Should have at least one artifact');
      
      // Check narration.wav
      const audioPath = result.artifacts.find(a => a.includes('narration.wav'));
      assert.ok(audioPath, 'Should have narration.wav');
      assert.ok(fs.existsSync(audioPath), 'Audio file should exist');
      
      // Verify WAV file
      const audioBuffer = fs.readFileSync(audioPath);
      assert.ok(audioBuffer.length > 44, 'WAV file should be larger than header');
      assert.strictEqual(audioBuffer.toString('utf8', 0, 4), 'RIFF', 'Should be RIFF format');
      assert.strictEqual(audioBuffer.toString('utf8', 8, 12), 'WAVE', 'Should be WAVE format');
      
      // Check metadata.json
      const metadataPath = result.artifacts.find(a => a.includes('metadata.json'));
      if (metadataPath && fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        assert.ok(metadata.text_length > 0, 'Should have text length');
        assert.ok(metadata.voice, 'Should have voice');
        assert.ok(metadata.provider, 'Should have provider');
        assert.ok(metadata.file_size > 0, 'Should have file size');
        assert.ok(metadata.created_at, 'Should have creation timestamp');
        
        // Provider-specific checks
        if (metadata.provider === 'google') {
          assert.ok(metadata.char_count > 0, 'Google should have char count');
          assert.ok(metadata.estimated_cost, 'Google should have cost estimate');
        } else if (metadata.provider === 'elevenlabs') {
          assert.ok(metadata.voice_id, 'ElevenLabs should have voice ID');
        }
        
        console.log('Audio generated successfully:', {
          provider: metadata.provider,
          size: Math.round(metadata.file_size / 1024) + 'KB',
          chars: metadata.text_length,
          cost: metadata.estimated_cost || 'N/A'
        });
      }
      
      // Validate outputs
      assert.ok(result.outputs, 'Should have outputs');
      assert.ok(result.outputs.duration_seconds > 0 || result.outputs.file_size_kb > 0, 
        'Should have duration or file size');
    });
    
    it('should handle long text with truncation', async () => {
      const runId = 'test-tts-live-long-' + Date.now();
      
      // Generate text longer than 5000 character limit
      const longText = 'This is a test sentence. '.repeat(250); // ~6250 chars
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: longText,
          voice: 'en-US-Standard-B'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
      });
      
      assert.strictEqual(result.capability, 'audio.tts.cloud');
      assert.ok(result.artifacts);
      
      // Check metadata for truncation
      const metadataPath = result.artifacts.find(a => a.includes('metadata.json'));
      if (metadataPath && fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        // Text should be truncated to 5000 chars
        assert.ok(metadata.text_length <= 5000, 'Text should be truncated to 5000 chars');
        
        // Cost should be within limit
        if (metadata.estimated_cost) {
          const cost = parseFloat(metadata.estimated_cost);
          assert.ok(cost <= 1.0, `Cost should be under $1.00, got $${cost}`);
        }
        
        console.log('Long text handled:', {
          original_length: longText.length,
          truncated_to: metadata.text_length,
          cost: metadata.estimated_cost || 'N/A'
        });
      }
    });
  });
  
  describe('Provider Handling', () => {
    it('should work with specified provider or fallback', async () => {
      const runId = 'test-tts-live-provider-' + Date.now();
      const provider = process.env.TTS_PROVIDER || 'google';
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: `Testing ${provider} provider integration.`,
          voice: provider === 'elevenlabs' ? 'Rachel' : 'en-US-Standard-C'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
      });
      
      assert.strictEqual(result.capability, 'audio.tts.cloud');
      
      // Check which provider was actually used
      const metadataPath = result.artifacts.find(a => a.includes('metadata.json'));
      if (metadataPath && fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        console.log('Provider test:', {
          requested: provider,
          actual: metadata.provider,
          fallback: metadata.provider === 'fallback'
        });
        
        // If fallback was used, check for error
        if (metadata.provider === 'fallback') {
          const errorPath = result.artifacts.find(a => a.includes('error.json'));
          if (errorPath && fs.existsSync(errorPath)) {
            const error = JSON.parse(fs.readFileSync(errorPath, 'utf8'));
            console.log('Fallback reason:', error.error);
            assert.ok(!error.error.includes(process.env.TTS_CLOUD_API_KEY), 
              'Error should not leak API key');
          }
        }
      }
    });
  });
  
  describe('Cost Control', () => {
    it('should enforce cost limits', async () => {
      const runId = 'test-tts-live-cost-' + Date.now();
      
      // At Google's $16/1M chars, we need >62,500 chars to exceed $1
      // But we truncate at 5000, so cost should always be safe
      const expensiveText = 'A'.repeat(5000);
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: expensiveText,
          voice: 'en-US-Neural2-A' // Premium voice
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
      });
      
      assert.strictEqual(result.capability, 'audio.tts.cloud');
      
      // Verify cost is within limits
      const metadataPath = result.artifacts.find(a => a.includes('metadata.json'));
      if (metadataPath && fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        if (metadata.estimated_cost) {
          const cost = parseFloat(metadata.estimated_cost);
          assert.ok(cost <= 1.0, `Cost exceeds limit: $${cost}`);
          
          console.log('Cost control verified:', {
            chars: metadata.text_length,
            cost: `$${cost}`,
            limit: '$1.00'
          });
        }
      }
    });
  });
  
  describe('Error Recovery', () => {
    it('should fallback gracefully on API errors', async () => {
      const runId = 'test-tts-live-fallback-' + Date.now();
      
      // Temporarily use invalid provider to trigger fallback
      const originalProvider = process.env.TTS_PROVIDER;
      process.env.TTS_PROVIDER = 'invalid_provider_xyz';
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: 'Testing fallback mechanism.',
          voice: 'en-US-Standard-D'
        }
      };
      
      try {
        const result = await executeToolRequest({ 
          tenant, 
          runId,
          toolRequest,
          selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
        });
        
        assert.strictEqual(result.capability, 'audio.tts.cloud');
        assert.ok(result.artifacts, 'Should still produce artifacts');
        
        // Should generate fallback audio
        const audioPath = result.artifacts.find(a => a.includes('narration.wav'));
        assert.ok(audioPath, 'Should have fallback audio');
        assert.ok(fs.existsSync(audioPath), 'Fallback audio should exist');
        
        // Check for fallback indicator
        if (result.outputs.fallback || result.outputs.provider === 'fallback') {
          console.log('Fallback worked correctly');
        }
        
      } finally {
        // Restore original provider
        if (originalProvider) {
          process.env.TTS_PROVIDER = originalProvider;
        } else {
          delete process.env.TTS_PROVIDER;
        }
      }
    });
  });
});

// Export for use in other tests
export { SKIP_LIVE_TESTS };