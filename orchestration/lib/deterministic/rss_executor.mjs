#!/usr/bin/env node
/**
 * RSS Executor (Phase 12)
 * 
 * Deterministic RSS feed fetcher and parser
 * Outputs structured feed items to runs/<tenant>/rss/
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tenantPath } from '../tenant.mjs';

/**
 * Parse RSS feed content (simplified deterministic parser)
 * In production, would use a proper RSS parser library
 */
function parseRSSContent(xmlContent) {
  const items = [];
  
  // Simple regex-based parsing for demonstration
  // In production, use proper XML parsing
  const itemMatches = xmlContent.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  
  for (const match of itemMatches) {
    const itemXml = match[1];
    
    const title = itemXml.match(/<title>(.*?)<\/title>/i)?.[1] || '';
    const link = itemXml.match(/<link>(.*?)<\/link>/i)?.[1] || '';
    const description = itemXml.match(/<description>(.*?)<\/description>/i)?.[1] || '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || '';
    const guid = itemXml.match(/<guid>(.*?)<\/guid>/i)?.[1] || link;
    
    items.push({
      title: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
      link: link.trim(),
      description: description.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
      pubDate: pubDate.trim(),
      guid: guid.trim()
    });
  }
  
  return items;
}

/**
 * Generate deterministic test RSS content
 */
function generateTestRSSContent(feedUrl, maxItems = 10) {
  const feedName = feedUrl.replace(/[^a-z0-9]/gi, '_');
  const baseDate = new Date('2025-01-01T00:00:00Z');
  
  let rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed: ${feedName}</title>
    <link>${feedUrl}</link>
    <description>Deterministic test feed for ${feedUrl}</description>
    <lastBuildDate>${baseDate.toUTCString()}</lastBuildDate>
`;
  
  for (let i = 0; i < maxItems; i++) {
    const itemDate = new Date(baseDate.getTime() - i * 86400000); // Each item 1 day older
    const hash = crypto.createHash('md5').update(`${feedUrl}-${i}`).digest('hex').substring(0, 8);
    
    rssContent += `    <item>
      <title>Article ${i + 1}: ${hash}</title>
      <link>${feedUrl}/article-${i + 1}</link>
      <description>Test content for article ${i + 1}. Hash: ${hash}</description>
      <pubDate>${itemDate.toUTCString()}</pubDate>
      <guid>${feedUrl}/article-${i + 1}</guid>
    </item>
`;
  }
  
  rssContent += `  </channel>
</rss>`;
  
  return rssContent;
}

/**
 * Execute RSS fetch capability
 * @param {{
 *   tenant: string,
 *   runId: string,
 *   input?: {
 *     feeds: string[],
 *     max_items_per_feed?: number,
 *     include_content?: boolean,
 *     date_filter?: { after?: string, before?: string }
 *   }
 * }} params
 */
export async function executeRSSFetch(params) {
  const { tenant, runId, input = {} } = params;
  const { 
    feeds = ['https://example.com/feed.xml'],
    max_items_per_feed = 10,
    include_content = false,
    date_filter
  } = input;
  
  const outDir = tenantPath(tenant, 'rss');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const isTestMode = process.env.TEST_MODE === 'true';
  const allItems = [];
  const feedResults = [];
  
  for (const feedUrl of feeds) {
    let rssContent;
    let items;
    
    if (isTestMode) {
      // Generate deterministic test content
      rssContent = generateTestRSSContent(feedUrl, max_items_per_feed);
      items = parseRSSContent(rssContent);
    } else {
      // In production, would fetch real RSS feed
      // For now, use test content
      console.log(`Would fetch RSS from: ${feedUrl}`);
      rssContent = generateTestRSSContent(feedUrl, max_items_per_feed);
      items = parseRSSContent(rssContent);
    }
    
    // Apply date filter if specified
    if (date_filter) {
      const afterDate = date_filter.after ? new Date(date_filter.after) : null;
      const beforeDate = date_filter.before ? new Date(date_filter.before) : null;
      
      items = items.filter(item => {
        if (!item.pubDate) return true;
        const itemDate = new Date(item.pubDate);
        if (afterDate && itemDate < afterDate) return false;
        if (beforeDate && itemDate > beforeDate) return false;
        return true;
      });
    }
    
    // Limit items per feed
    items = items.slice(0, max_items_per_feed);
    
    feedResults.push({
      url: feedUrl,
      item_count: items.length,
      last_updated: new Date().toISOString()
    });
    
    allItems.push(...items.map(item => ({
      ...item,
      feed_url: feedUrl
    })));
  }
  
  // Write outputs
  const feedsPath = path.join(outDir, 'feeds.json');
  const itemsPath = path.join(outDir, 'items.json');
  const summaryPath = path.join(outDir, 'summary.json');
  
  fs.writeFileSync(feedsPath, JSON.stringify(feedResults, null, 2));
  fs.writeFileSync(itemsPath, JSON.stringify(allItems, null, 2));
  
  const summary = {
    total_feeds: feeds.length,
    total_items: allItems.length,
    timestamp: new Date().toISOString(),
    test_mode: isTestMode,
    filters: {
      max_items_per_feed,
      date_filter: date_filter || null
    }
  };
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  return {
    artifacts: [
      path.resolve(feedsPath),
      path.resolve(itemsPath),
      path.resolve(summaryPath)
    ],
    metadata: summary
  };
}