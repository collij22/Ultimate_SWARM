#!/usr/bin/env node
/**
 * Unit tests for router scale hints (Phase 13)
 * Verifies that router selects firecrawl for large-scale crawling
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { planTools } from '../../mcp/router.mjs';
import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Router Scale Hints', () => {
  // Load registry and policies once
  const registryPath = path.join(__dirname, '../../mcp/registry.yaml');
  const policiesPath = path.join(__dirname, '../../mcp/policies.yaml');

  const registry = yaml.parse(fs.readFileSync(registryPath, 'utf8'));
  const policies = yaml.parse(fs.readFileSync(policiesPath, 'utf8'));

  test('should select firecrawl for large-scale crawl hints', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['web.crawl'],
      budgetUsd: 0.1,
      secondaryConsent: true,
      env: {
        TEST_MODE: 'true',
        FIRECRAWL_API_KEY: 'test-key', // Add mock API key
      },
      registry,
      policies,
      hints: {
        crawl: {
          max_pages: 500,
          depth: 3,
        },
      },
    });

    // Should select firecrawl for large-scale crawl
    assert.ok(result.toolPlan, 'Should have a tool plan');
    const crawlTool = result.toolPlan.find((t) => t.capabilities.includes('web.crawl'));
    assert.ok(crawlTool, 'Should select a tool for web.crawl');
    assert.equal(crawlTool.tool_id, 'firecrawl', 'Should select firecrawl for large-scale hints');
  });

  test('should select crawler-lite for small-scale crawl', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['web.crawl'],
      budgetUsd: 0.1,
      secondaryConsent: true,
      env: { TEST_MODE: 'true' },
      registry,
      policies,
      hints: {
        crawl: {
          max_pages: 50,
          depth: 1,
        },
      },
    });

    // Should select crawler-lite for small-scale crawl
    assert.ok(result.toolPlan, 'Should have a tool plan');
    const crawlTool = result.toolPlan.find((t) => t.capabilities.includes('web.crawl'));
    assert.ok(crawlTool, 'Should select a tool for web.crawl');
    assert.equal(
      crawlTool.tool_id,
      'crawler-lite',
      'Should select crawler-lite for small-scale hints',
    );
  });

  test('should reject secondary tools without TEST_MODE', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['web.crawl'],
      budgetUsd: 0.1,
      secondaryConsent: true,
      env: {
        FIRECRAWL_API_KEY: 'test-key', // Has API key but no TEST_MODE
      },
      registry,
      policies,
      hints: {
        crawl: {
          max_pages: 500,
          depth: 3,
        },
      },
    });

    // Should reject firecrawl without TEST_MODE
    assert.ok(result.rejected, 'Should have rejected tools');
    const rejected = result.rejected.find((r) => r.tool_id === 'firecrawl');
    assert.ok(rejected, 'Should reject firecrawl without TEST_MODE');
    assert.ok(
      rejected.reason && rejected.reason.includes('TEST_MODE'),
      'Rejection reason should mention TEST_MODE',
    );
  });

  test('should allow secondary when no primary available (fallback)', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['payments.test'],
      budgetUsd: 0.1,
      secondaryConsent: false, // No consent, but will be allowed as fallback
      env: {
        TEST_MODE: 'true',
        STRIPE_API_KEY: 'test-key',
      },
      registry,
      policies,
      hints: {},
    });

    // Should allow stripe as fallback when no primary available
    assert.ok(result.ok, 'Should succeed with fallback');
    assert.ok(
      result.warnings.some((w) => w.includes('No primary tool')),
      'Should have fallback warning',
    );
    const stripeTool = result.toolPlan.find((t) => t.tool_id === 'stripe');
    assert.ok(stripeTool, 'Should select stripe as fallback');
  });
});
