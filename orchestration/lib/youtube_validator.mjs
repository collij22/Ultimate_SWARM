#!/usr/bin/env node
/**
 * YouTube Validator (Phase 15)
 * 
 * Validates YouTube operations: search, transcript, upload
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * YouTube search result schema
 */
const SEARCH_SCHEMA = {
  type: 'object',
  required: ['query', 'results'],
  properties: {
    query: { type: 'string', minLength: 1 },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['videoId', 'title'],
        properties: {
          videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' },
          title: { type: 'string', minLength: 1 },
          channel: { type: 'string' },
          publishedAt: { type: 'string' },
          viewCount: { type: 'integer', minimum: 0 },
          duration: { type: 'string' }
        }
      }
    }
  }
};

/**
 * YouTube transcript schema
 */
const TRANSCRIPT_SCHEMA = {
  type: 'object',
  required: ['video_id', 'transcript'],
  properties: {
    video_id: { type: 'string' },
    title: { type: 'string' },
    channel: { type: 'string' },
    duration: { type: 'integer', minimum: 0 },
    transcript: {
      type: 'object',
      required: ['text', 'segments', 'source'],
      properties: {
        text: { type: 'string', minLength: 1 },
        segments: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['start', 'duration', 'text'],
            properties: {
              start: { type: 'number', minimum: 0 },
              duration: { type: 'number', minimum: 0 },
              text: { type: 'string' }
            }
          }
        },
        language: { type: 'string' },
        source: { 
          type: 'string',
          enum: ['captions', 'auto-generated', 'asr-fallback']
        }
      }
    }
  }
};

/**
 * YouTube upload result schema
 */
const UPLOAD_SCHEMA = {
  type: 'object',
  required: ['videoId'],
  properties: {
    videoId: { type: 'string' },
    title: { type: 'string' },
    privacy: { 
      type: 'string',
      enum: ['private', 'unlisted', 'public']
    },
    url: { type: 'string', format: 'uri' },
    status: { type: 'string' },
    test_mode: { type: 'boolean' }
  }
};

/**
 * Validate YouTube operation outputs
 * @param {{
 *   artifactPath: string,
 *   operation: 'search' | 'transcript' | 'upload',
 *   config?: {
 *     min_results?: number,
 *     max_age_days?: number,
 *     required_transcript_source?: string[],
 *     min_transcript_coverage?: number
 *   }
 * }} params
 */
