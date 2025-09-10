#!/usr/bin/env node
/**
 * Tool Executor (Phase 10b-3)
 *
 * Executes selected tool plans for subagent tool_requests with:
 * - Per-RUN_ID + checksum caching of results
 * - Minimal capability coverage (web.search/web.fetch via web_search_fetch)
 * - Artifact linking and normalized outputs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tenantPath } from './tenant.mjs';

/**
 * Compute a stable SHA-256 hash for a JS value.
 * @param {unknown} value
 */
function hashValue(value) {
  // Sort keys recursively for stable stringification
  const sortKeys = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortKeys(obj[key]);
        return sorted;
      }, {});
  };
  const sorted = sortKeys(value);
  const json = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Return cache file path for a capability and key under runs/cache
 * @param {string} tenant
 * @param {string} capability
 * @param {string} keyHash
 */
function getCachePath(tenant, capability, keyHash) {
  const rel = `cache/${capability}/${keyHash}.json`;
  return tenantPath(tenant, rel);
}

/**
 * Try to read cache entry and verify artifacts exist.
 */
function readCache(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(data.artifacts) && data.artifacts.every((p) => fs.existsSync(p))) {
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(cachePath, payload) {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
}

/**
 * Execute a tool_request using selected tools (first plan item) with basic capability coverage.
 * @param {{
 *   tenant: string,
 *   runId: string,
 *   toolRequest: {
 *     capability: string,
 *     input_spec?: any,
 *     expected_artifacts?: string[],
 *   },
 *   selectedTools: Array<{ tool_id: string, capabilities: string[] }>,
 * }} params
 */
export async function executeToolRequest(params) {
  const { tenant, toolRequest, selectedTools } = params;
  const capability = toolRequest.capability;

  // Cache key covers capability, input_spec, and chosen tool id list
  const keyHash = hashValue({ capability, input: toolRequest.input_spec, tools: selectedTools });
  const cachePath = getCachePath(tenant, capability, keyHash);
  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Check if TEST_MODE is enabled
  const isTestMode = process.env.TEST_MODE === 'true';

  // Dispatch per capability
  if (capability === 'web.search' || capability === 'web.fetch') {
    // Use combined demo executor that performs search + fetch-first-result
    const query = toolRequest.input_spec?.query || 'swarm1 demo query';
    const outDir = toolRequest.input_spec?.outDir || 'websearch_demo';

    const { runWebSearchFetch } = await import('./web_search_fetch.mjs');
    const result = await runWebSearchFetch({ query, tenant, outDir });
    const summaryPath = path.resolve('runs', outDir, 'summary.json');
    const firstHtml = path.resolve('runs', outDir, 'first_result.html');

    const artifacts = [summaryPath, firstHtml].filter((p) => fs.existsSync(p));
    const payload = {
      capability,
      cached: false,
      artifacts,
      outputs: { title: result.title, url: result.url },
    };
    writeCache(cachePath, payload);
    return payload;
  }

  // Secondary tool: web.crawl (firecrawl)
  if (capability === 'web.crawl') {
    const maxPages = toolRequest.input_spec?.max_pages || 10;
    const depth = toolRequest.input_spec?.depth || 1;
    const baseUrl = toolRequest.input_spec?.url || 'http://127.0.0.1:3000';
    const outDir = tenantPath(tenant, 'crawl_demo');

    if (isTestMode) {
      // TEST_MODE: Use deterministic fixture
      const urls = [];
      const graph = { nodes: [], edges: [] };

      // Generate deterministic URLs
      for (let i = 0; i < Math.min(maxPages, 20); i++) {
        const url = `${baseUrl}/page-${i}`;
        urls.push(url);
        graph.nodes.push({ id: i, url });
        if (i > 0) {
          graph.edges.push({ from: 0, to: i });
        }
      }

      // Write artifacts
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'urls.json'), JSON.stringify(urls, null, 2));
      fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify(graph, null, 2));
      fs.writeFileSync(
        path.join(outDir, 'log.txt'),
        `TEST_MODE crawl: ${urls.length} URLs, depth ${depth}, max ${maxPages}`,
      );

      const artifacts = [
        path.resolve(outDir, 'urls.json'),
        path.resolve(outDir, 'graph.json'),
        path.resolve(outDir, 'log.txt'),
      ];

      const payload = {
        capability,
        cached: false,
        artifacts,
        outputs: { url_count: urls.length, depth, test_mode: true },
      };
      writeCache(cachePath, payload);
      return payload;
    } else {
      // Live mode would use FIRECRAWL_API_KEY
      throw new Error('Live firecrawl not implemented (requires FIRECRAWL_API_KEY)');
    }
  }

  // Secondary tool: payments.test (stripe)
  if (capability === 'payments.test') {
    const amount = toolRequest.input_spec?.amount || 1999;
    const currency = toolRequest.input_spec?.currency || 'usd';
    const outDir = tenantPath(tenant, 'payments_demo');

    if (isTestMode) {
      // TEST_MODE: Synthesize payment_intent.succeeded
      const paymentIntent = {
        id: 'pi_test_' + crypto.randomBytes(8).toString('hex'),
        object: 'payment_intent',
        amount,
        currency,
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
        test_mode: true,
      };

      const charge = {
        id: 'ch_test_' + crypto.randomBytes(8).toString('hex'),
        object: 'charge',
        amount,
        currency,
        paid: true,
        payment_intent: paymentIntent.id,
      };

      // Write artifacts
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'payment_intent.json'),
        JSON.stringify(paymentIntent, null, 2),
      );
      fs.writeFileSync(path.join(outDir, 'charge.json'), JSON.stringify(charge, null, 2));

      const artifacts = [
        path.resolve(outDir, 'payment_intent.json'),
        path.resolve(outDir, 'charge.json'),
      ];

      const payload = {
        capability,
        cached: false,
        artifacts,
        outputs: { payment_intent_id: paymentIntent.id, status: 'succeeded', test_mode: true },
      };
      writeCache(cachePath, payload);
      return payload;
    } else {
      // Live mode would use STRIPE_API_KEY (test mode keys only)
      throw new Error('Live Stripe not implemented (requires STRIPE_API_KEY in test mode)');
    }
  }

  // Secondary tool: cloud.db (supabase)
  if (capability === 'cloud.db') {
    // const check = toolRequest.input_spec?.check || 'connectivity';
    const operation = toolRequest.input_spec?.operation;
    const outDir = tenantPath(tenant, 'db_demo');

    if (isTestMode) {
      // TEST_MODE: Connectivity/roundtrip stub
      const connectivity = {
        status: 'connected',
        latency_ms: 42,
        test_mode: true,
        timestamp: new Date().toISOString(),
      };

      const roundtrip = {
        query: 'SELECT 1 as test',
        result: [{ test: 1 }],
        duration_ms: 5,
        test_mode: true,
      };

      // Write artifacts
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'connectivity.json'),
        JSON.stringify(connectivity, null, 2),
      );
      fs.writeFileSync(path.join(outDir, 'roundtrip.json'), JSON.stringify(roundtrip, null, 2));

      // Generate schema.json if operation is create_schema
      const artifacts = [
        path.resolve(outDir, 'connectivity.json'),
        path.resolve(outDir, 'roundtrip.json'),
      ];

      if (operation === 'create_schema') {
        const schemaName = toolRequest.input_spec?.schema_name || 'demo_schema';
        const tables = toolRequest.input_spec?.tables || [];
        const schema = {
          name: schemaName,
          tables,
          created_at: new Date().toISOString(),
          test_mode: true,
        };
        fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2));
        artifacts.push(path.resolve(outDir, 'schema.json'));
      }

      const payload = {
        capability,
        cached: false,
        artifacts,
        outputs: { status: 'connected', test_mode: true },
      };
      writeCache(cachePath, payload);
      return payload;
    } else {
      // Live mode would use SUPABASE_SERVICE_KEY
      throw new Error('Live Supabase not implemented (requires SUPABASE_SERVICE_KEY)');
    }
  }

  // Secondary tool: audio.tts.cloud (tts-cloud)
  if (capability === 'audio.tts.cloud') {
    const text = toolRequest.input_spec?.text || 'Demo narration';
    const voice = toolRequest.input_spec?.voice || 'en-US-Standard-A';
    const duration = Math.max(1, Math.ceil(text.length / 15)); // ~15 chars per second
    const outDir = tenantPath(tenant, 'tts_cloud_demo');

    if (isTestMode) {
      // TEST_MODE: Generate WAV header + silence
      // Simplified WAV header (44 bytes) + silence data
      const sampleRate = 44100;
      const numChannels = 1;
      const bitsPerSample = 16;
      const numSamples = sampleRate * duration;
      const dataSize = numSamples * numChannels * (bitsPerSample / 8);

      const buffer = Buffer.alloc(44 + dataSize);

      // RIFF header
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + dataSize, 4);
      buffer.write('WAVE', 8);

      // fmt chunk
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16); // chunk size
      buffer.writeUInt16LE(1, 20); // PCM format
      buffer.writeUInt16LE(numChannels, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
      buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
      buffer.writeUInt16LE(bitsPerSample, 34);

      // data chunk
      buffer.write('data', 36);
      buffer.writeUInt32LE(dataSize, 40);
      // Rest is zeros (silence)

      // Write artifact
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'narration.wav'), buffer);

      const artifacts = [path.resolve(outDir, 'narration.wav')];

      const payload = {
        capability,
        cached: false,
        artifacts,
        outputs: { duration_seconds: duration, voice, test_mode: true },
      };
      writeCache(cachePath, payload);
      return payload;
    } else {
      // Live mode would use TTS_CLOUD_API_KEY
      throw new Error('Live Cloud TTS not implemented (requires TTS_CLOUD_API_KEY)');
    }
  }

  // Default: no-op executor with placeholder artifact if specified
  const artifacts = [];
  for (const p of toolRequest.expected_artifacts || []) {
    if (typeof p === 'string') {
      const abs = path.resolve(p);
      const dir = path.dirname(abs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, JSON.stringify({ placeholder: true }));
      artifacts.push(abs);
    }
  }
  const fallback = { capability, cached: false, artifacts, outputs: {} };
  writeCache(cachePath, fallback);
  return fallback;
}
