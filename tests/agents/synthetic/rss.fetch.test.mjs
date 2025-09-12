#!/usr/bin/env node
/**
 * Synthetic test for RSS fetch capability
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

describe('RSS Fetch Capability', () => {
  const tenant = 'test-tenant';
  const runId = 'test-rss-' + Date.now();
  
  it('should fetch and parse RSS feeds in TEST_MODE', async () => {
    process.env.TEST_MODE = 'true';
    
    const toolRequest = {
      capability: 'rss.fetch',
      input_spec: {
        feeds: ['https://example.com/feed.xml', 'https://test.com/rss'],
        max_items_per_feed: 5
      }
    };
    
    const result = await executeToolRequest({ 
      tenant, 
      runId,
      toolRequest,
      selectedTools: [{ tool_id: 'rss', capabilities: ['rss.fetch'] }]
    });
    
    assert.strictEqual(result.capability, 'rss.fetch');
    assert.ok(result.artifacts);
    assert.ok(result.artifacts.length > 0);
    
    // Check that feed content was generated
    const feedPath = result.artifacts.find(a => a.includes('feed-content.json'));
    assert.ok(feedPath, 'Should have feed-content.json artifact');
    assert.ok(fs.existsSync(feedPath), 'Feed content file should exist');
    
    const content = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    assert.ok(content.feeds);
    assert.strictEqual(content.feeds.length, 2);
    assert.ok(content.total_items > 0);
    
    // Verify feed structure
    const feed = content.feeds[0];
    assert.ok(feed.url);
    assert.ok(feed.title);
    assert.ok(Array.isArray(feed.items));
    assert.ok(feed.items.length <= 5);
    
    // Verify item structure
    if (feed.items.length > 0) {
      const item = feed.items[0];
      assert.ok(item.title);
      assert.ok(item.link);
      assert.ok(item.pubDate);
      assert.ok(item.description);
    }
  });
  
  it('should validate RSS output with validator', async () => {
    const { validateRSSExtraction } = await import('../../../orchestration/lib/rss_validator.mjs');
    
    // Create test RSS content
    const testContent = {
      feeds: [
        {
          url: 'https://example.com/feed.xml',
          title: 'Test Feed',
          description: 'Test feed description',
          items: Array(15).fill(null).map((_, i) => ({
            title: `Item ${i + 1}`,
            link: `https://example.com/item-${i + 1}`,
            pubDate: new Date().toISOString(),
            description: `Description for item ${i + 1}`,
            guid: `guid-${i + 1}`
          }))
        }
      ],
      total_items: 15,
      extracted_at: new Date().toISOString()
    };
    
    const testDir = path.join(process.cwd(), 'runs', 'test-rss');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const testPath = path.join(testDir, `test-rss-${Date.now()}.json`);
    fs.writeFileSync(testPath, JSON.stringify(testContent, null, 2));
    
    const validation = validateRSSExtraction({ 
      artifactPath: testPath,
      config: { min_items: 10, min_feeds: 1 }
    });
    
    assert.ok(validation.valid);
    assert.strictEqual(validation.feedCount, 1);
    assert.strictEqual(validation.totalItems, 15);
    
    // Clean up
    fs.unlinkSync(testPath);
  });
});