export function validateYouTubeOperation({ artifactPath, operation, config = {} }) {
  const {
    min_results = 1,
    max_age_days = 365,
    required_transcript_source = ['captions', 'auto-generated'],
    min_transcript_coverage = 0.8
  } = config;
  
  const results = {
    valid: false,
    errors: [],
    warnings: [],
    metrics: {},
    operation
  };
  
  // Check if artifact exists
  if (!fs.existsSync(artifactPath)) {
    results.errors.push(`Artifact not found: ${artifactPath}`);
    return results;
  }
  
  // Read and parse artifact
  let data;
  try {
    const content = fs.readFileSync(artifactPath, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    results.errors.push(`Failed to parse artifact: ${e.message}`);
    return results;
  }
  
  // Validate based on operation type
  switch (operation) {
    case 'search':
      return validateSearch(data, results, { min_results, max_age_days });
      
    case 'transcript':
      return validateTranscript(data, results, { required_transcript_source, min_transcript_coverage });
      
    case 'upload':
      return validateUpload(data, results);
      
    default:
      results.errors.push(`Unknown operation: ${operation}`);
      return results;
  }
}

/**
 * Validate search results
 */
function validateSearch(data, results, config) {
  const { min_results, max_age_days } = config;
  
  // Validate schema
  const validate = ajv.compile(SEARCH_SCHEMA);
  if (!validate(data)) {
    results.errors.push(`Invalid search schema: ${JSON.stringify(validate.errors)}`);
    return results;
  }
  
  const searchResults = data.results || [];
  
  // Check minimum results
  if (searchResults.length < min_results) {
    results.errors.push(`Insufficient results: ${searchResults.length} < ${min_results}`);
  }
  
  // Analyze results quality
  let validVideos = 0;
  let recentVideos = 0;
  let totalViews = 0;
  const now = new Date();
  const maxAgeMs = max_age_days * 24 * 60 * 60 * 1000;
  
  searchResults.forEach((video, index) => {
    // Check video ID format
    if (!video.videoId || !video.videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
      results.warnings.push(`Result ${index}: invalid video ID format`);
    } else {
      validVideos++;
    }
    
    // Check age
    if (video.publishedAt) {
      const pubDate = new Date(video.publishedAt);
      if (now - pubDate <= maxAgeMs) {
        recentVideos++;
      }
    }
    
    // Accumulate views
    if (video.viewCount) {
      totalViews += video.viewCount;
    }
  });
  
  // Calculate metrics
  results.metrics = {
    query: data.query,
    result_count: searchResults.length,
    valid_videos: validVideos,
    recent_videos: recentVideos,
    avg_views: searchResults.length > 0 ? Math.floor(totalViews / searchResults.length) : 0,
    validity_rate: searchResults.length > 0 ? (validVideos / searchResults.length).toFixed(2) : 0,
    recency_rate: searchResults.length > 0 ? (recentVideos / searchResults.length).toFixed(2) : 0
  };
  
  // Determine validity
  results.valid = results.errors.length === 0 && validVideos > 0;
  
  return results;
}

/**
 * Validate transcript
 */
function validateTranscript(data, results, config) {
  const { required_transcript_source, min_transcript_coverage } = config;
  
  // Validate schema
  const validate = ajv.compile(TRANSCRIPT_SCHEMA);
  if (!validate(data)) {
    results.errors.push(`Invalid transcript schema: ${JSON.stringify(validate.errors)}`);
    return results;
  }
  
  const transcript = data.transcript;
  const segments = transcript.segments || [];
  
  // Check transcript source
  if (!required_transcript_source.includes(transcript.source)) {
    results.warnings.push(`Transcript source '${transcript.source}' not in preferred list`);
  }
  
  // Check segments quality
  let coveredTime = 0;
  let emptySegments = 0;
  let totalTextLength = 0;
  
  segments.forEach((seg, index) => {
    if (seg.duration) {
      coveredTime += seg.duration;
    }
    
    if (!seg.text || seg.text.trim().length === 0) {
      emptySegments++;
      results.warnings.push(`Segment ${index}: empty text`);
    } else {
      totalTextLength += seg.text.length;
    }
  });
  
  // Calculate coverage
  const coverage = data.duration > 0 ? coveredTime / data.duration : 0;
  
  // Calculate metrics
  results.metrics = {
    video_id: data.video_id,
    duration: data.duration,
    segment_count: segments.length,
    transcript_length: transcript.text.length,
    avg_segment_length: segments.length > 0 ? Math.floor(totalTextLength / segments.length) : 0,
    coverage: coverage.toFixed(3),
    empty_segments: emptySegments,
    source: transcript.source,
    language: transcript.language || 'unknown'
  };
  
  // Check coverage threshold
  if (coverage < min_transcript_coverage) {
    results.errors.push(`Transcript coverage too low: ${coverage.toFixed(3)} < ${min_transcript_coverage}`);
  }
  
  // Check for minimum content
  if (transcript.text.length < 100) {
    results.errors.push(`Transcript too short: ${transcript.text.length} characters`);
  }
  
  // Determine validity
  results.valid = results.errors.length === 0 && coverage >= min_transcript_coverage;
  
  return results;
}

/**
 * Validate upload result
 */
function validateUpload(data, results) {
  // Validate schema
  const validate = ajv.compile(UPLOAD_SCHEMA);
  if (!validate(data)) {
    results.errors.push(`Invalid upload schema: ${JSON.stringify(validate.errors)}`);
    return results;
  }
  
  // Check video ID
  if (!data.videoId || data.videoId.length < 3) {
    results.errors.push('Invalid or missing video ID');
  }
  
  // Check URL format
  if (data.url && !data.url.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/)) {
    results.warnings.push('URL does not appear to be a YouTube URL');
  }
  
  // Check privacy setting
  if (data.privacy === 'public' && data.test_mode) {
    results.warnings.push('Public upload in test mode - verify this is intended');
  }
  
  // Calculate metrics
  results.metrics = {
    video_id: data.videoId,
    title: data.title || 'Untitled',
    privacy: data.privacy || 'unknown',
    status: data.status || 'unknown',
    test_mode: data.test_mode || false,
    has_url: !!data.url
  };
  
  // Determine validity
  results.valid = results.errors.length === 0 && !!data.videoId;
  
  return results;
}

/**
 * Get exit code based on validation results
 */
export function getExitCode(results) {
  if (!results.valid) {
    switch (results.operation) {
      case 'search':
        return 317; // YouTube search validation failed
      case 'transcript':
        return 318; // YouTube transcript validation failed
      case 'upload':
        return 319; // YouTube upload validation failed
      default:
        return 320; // General YouTube validation failure
    }
  }
  return 0;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const operation = process.argv[2];
  const artifactPath = process.argv[3];
  
  if (!operation || !artifactPath) {
    console.error('Usage: youtube_validator.mjs <search|transcript|upload> <artifact_path>');
    process.exit(1);
  }
  
  const results = validateYouTubeOperation({ artifactPath, operation });
  console.log(JSON.stringify(results, null, 2));
  
  const exitCode = getExitCode(results);
  if (exitCode !== 0) {
    console.error(`YouTube ${operation} validation failed with code ${exitCode}`);
  }
  process.exit(exitCode);
}