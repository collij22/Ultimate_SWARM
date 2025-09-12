#!/usr/bin/env node
/**
 * ASR Validator (Phase 15)
 * 
 * Validates audio transcription quality and completeness
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Transcript validation schema
 */
const TRANSCRIPT_SCHEMA = {
  type: 'object',
  required: ['transcript', 'segments', 'duration'],
  properties: {
    transcript: {
      type: 'string',
      minLength: 1
    },
    segments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['start', 'end', 'text'],
        properties: {
          start: { type: 'number', minimum: 0 },
          end: { type: 'number', minimum: 0 },
          text: { type: 'string', minLength: 1 },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    duration: {
      type: 'number',
      minimum: 0
    },
    language: {
      type: 'string'
    },
    word_count: {
      type: 'integer',
      minimum: 0
    }
  }
};

/**
 * Calculate WER proxy (Word Error Rate approximation)
 * Uses segment confidence and coverage metrics
 */
function calculateWERProxy(segments, duration, wordCount) {
  if (!segments || segments.length === 0) return 1.0;
  
  // Calculate average confidence
  const avgConfidence = segments.reduce((sum, seg) => {
    return sum + (seg.confidence || 0.5);
  }, 0) / segments.length;
  
  // Calculate coverage (how much of the audio is transcribed)
  let coveredTime = 0;
  segments.forEach(seg => {
    if (seg.end && seg.start) {
      coveredTime += (seg.end - seg.start);
    }
  });
  const coverage = duration > 0 ? coveredTime / duration : 0;
  
  // Calculate density (words per minute)
  const wordsPerMinute = duration > 0 ? (wordCount / (duration / 60)) : 0;
  const expectedWPM = 150; // Average speaking rate
  const densityScore = Math.min(1, wordsPerMinute / expectedWPM);
  
  // WER proxy (lower is better, 0 = perfect)
  const werProxy = 1 - (avgConfidence * 0.5 + coverage * 0.3 + densityScore * 0.2);
  return werProxy;
}

/**
 * Validate ASR output
 * @param {{
 *   artifactPath: string,
 *   config?: {
 *     min_confidence?: number,
 *     min_coverage?: number,
 *     max_wer?: number,
 *     min_words_per_minute?: number,
 *     max_words_per_minute?: number
 *   }
 * }} params
 */
export function validateASROutput({ artifactPath, config = {} }) {
  const {
    min_confidence = 0.7,
    min_coverage = 0.9,
    max_wer = 0.3,
    min_words_per_minute = 50,
    max_words_per_minute = 250
  } = config;
  
  const results = {
    valid: false,
    errors: [],
    warnings: [],
    metrics: {}
  };
  
  // Check if transcript exists
  if (!fs.existsSync(artifactPath)) {
    results.errors.push(`Transcript file not found: ${artifactPath}`);
    return results;
  }
  
  // Read and parse transcript
  let transcript;
  try {
    const content = fs.readFileSync(artifactPath, 'utf8');
    transcript = JSON.parse(content);
  } catch (e) {
    results.errors.push(`Failed to parse transcript: ${e.message}`);
    return results;
  }
  
  // Validate schema
  const validate = ajv.compile(TRANSCRIPT_SCHEMA);
  if (!validate(transcript)) {
    results.errors.push(`Invalid transcript schema: ${JSON.stringify(validate.errors)}`);
    return results;
  }
  
  // Check segments quality
  const segments = transcript.segments || [];
  let totalConfidence = 0;
  let segmentsWithConfidence = 0;
  let coveredTime = 0;
  let gaps = [];
  let overlaps = [];
  
  segments.forEach((seg, index) => {
    // Check confidence
    if (seg.confidence !== undefined) {
      totalConfidence += seg.confidence;
      segmentsWithConfidence++;
      
      if (seg.confidence < min_confidence) {
        results.warnings.push(`Segment ${index}: low confidence ${seg.confidence.toFixed(2)}`);
      }
    }
    
    // Check timing
    if (seg.end <= seg.start) {
      results.errors.push(`Segment ${index}: invalid timing (end <= start)`);
    }
    
    coveredTime += (seg.end - seg.start);
    
    // Check for gaps
    if (index > 0) {
      const prevSeg = segments[index - 1];
      const gap = seg.start - prevSeg.end;
      if (gap > 1.0) { // More than 1 second gap
        gaps.push({ index, gap: gap.toFixed(2) });
      } else if (gap < -0.1) { // Overlap
        overlaps.push({ index, overlap: Math.abs(gap).toFixed(2) });
      }
    }
    
    // Check text quality
    if (!seg.text || seg.text.trim().length === 0) {
      results.errors.push(`Segment ${index}: empty text`);
    }
  });
  
  // Calculate metrics
  const avgConfidence = segmentsWithConfidence > 0 
    ? totalConfidence / segmentsWithConfidence 
    : 0;
  const coverage = transcript.duration > 0 
    ? coveredTime / transcript.duration 
    : 0;
  const wordsPerMinute = transcript.duration > 0 
    ? (transcript.word_count / (transcript.duration / 60)) 
    : 0;
  const werProxy = calculateWERProxy(segments, transcript.duration, transcript.word_count);
  
  results.metrics = {
    duration: transcript.duration,
    word_count: transcript.word_count,
    segment_count: segments.length,
    avg_confidence: avgConfidence.toFixed(3),
    coverage: coverage.toFixed(3),
    words_per_minute: wordsPerMinute.toFixed(1),
    wer_proxy: werProxy.toFixed(3),
    gaps: gaps.length,
    overlaps: overlaps.length
  };
  
  // Report gaps and overlaps
  if (gaps.length > 0) {
    results.warnings.push(`Found ${gaps.length} gaps in transcript`);
    if (gaps.length <= 3) {
      gaps.forEach(g => {
        results.warnings.push(`  Gap at segment ${g.index}: ${g.gap}s`);
      });
    }
  }
  
  if (overlaps.length > 0) {
    results.warnings.push(`Found ${overlaps.length} overlapping segments`);
  }
  
  // Check quality thresholds
  if (avgConfidence < min_confidence) {
    results.errors.push(`Average confidence too low: ${avgConfidence.toFixed(3)} < ${min_confidence}`);
  }
  
  if (coverage < min_coverage) {
    results.errors.push(`Coverage too low: ${coverage.toFixed(3)} < ${min_coverage}`);
  }
  
  if (werProxy > max_wer) {
    results.errors.push(`WER proxy too high: ${werProxy.toFixed(3)} > ${max_wer}`);
  }
  
  if (wordsPerMinute < min_words_per_minute || wordsPerMinute > max_words_per_minute) {
    results.warnings.push(`Unusual speech rate: ${wordsPerMinute.toFixed(1)} words/minute`);
  }
  
  // Check SRT file if exists
  const srtPath = artifactPath.replace('.json', '.srt');
  if (fs.existsSync(srtPath)) {
    results.metrics.srt_available = true;
    const srtContent = fs.readFileSync(srtPath, 'utf8');
    const srtSegments = srtContent.split('\n\n').filter(s => s.trim());
    if (Math.abs(srtSegments.length - segments.length) > 2) {
      results.warnings.push(`SRT segment count mismatch: ${srtSegments.length} vs ${segments.length}`);
    }
  }
  
  // Determine overall validity
  results.valid = results.errors.length === 0 && werProxy <= max_wer;
  
  return results;
}

/**
 * Get exit code based on validation results
 */
export function getExitCode(results) {
  if (!results.valid) {
    if (results.metrics.wer_proxy > 0.5) return 313; // Very poor transcription
    if (results.metrics.coverage < 0.8) return 314; // Poor coverage
    if (results.metrics.avg_confidence < 0.6) return 315; // Low confidence
    return 316; // General ASR validation failure
  }
  return 0;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const artifactPath = process.argv[2];
  
  if (!artifactPath) {
    console.error('Usage: asr_validator.mjs <transcript_path>');
    process.exit(1);
  }
  
  const results = validateASROutput({ artifactPath });
  console.log(JSON.stringify(results, null, 2));
  
  const exitCode = getExitCode(results);
  if (exitCode !== 0) {
    console.error(`ASR validation failed with code ${exitCode}`);
  }
  process.exit(exitCode);
}