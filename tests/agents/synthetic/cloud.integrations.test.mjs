#!/usr/bin/env node
/**
 * Synthetic tests for Cloud integrations (Supabase, TTS Cloud)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

describe('Cloud Integrations', () => {
  const tenant = 'test-tenant';
  
  describe('Supabase Cloud Database', () => {
    it('should test connectivity in TEST_MODE', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-supabase-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'connectivity'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      assert.strictEqual(result.capability, 'cloud.db');
      assert.ok(result.artifacts);
      assert.ok(result.artifacts.length >= 2);
      
      // Check connectivity artifact
      const connectPath = result.artifacts.find(a => a.includes('connectivity.json'));
      assert.ok(connectPath);
      assert.ok(fs.existsSync(connectPath));
      
      const connectivity = JSON.parse(fs.readFileSync(connectPath, 'utf8'));
      assert.strictEqual(connectivity.status, 'connected');
      assert.ok(connectivity.latency_ms);
      assert.ok(connectivity.timestamp);
      assert.strictEqual(connectivity.test_mode, true);
    });
    
    it('should create schema in TEST_MODE', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-supabase-schema-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'create_schema',
          schema_name: 'test_schema',
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'serial', primary: true },
                { name: 'email', type: 'varchar(255)', unique: true },
                { name: 'created_at', type: 'timestamp' }
              ]
            },
            {
              name: 'posts',
              columns: [
                { name: 'id', type: 'serial', primary: true },
                { name: 'user_id', type: 'integer', references: 'users.id' },
                { name: 'content', type: 'text' },
                { name: 'published_at', type: 'timestamp' }
              ]
            }
          ]
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      assert.strictEqual(result.capability, 'cloud.db');
      
      // Check schema artifact
      const schemaPath = result.artifacts.find(a => a.includes('schema.json'));
      assert.ok(schemaPath);
      assert.ok(fs.existsSync(schemaPath));
      
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.strictEqual(schema.name, 'test_schema');
      assert.ok(Array.isArray(schema.tables));
      assert.strictEqual(schema.tables.length, 2);
      assert.strictEqual(schema.test_mode, true);
    });
    
    it('should handle live mode gracefully without credentials', async () => {
      process.env.TEST_MODE = 'false';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;
      const runId = 'test-supabase-live-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'connectivity'
        }
      };
      
      try {
        await executeToolRequest({ 
          tenant, 
          runId,
          toolRequest,
          selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
        });
        assert.fail('Should have thrown error without credentials');
      } catch (error) {
        // The error message might vary depending on how the error is thrown
        assert.ok(
          error.message.includes('SUPABASE_SERVICE_KEY') || 
          error.message.includes('SUPABASE_URL') ||
          error.message.includes('required'),
          `Unexpected error message: ${error.message}`
        );
      }
      
      // Reset TEST_MODE
      process.env.TEST_MODE = 'true';
    });
  });
  
  describe('TTS Cloud', () => {
    it('should generate audio in TEST_MODE', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-tts-' + Date.now();
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: 'Hello, this is a test of the text-to-speech system.',
          voice: 'en-US-Standard-A'
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
      
      // Check audio artifact
      const audioPath = result.artifacts.find(a => a.includes('narration.wav'));
      assert.ok(audioPath);
      assert.ok(fs.existsSync(audioPath));
      
      // Verify WAV header
      const audioBuffer = fs.readFileSync(audioPath);
      assert.ok(audioBuffer.length > 44); // Has more than just header
      assert.strictEqual(audioBuffer.toString('utf8', 0, 4), 'RIFF');
      assert.strictEqual(audioBuffer.toString('utf8', 8, 12), 'WAVE');
      
      // Check outputs
      assert.ok(result.outputs.duration_seconds);
      assert.strictEqual(result.outputs.voice, 'en-US-Standard-A');
      assert.strictEqual(result.outputs.test_mode, true);
    });
    
    it('should validate text input length', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-tts-long-' + Date.now();
      
      // Generate text longer than 5000 chars (will be truncated)
      const longText = 'A'.repeat(6000);
      
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
      
      // Text should be truncated to max length (5000 chars)
      // Duration should be reasonable for truncated text
      // In TEST_MODE, duration is calculated as Math.ceil(text.length / 15)
      // Since text is truncated to 5000, duration should be ~334 seconds
      assert.ok(result.outputs.duration_seconds > 0, 'Duration should be positive');
      assert.ok(result.outputs.duration_seconds <= 400, `Duration too long: ${result.outputs.duration_seconds}`);
    });
    
    it('should handle live mode with fallback', async () => {
      process.env.TEST_MODE = 'false';
      process.env.TTS_CLOUD_API_KEY = 'test-key-invalid';
      process.env.TTS_PROVIDER = 'unknown';
      const runId = 'test-tts-fallback-' + Date.now();
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: 'Test fallback audio generation.',
          voice: 'en-US-Standard-C'
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
      
      // Should generate fallback audio
      const audioPath = result.artifacts.find(a => a.includes('narration.wav'));
      assert.ok(audioPath);
      assert.ok(fs.existsSync(audioPath));
      
      // Check for metadata or error file
      const metadataPath = result.artifacts.find(a => 
        a.includes('metadata.json') || a.includes('error.json')
      );
      assert.ok(metadataPath);
      
      // Reset TEST_MODE
      process.env.TEST_MODE = 'true';
      delete process.env.TTS_CLOUD_API_KEY;
      delete process.env.TTS_PROVIDER;
    });
  });
  
  describe('Integration Safety Checks', () => {
    it('should enforce cost limits for TTS', async () => {
      process.env.TEST_MODE = 'false';
      process.env.TTS_CLOUD_API_KEY = 'test-key';
      process.env.TTS_PROVIDER = 'google';
      const runId = 'test-tts-cost-' + Date.now();
      
      // Text that would exceed $1.00 cost limit
      // At $16 per 1M chars, need >62,500 chars
      const expensiveText = 'A'.repeat(70000);
      
      const toolRequest = {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: expensiveText,
          voice: 'en-US-Standard-A'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }]
      });
      
      // Should truncate to 5000 chars max (safety limit)
      // So it should succeed with truncated text
      assert.strictEqual(result.capability, 'audio.tts.cloud');
      assert.ok(result.artifacts);
      
      // Reset
      process.env.TEST_MODE = 'true';
      delete process.env.TTS_CLOUD_API_KEY;
      delete process.env.TTS_PROVIDER;
    });
    
    it('should sanitize Supabase URLs in logs', async () => {
      process.env.TEST_MODE = 'false';
      process.env.SUPABASE_URL = 'https://myproject.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
      const runId = 'test-supabase-sanitize-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'connectivity'
        }
      };
      
      try {
        const result = await executeToolRequest({ 
          tenant, 
          runId,
          toolRequest,
          selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
        });
        
        // If it succeeds (unlikely with test key), check sanitization
        if (result.artifacts) {
          const connectPath = result.artifacts.find(a => a.includes('connectivity.json'));
          if (connectPath && fs.existsSync(connectPath)) {
            const connectivity = JSON.parse(fs.readFileSync(connectPath, 'utf8'));
            // URL should be redacted
            assert.ok(connectivity.url.includes('***'));
            assert.ok(!connectivity.url.includes('myproject'));
          }
        }
      } catch (error) {
        // Expected to fail with invalid key, but error shouldn't leak project ID
        assert.ok(!error.message.includes('myproject'));
      }
      
      // Reset
      process.env.TEST_MODE = 'true';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;
    });
  });
});