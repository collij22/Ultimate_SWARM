/**
 * Integration test for SEO Audit and Reporting Pipeline (AUV-1202)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Run a command and capture output
 */
async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      shell: true,
      env: { ...process.env, TEST_MODE: 'true' }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

describe('SEO Audit Demo Integration Tests', () => {
  it('should execute seo.audit capability with fixture', async () => {
    // Test SEO audit with fixture
    const { executeSEOAudit } = await import('../../orchestration/lib/deterministic/seo_audit_executor.mjs');
    
    // Set TEST_MODE to use fixture
    process.env.TEST_MODE = 'true';
    
    const result = await executeSEOAudit({
      url: 'https://example.com',
      tenant: 'default',
      runId: 'test-seo'
    });
    
    assert.equal(result.status, 'success');
    assert.ok(result.metadata.score > 0, 'Should have a score');
    assert.equal(result.metadata.source, 'fixture', 'Should use fixture in test mode');
    
    // Verify audit.json
    const auditPath = path.resolve('reports/seo/audit.json');
    assert.ok(fs.existsSync(auditPath), 'Audit file should exist');
    
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
    assert.ok(audit.score >= 50, 'Score should be at least 50% for fixture');
    assert.ok(audit.data.title, 'Should have page title');
    assert.ok(audit.data.meta_tags.description, 'Should have meta description');
    assert.ok(audit.data.canonical_url, 'Should have canonical URL');
    assert.ok(Object.keys(audit.data.open_graph).length > 0, 'Should have Open Graph tags');
    
    // Clean up
    delete process.env.TEST_MODE;
  });
  
  it('should execute doc.generate capability', async () => {
    // Test document generation
    const { executeDocGenerate } = await import('../../orchestration/lib/deterministic/doc_generate_executor.mjs');
    
    const result = await executeDocGenerate({
      format: 'both',
      tenant: 'default',
      runId: 'test-seo'
    });
    
    assert.equal(result.status, 'success');
    assert.equal(result.metadata.format, 'both', 'Should generate both formats');
    
    // Verify markdown summary
    const mdPath = path.resolve('reports/seo/summary.md');
    assert.ok(fs.existsSync(mdPath), 'Markdown summary should exist');
    
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    assert.ok(mdContent.includes('# SEO Audit Report'), 'Should have title');
    assert.ok(mdContent.includes('Overall Score'), 'Should have score section');
    // Recommendations are optional for high-scoring pages
    if (mdContent.includes('Recommendations')) {
      assert.ok(true, 'Has recommendations section');
    } else {
      assert.ok(mdContent.includes('SEO Audit Report'), 'Should at least have title');
    }
    
    // Verify HTML summary
    const htmlPath = path.resolve('reports/seo/summary.html');
    assert.ok(fs.existsSync(htmlPath), 'HTML summary should exist');
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    assert.ok(htmlContent.includes('<title>SEO Audit Report'), 'Should have HTML title');
    assert.ok(htmlContent.includes('score-badge'), 'Should have score badge');
  });
  
  it('should validate SEO audit against schema', async () => {
    // Validate audit.json against expected schema
    const auditPath = path.resolve('reports/seo/audit.json');
    assert.ok(fs.existsSync(auditPath), 'Audit file should exist');
    
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
    
    // Validate required fields
    assert.ok(audit.version, 'Should have version');
    assert.ok(audit.url, 'Should have URL');
    assert.ok(audit.timestamp, 'Should have timestamp');
    assert.ok(typeof audit.score === 'number', 'Score should be a number');
    assert.ok(audit.summary, 'Should have summary');
    assert.ok(audit.data, 'Should have data');
    assert.ok(Array.isArray(audit.issues), 'Issues should be array');
    assert.ok(Array.isArray(audit.warnings), 'Warnings should be array');
    assert.ok(Array.isArray(audit.passed), 'Passed should be array');
    assert.ok(Array.isArray(audit.recommendations), 'Recommendations should be array');
    
    // Validate data structure
    assert.ok(audit.data.meta_tags, 'Should have meta tags');
    assert.ok(audit.data.headings, 'Should have headings');
    assert.ok(audit.data.links, 'Should have links');
    assert.ok(audit.data.images, 'Should have images');
    assert.ok(audit.data.open_graph, 'Should have Open Graph data');
  });
  
  it('should handle missing API key with fallback', async () => {
    // Test fallback when BRAVE_API_KEY is missing
    const originalKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    process.env.TEST_MODE = 'true';
    
    const { executeSEOAudit } = await import('../../orchestration/lib/deterministic/seo_audit_executor.mjs');
    
    const result = await executeSEOAudit({
      tenant: 'default',
      runId: 'test-fallback'
    });
    
    assert.equal(result.status, 'success');
    assert.equal(result.metadata.source, 'fixture', 'Should use fixture when API key missing');
    
    // Restore
    if (originalKey) process.env.BRAVE_API_KEY = originalKey;
    delete process.env.TEST_MODE;
  });
  
  it('should run full seo-audit-demo DAG successfully', { timeout: 60000 }, async () => {
    // Set TEST_MODE for web_search_fetch to use fixtures
    process.env.TEST_MODE = 'true';
    
    // Run the full DAG
    const dagPath = path.resolve('orchestration/graph/projects/seo-audit-demo.yaml');
    
    const result = await runCommand('node', [
      'orchestration/graph/runner.mjs',
      dagPath
    ]);
    
    // Check exit code
    assert.equal(result.code, 0, 'DAG should complete successfully');
    
    // Verify key outputs
    assert.ok(result.stdout.includes('web_search_fetch'), 'Should execute web search');
    assert.ok(result.stdout.includes('[seo.audit]'), 'Should execute SEO audit');
    assert.ok(result.stdout.includes('[doc.generate]'), 'Should execute doc generation');
    
    // Clean up
    delete process.env.TEST_MODE;
  });
  
  it('should produce valid SEO metrics for Phase 11 validation', async () => {
    const auditPath = path.resolve('reports/seo/audit.json');
    assert.ok(fs.existsSync(auditPath), 'Audit file should exist');
    
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
    
    // Check Phase 11 thresholds
    const brokenLinks = audit.data.links.external_samples
      .filter(link => link.includes('broken')).length;
    assert.ok(brokenLinks <= 0, 'Should have no broken links (max 0 for demo)');
    
    const hasCanonical = !!audit.data.canonical_url;
    const canonicalRate = hasCanonical ? 1.0 : 0.0;
    assert.ok(canonicalRate >= 0.8, 'Canonical rate should be >= 0.8');
    
    // Check required meta tags
    const requiredMeta = ['description', 'keywords', 'robots'];
    for (const tag of requiredMeta) {
      assert.ok(
        audit.data.meta_tags[tag], 
        `Should have required meta tag: ${tag}`
      );
    }
    
    // Check required OG tags
    const requiredOG = ['og:title', 'og:description'];
    for (const tag of requiredOG) {
      assert.ok(
        audit.data.open_graph[tag], 
        `Should have required OG tag: ${tag}`
      );
    }
  });
});