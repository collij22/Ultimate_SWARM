#!/usr/bin/env node
/**
 * Synthetic test for YouTube operations
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

describe('YouTube Operations', () => {
  const tenant = 'test-tenant';
  
  describe('YouTube Search', () => {
    it('should search videos in TEST_MODE', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-yt-search-' + Date.now();
      
      const toolRequest = {
        capability: 'youtube.search',
        input_spec: {
          query: 'machine learning tutorial',
          max_results: 5
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'youtube-data', capabilities: ['youtube.search'] }]
      });
      
      assert.strictEqual(result.capability, 'youtube.search');
      assert.ok(result.artifacts);
      
      // Check search results
      const searchPath = result.artifacts.find(a => a.includes('search_results.json'));
      assert.ok(searchPath);
      assert.ok(fs.existsSync(searchPath));
      
      const searchData = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
      assert.strictEqual(searchData.query, 'machine learning tutorial');
      assert.ok(Array.isArray(searchData.results));
      assert.ok(searchData.results.length <= 5);
      
      // Verify result structure
      if (searchData.results.length > 0) {
        const video = searchData.results[0];
        assert.ok(video.videoId);
        assert.ok(video.title);
        assert.ok(video.channel);
        assert.ok(video.publishedAt);
      }
    });
  });
  
  describe('YouTube Transcript', () => {
    it('should fetch transcript in TEST_MODE', async () => {
      process.env.TEST_MODE = 'true';
      const runId = 'test-yt-transcript-' + Date.now();
      
      const toolRequest = {
        capability: 'youtube.transcript',
        input_spec: {
          video_id: 'dQw4w9WgXcQ'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'youtube-transcript', capabilities: ['youtube.transcript'] }]
      });
      
      assert.strictEqual(result.capability, 'youtube.transcript');
      assert.ok(result.artifacts);
      
      // Check transcript
      const transcriptPath = result.artifacts.find(a => a.includes('transcript.json'));
      assert.ok(transcriptPath);
      assert.ok(fs.existsSync(transcriptPath));
      
      const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
      assert.strictEqual(transcript.video_id, 'dQw4w9WgXcQ');
      assert.ok(transcript.title);
      assert.ok(transcript.channel);
      assert.ok(transcript.transcript);
      assert.ok(transcript.transcript.text);
      assert.ok(Array.isArray(transcript.transcript.segments));
    });
  });
  
  describe('YouTube Validator', () => {
    it('should validate YouTube operation outputs', async () => {
      const { validateYouTubeOperation } = await import('../../../orchestration/lib/youtube_validator.mjs');
      
      // Test search validation
      const searchResult = {
        query: 'test query',
        results: [
          { videoId: 'abc123', title: 'Test Video', channel: 'Test Channel', publishedAt: new Date().toISOString() }
        ],
        totalResults: 1
      };
      
      const searchPath = `/tmp/test-yt-search-${Date.now()}.json`;
      fs.writeFileSync(searchPath, JSON.stringify(searchResult, null, 2));
      
      const searchValidation = validateYouTubeOperation({ 
        artifactPath: searchPath,
        operation: 'search',
        config: { min_results: 1 }
      });
      
      assert.ok(searchValidation.valid);
      assert.strictEqual(searchValidation.operation, 'search');
      assert.ok(searchValidation.hasResults);
      
      // Test transcript validation
      const transcriptResult = {
        video_id: 'test123',
        title: 'Test Video',
        transcript: {
          text: 'Test transcript text',
          segments: [
            { start: 0, duration: 5, text: 'Test transcript text' }
          ]
        }
      };
      
      const transcriptPath = `/tmp/test-yt-transcript-${Date.now()}.json`;
      fs.writeFileSync(transcriptPath, JSON.stringify(transcriptResult, null, 2));
      
      const transcriptValidation = validateYouTubeOperation({ 
        artifactPath: transcriptPath,
        operation: 'transcript'
      });
      
      assert.ok(transcriptValidation.valid);
      assert.strictEqual(transcriptValidation.operation, 'transcript');
      assert.ok(transcriptValidation.hasTranscript);
      
      // Clean up
      fs.unlinkSync(searchPath);
      fs.unlinkSync(transcriptPath);
    });
  });
});