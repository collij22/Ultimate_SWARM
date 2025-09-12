#!/usr/bin/env node
/**
 * NLP Summarize Executor (Phase 12)
 * 
 * Deterministic text summarization using templates and heuristics
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { tenantPath } from '../tenant.mjs';

/**
 * Generate summary based on style
 */
function generateSummary(text, style = 'brief', maxLength = 150) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  
  if (sentences.length === 0) return '';
  
  let summary = '';
  
  switch (style) {
    case 'brief':
      // Take first 2-3 sentences
      summary = sentences.slice(0, 3).join(' ');
      break;
      
    case 'bullet':
      // Convert to bullet points
      const points = sentences.slice(0, 5).map(s => `• ${s}`);
      summary = points.join('\n');
      break;
      
    case 'podcast':
      // Conversational style
      summary = `Today we're discussing: ${sentences[0]} Key points include: ${sentences.slice(1, 4).join(' ')} Let's dive deeper into these topics.`;
      break;
      
    case 'executive':
      // Executive summary format
      const firstSentence = sentences[0];
      const keyPoints = sentences.slice(1, 4).join(' ');
      summary = `EXECUTIVE SUMMARY\n\nOverview: ${firstSentence}\n\nKey Points: ${keyPoints}\n\nRecommendation: Further analysis recommended.`;
      break;
      
    case 'technical':
      // Technical abstract style
      summary = `Abstract: ${sentences[0]} Methods: ${sentences[1] || 'Standard approach applied.'} Results: ${sentences[2] || 'Significant findings observed.'} Conclusion: ${sentences[3] || 'Further investigation warranted.'}`;
      break;
      
    default:
      summary = sentences.slice(0, 3).join(' ');
  }
  
  // Trim to max length (words)
  const words = summary.split(/\s+/);
  if (words.length > maxLength) {
    summary = words.slice(0, maxLength).join(' ') + '...';
  }
  
  return summary;
}

export async function executeNlpSummarize({ content, text, texts, style = 'brief', max_length = 150, focus_topics = [], preserve_quotes = false, tenant, runId }) {
  // Handle multiple input formats
  let inputText = content || text || '';
  if (texts && Array.isArray(texts)) {
    inputText = texts.join('\n\n');
  }
  
  if (!inputText) {
    throw new Error('No text provided for summarization');
  }
  
  const outDir = tenantPath(tenant, `nlp`);
  fs.mkdirSync(outDir, { recursive: true });
  
  // Generate summary
  const summary = generateSummary(inputText, style, max_length);
  
  // Calculate metadata
  const inputWords = inputText.split(/\s+/).length;
  const summaryWords = summary.split(/\s+/).length;
  const compressionRatio = ((inputWords - summaryWords) / inputWords * 100).toFixed(1);
  
  // Create output object
  const output = {
    summary,
    style,
    input_length: inputWords,
    output_length: summaryWords,
    compression_ratio: `${compressionRatio}%`,
    focus_topics: focus_topics || [],
    preserve_quotes,
    timestamp: new Date().toISOString()
  };
  
  // Write outputs
  const artifacts = [];
  
  // JSON output
  const jsonPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  artifacts.push(path.resolve(jsonPath));
  
  // Markdown output
  const mdPath = path.join(outDir, 'summary.md');
  const mdContent = `# Summary\n\n**Style:** ${style}\n\n${summary}\n\n---\n\n*Compression: ${compressionRatio}% (${inputWords} → ${summaryWords} words)*`;
  fs.writeFileSync(mdPath, mdContent);
  artifacts.push(path.resolve(mdPath));
  
  // Plain text output
  const txtPath = path.join(outDir, 'summary.txt');
  fs.writeFileSync(txtPath, summary);
  artifacts.push(path.resolve(txtPath));
  
  return {
    status: 'success',
    artifacts,
    outputs: output
  };
}


