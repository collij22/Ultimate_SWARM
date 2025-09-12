#!/usr/bin/env node
/**
 * RSS Validator (Phase 15)
 * 
 * Validates RSS feed extraction quality and completeness
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * RSS validation schema
 */
const RSS_SCHEMA = {
  type: 'object',
  required: ['total_feeds', 'total_items'],
  properties: {
    total_feeds: {
      type: 'integer',
      minimum: 1
    },
    total_items: {
      type: 'integer',
      minimum: 1
    },
    timestamp: {
      type: 'string',
      format: 'date-time'
    }
  }
};

const ITEM_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    required: ['title', 'link', 'feed_url'],
    properties: {
      title: { type: 'string', minLength: 1 },
      link: { type: 'string', format: 'uri' },
      description: { type: 'string' },
      pubDate: { type: 'string' },
      guid: { type: 'string' },
      feed_url: { type: 'string', format: 'uri' }
    }
  }
};

/**
 * Validate RSS extraction
 * @param {{
 *   artifactPath: string,
 *   config?: {
 *     min_items?: number,
 *     min_feeds?: number,
 *     required_fields?: string[],
 *     max_age_days?: number
 *   }
 * }} params
 */
export function validateRSSExtraction({ artifactPath, config = {} }) {
  const {
    min_items = 10,
    min_feeds = 1,
    required_fields = ['title', 'link'],
    max_age_days = 30
  } = config;
  
  const results = {
    valid: false,
    errors: [],
    warnings: [],
    metrics: {}
  };
  
  // Check if artifacts exist
  const baseDir = path.dirname(artifactPath);
  const summaryPath = path.join(baseDir, 'summary.json');
  const itemsPath = path.join(baseDir, 'items.json');
  const feedsPath = path.join(baseDir, 'feeds.json');
  
  if (!fs.existsSync(summaryPath)) {
    results.errors.push('Missing summary.json');
    return results;
  }
  
  if (!fs.existsSync(itemsPath)) {
    results.errors.push('Missing items.json');
    return results;
  }
  
  // Read and parse artifacts
  let summary, items, feeds;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    if (fs.existsSync(feedsPath)) {
      feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
    }
  } catch (e) {
    results.errors.push(`Failed to parse artifacts: ${e.message}`);
    return results;
  }
  
  // Validate summary schema
  const validateSummary = ajv.compile(RSS_SCHEMA);
  if (!validateSummary(summary)) {
    results.errors.push(`Invalid summary schema: ${JSON.stringify(validateSummary.errors)}`);
    return results;
  }
  
  // Validate items schema
  const validateItems = ajv.compile(ITEM_SCHEMA);
  if (!validateItems(items)) {
    results.errors.push(`Invalid items schema: ${JSON.stringify(validateItems.errors)}`);
    return results;
  }
  
  // Check minimum requirements
  if (summary.total_items < min_items) {
    results.errors.push(`Insufficient items: ${summary.total_items} < ${min_items}`);
  }
  
  if (summary.total_feeds < min_feeds) {
    results.errors.push(`Insufficient feeds: ${summary.total_feeds} < ${min_feeds}`);
  }
  
  // Check item quality
  let validItems = 0;
  let staleItems = 0;
  const now = new Date();
  const maxAgeMs = max_age_days * 24 * 60 * 60 * 1000;
  
  items.forEach((item, index) => {
    // Check required fields
    const missingFields = required_fields.filter(field => !item[field] || item[field].trim() === '');
    if (missingFields.length > 0) {
      results.warnings.push(`Item ${index}: missing fields ${missingFields.join(', ')}`);
    } else {
      validItems++;
    }
    
    // Check age
    if (item.pubDate) {
      const pubDate = new Date(item.pubDate);
      if (now - pubDate > maxAgeMs) {
        staleItems++;
      }
    }
  });
  
  // Calculate metrics
  results.metrics = {
    total_feeds: summary.total_feeds,
    total_items: summary.total_items,
    valid_items: validItems,
    stale_items: staleItems,
    validity_rate: (validItems / summary.total_items).toFixed(2),
    freshness_rate: ((summary.total_items - staleItems) / summary.total_items).toFixed(2)
  };
  
  // Check feed distribution
  if (feeds) {
    const itemsPerFeed = feeds.map(f => f.item_count);
    const avgItemsPerFeed = itemsPerFeed.reduce((a, b) => a + b, 0) / feeds.length;
    const minItemsPerFeed = Math.min(...itemsPerFeed);
    
    results.metrics.avg_items_per_feed = avgItemsPerFeed.toFixed(1);
    results.metrics.min_items_per_feed = minItemsPerFeed;
    
    if (minItemsPerFeed === 0) {
      results.warnings.push('Some feeds returned no items');
    }
  }
  
  // Determine overall validity
  results.valid = results.errors.length === 0 && 
                  results.metrics.validity_rate >= 0.8 &&
                  results.metrics.freshness_rate >= 0.5;
  
  return results;
}

/**
 * Get exit code based on validation results
 */
export function getExitCode(results) {
  if (!results.valid) {
    if (results.errors.length > 0) return 310; // RSS validation failed
    if (results.metrics.validity_rate < 0.8) return 311; // Poor item quality
    if (results.metrics.freshness_rate < 0.5) return 312; // Stale content
  }
  return 0;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const artifactPath = process.argv[2];
  
  if (!artifactPath) {
    console.error('Usage: rss_validator.mjs <artifact_path>');
    process.exit(1);
  }
  
  const results = validateRSSExtraction({ artifactPath });
  console.log(JSON.stringify(results, null, 2));
  
  const exitCode = getExitCode(results);
  if (exitCode !== 0) {
    console.error(`RSS validation failed with code ${exitCode}`);
  }
  process.exit(exitCode);
}