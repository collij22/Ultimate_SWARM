#!/usr/bin/env node
/**
 * NLP Extract Executor (Phase 12)
 * 
 * Deterministic entity and topic extraction using patterns
 */

import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

/**
 * Extract entities using simple patterns
 */
function extractEntities(text) {
  const entities = {
    persons: [],
    organizations: [],
    locations: [],
    dates: [],
    products: [],
    events: []
  };
  
  // Simple pattern-based extraction
  // Persons: Capitalized words that might be names
  const personPattern = /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g;
  let match;
  while ((match = personPattern.exec(text)) !== null) {
    if (!entities.persons.includes(match[1])) {
      entities.persons.push(match[1]);
    }
  }
  
  // Organizations: Common patterns like "X Inc.", "X Corp.", "X Ltd."
  const orgPattern = /\b([A-Z][A-Za-z]+ (?:Inc|Corp|Corporation|Ltd|LLC|Company|Group|Foundation))\b/g;
  while ((match = orgPattern.exec(text)) !== null) {
    if (!entities.organizations.includes(match[1])) {
      entities.organizations.push(match[1]);
    }
  }
  
  // Dates: Various date formats
  const datePattern = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/gi;
  while ((match = datePattern.exec(text)) !== null) {
    if (!entities.dates.includes(match[1])) {
      entities.dates.push(match[1]);
    }
  }
  
  // Locations: Common place indicators
  const locationPattern = /\b([A-Z][a-z]+(?:, [A-Z][a-z]+)?)\b/g;
  const locationKeywords = ['City', 'Street', 'Avenue', 'Road', 'Park', 'Lake', 'River', 'Mountain'];
  locationKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b([A-Z][a-z]+ ${keyword})\\b`, 'g');
    while ((match = regex.exec(text)) !== null) {
      if (!entities.locations.includes(match[1])) {
        entities.locations.push(match[1]);
      }
    }
  });
  
  return entities;
}

/**
 * Extract topics and keywords
 */
function extractTopics(text) {
  // Word frequency analysis
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  // Sort by frequency
  const sorted = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Create topics
  const topics = sorted.slice(0, 5).map(([word, freq], index) => ({
    topic: word.charAt(0).toUpperCase() + word.slice(1),
    score: (1 - index * 0.15).toFixed(2),
    keywords: [word]
  }));
  
  // Create keywords
  const keywords = sorted.map(([term, freq]) => ({
    term,
    frequency: freq,
    importance: (freq / words.length).toFixed(3)
  }));
  
  return { topics, keywords };
}

/**
 * Analyze sentiment
 */
function analyzeSentiment(text) {
  // Simple keyword-based sentiment
  const positive = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best'];
  const negative = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'poor', 'disappointing'];
  
  const lowerText = text.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;
  
  positive.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = lowerText.match(regex);
    if (matches) positiveScore += matches.length;
  });
  
  negative.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = lowerText.match(regex);
    if (matches) negativeScore += matches.length;
  });
  
  let polarity = 'neutral';
  let score = 0;
  
  if (positiveScore > negativeScore) {
    polarity = 'positive';
    score = Math.min(1, positiveScore / 10);
  } else if (negativeScore > positiveScore) {
    polarity = 'negative';
    score = Math.max(-1, -negativeScore / 10);
  }
  
  return { polarity, score };
}

export async function executeNlpExtract({ content, text, extraction_type = 'all', schema, max_items = 10, tenant, runId }) {
  const inputText = content || text || '';
  
  if (!inputText) {
    throw new Error('No text provided for extraction');
  }
  
  const outDir = tenantPath(tenant, `nlp`);
  fs.mkdirSync(outDir, { recursive: true });
  
  const output = {};
  
  // Extract based on type
  if (extraction_type === 'entities' || extraction_type === 'all') {
    output.entities = extractEntities(inputText);
  }
  
  if (extraction_type === 'topics' || extraction_type === 'keywords' || extraction_type === 'all') {
    const { topics, keywords } = extractTopics(inputText);
    if (extraction_type === 'topics' || extraction_type === 'all') {
      output.topics = topics.slice(0, max_items);
    }
    if (extraction_type === 'keywords' || extraction_type === 'all') {
      output.keywords = keywords.slice(0, max_items);
    }
  }
  
  // Always analyze sentiment
  output.sentiment = analyzeSentiment(inputText);
  
  // Write outputs
  const artifacts = [];
  
  // JSON output
  const jsonPath = path.join(outDir, 'extraction.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  artifacts.push(path.resolve(jsonPath));
  
  // Markdown report
  const mdPath = path.join(outDir, 'extraction.md');
  let mdContent = '# Text Extraction Results\n\n';
  
  if (output.entities) {
    mdContent += '## Entities\n\n';
    Object.entries(output.entities).forEach(([type, items]) => {
      if (items.length > 0) {
        mdContent += `**${type.charAt(0).toUpperCase() + type.slice(1)}:** ${items.join(', ')}\n\n`;
      }
    });
  }
  
  if (output.topics) {
    mdContent += '## Topics\n\n';
    output.topics.forEach(topic => {
      mdContent += `- **${topic.topic}** (score: ${topic.score})\n`;
    });
    mdContent += '\n';
  }
  
  if (output.sentiment) {
    mdContent += `## Sentiment\n\n**Polarity:** ${output.sentiment.polarity}\n**Score:** ${output.sentiment.score}\n`;
  }
  
  fs.writeFileSync(mdPath, mdContent);
  artifacts.push(path.resolve(mdPath));
  
  return {
    status: 'success',
    artifacts,
    outputs: output
  };
}


