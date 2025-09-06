#!/usr/bin/env node
/**
 * Swarm1 — AUV Delivery Runbook (v0.6: error-hardened with typed exit codes)
 * Drives: start server → (ensure tests) → Playwright → Lighthouse → CVF → summary card.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ensureTests } from '../lib/test_authoring.mjs';
import { expectedArtifacts } from '../lib/expected_artifacts.mjs';

function readLighthouseMetrics(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const perfScore = j.categories?.performance?.score ?? null;
    const lcpMs = j.audits?.['largest-contentful-paint']?.numericValue ?? null;
    return { perf_score: perfScore, lcp_ms: lcpMs };
  } catch { return null; }
}

function appendHookLine(obj) {
  try {
    const f = path.resolve(process.cwd(), 'runs', 'observability', 'hooks.jsonl');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(obj) + '\n');
  } catch {}
}

// Typed errors for CLI exit code handling
export class RunbookError extends Error {
  constructor(message, step, exitCode) {
    super(message);
    this.name = 'RunbookError';
    this.step = step;
    this.exitCode = exitCode;
  }
}

// Minimal per-AUV config; perf and CVF details stay here.
const AUV_MAP = {
  'AUV-0002': {
    // Product listing & detail specs that generate required artifacts
    specs: [
      'tests/robot/playwright/products.spec.ts',
      'tests/robot/playwright/api/products.spec.ts',
    ],
    perfUrl: (base) => `${base}/products.html`,
    perfOut: 'runs/AUV-0002/perf/lighthouse.json',
    cvfId: 'AUV-0002',
  },
  'AUV-0003': {
    specs: ['tests/robot/playwright/products-filter.spec.ts'], // skip separate API spec
    perfUrl: (base) => `${base}/products.html`,
    perfOut: 'runs/AUV-0003/perf/lighthouse.json',
    cvfId: 'AUV-0003',
  },
  'AUV-0004': {
    specs: null, // let auto-authoring create tests from capability + hints
    perfUrl: (base) => `${base}/cart.html`,
    perfOut: 'runs/AUV-0004/perf/lighthouse.json',
    cvfId: 'AUV-0004',
  },
  'AUV-0005': {
  specs: null, // let auto-authoring create tests from hints
  perfUrl: (base) => `${base}/checkout.html`,
  perfOut: 'runs/AUV-0005/perf/lighthouse.json', // optional; add to CVF later if you want perf
  cvfId: 'AUV-0005',
  }
};

function log(...args) { console.log('[runbook]', ...args); }

async function waitForHealth(url, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let lastErr = null;
  let attempts = 0;
  
  while (Date.now() < end) {
    attempts++;
    try {
      const r = await fetch(url);
      if (r.ok) {
        log(`server health check succeeded after ${attempts} attempts`);
        return;
      }
      lastErr = new Error(`HTTP ${r.status}: ${r.statusText}`);
    } catch (e) { 
      lastErr = e;
    }
    
    // Exponential backoff for better transient failure handling
    const backoffMs = Math.min(1000, 100 * Math.pow(1.5, attempts - 1));
    await new Promise(r => setTimeout(r, backoffMs));
  }
  
  throw new RunbookError(
    `Health check failed for ${url} after ${timeoutMs}ms and ${attempts} attempts${lastErr ? ': ' + lastErr.message : ''}`,
    'server-startup',
    105
  );
}

function spawnP(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(file, args, { stdio: 'inherit', ...options });
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} ${args.join(' ')} exited ${code}`)));
  });
}

function runShell(cmd, env) {
  log('sh>', cmd);
  return spawnP(cmd, [], { env, shell: true });
}

async function runPlaywright(specs, env) {
  const specArgs = specs.map(s => `"${s.replace(/"/g, '\\"')}"`).join(' ');
  const pw = `npx playwright test -c "tests/robot/playwright/playwright.config.ts" ${specArgs}`;
  await runShell(pw, env);
}

async function runNodeScript(script, args, env) {
  log('node', script, ...args);
  await spawnP(process.execPath, [script, ...args], { env });
}

/** Enhanced repair plan: analyze failure type and decide retry strategy.
 *  Captures failure context for debugging and handles transient vs persistent failures.
 */
async function maybeRepair(auvId, err) {
  const dir = path.resolve(process.cwd(), 'runs', auvId, 'repair');
  fs.mkdirSync(dir, { recursive: true });

  const msg = String(err?.message || err).toLowerCase();

  // "Definitely persistent" signals (don't retry)
  const persistentNeedles = [
    'expect(',              // playwright assertion
    'tohave',               // toHaveText / toHaveCount / etc.
    'received:',            // assertion output
    'status).toBe(',        // status mismatch
    '404', '400', '401'     // deterministic API failures
  ];

  // "Clearly transient" signals
  const transientNeedles = [
    'timeout', 'connection', 'net::', 'network',
    'browser closed', 'crashed', 'interstitial',
    'econnreset', '502', '503', '500'
  ];

  const looksPersistent = persistentNeedles.some(n => msg.includes(n));
  const looksTransient  = transientNeedles.some(n => msg.includes(n));

  const errorType = looksPersistent ? 'persistent' : (looksTransient ? 'transient' : 'unknown');
  const retry = errorType === 'transient';

  const payload = {
    ts: Date.now() / 1000,
    event: 'RepairPlan',
    auv: auvId,
    error: String(err),
    error_type: errorType,
    retry_recommended: retry,
  };
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify(payload, null, 2), 'utf8');

  if (retry) {
    console.warn(`[repair] ${auvId}: transient failure detected, retrying once...`);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
  console.warn(`[repair] ${auvId}: no auto-retry (error_type=${errorType})`);
  return false;
}

// Re-export for backward compatibility (if needed)
export { expectedArtifacts };

export async function runAuv(auvId, { stagingUrl, apiBase } = {}) {
  const cfg = AUV_MAP[auvId];
  if (!cfg) throw new RunbookError(`Unknown AUV id: ${auvId}`, 'config', 1);

  const STAGING_URL = stagingUrl || process.env.STAGING_URL || 'http://127.0.0.1:3000';
  const API_BASE    = apiBase    || process.env.API_BASE    || 'http://127.0.0.1:3000/api';
  const ENV = { ...process.env, STAGING_URL, API_BASE, AUV_ID: auvId, SWARM_ACTIVE: 'true' };

  const startTime = Date.now();
  const steps = [];
  let repaired = false;
  let serverProc = null;

  // Observability breadcrumb
  appendHookLine({ ts: Date.now()/1000, event: 'RunbookStart', auv: auvId });

  // Helper to track step timing
  const trackStep = async (stepName, stepFn) => {
    const stepStart = Date.now();
    try {
      log(`[${stepName}] starting...`);
      await stepFn();
      const duration = Date.now() - stepStart;
      steps.push({ name: stepName, duration_ms: duration, ok: true });
      log(`[${stepName}] completed in ${duration}ms`);
    } catch (err) {
      const duration = Date.now() - stepStart;
      steps.push({ name: stepName, duration_ms: duration, ok: false, error: err.message });
      throw err;
    }
  };

  const cleanup = () => { 
    if (serverProc) {
      try { serverProc.kill(); } catch {} 
    }
  };
  
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    // Ensure perf dir exists
    fs.mkdirSync(path.dirname(cfg.perfOut), { recursive: true });

    // 0) Determine spec list (from capabilities; auto-create if missing)
    let specList = cfg.specs;
    if (!specList) {
      await trackStep('ensure-tests', async () => {
        specList = ensureTests(auvId);
        if (!Array.isArray(specList) || specList.length === 0) {
          throw new RunbookError(`No specs found or generated for ${auvId}`, 'ensure-tests', 104);
        }
        log('specs for', auvId, '→', specList.join(', '));
      });
    }

    // 1) Start mock server (or use existing if healthy)
    await trackStep('server-startup', async () => {
      // Check if server is already healthy
      try {
        const r = await fetch(`${STAGING_URL}/health`);
        if (r.ok) {
          log('server already healthy, skipping startup');
          return;
        }
      } catch (e) {
        log('server not healthy, starting new instance');
      }
      
      serverProc = spawn(process.execPath, ['mock/server.js'], { stdio: 'inherit' });
      await waitForHealth(`${STAGING_URL}/health`, 20000);
    });

    // 2) Run Playwright (with 1-shot repair/retry)
    await trackStep('playwright', async () => {
      try {
        await runPlaywright(specList, ENV);
      } catch (err) {
        const shouldRetry = await maybeRepair(auvId, err);
        if (!shouldRetry) throw new RunbookError(`Playwright tests failed: ${err.message}`, 'playwright', 101);
        repaired = true;
        await runPlaywright(specList, ENV);
      }
    });

    // 3) Lighthouse perf proof
    await trackStep('lighthouse', async () => {
      try {
        await runNodeScript('scripts/perf_lighthouse.mjs', [cfg.perfUrl(STAGING_URL), cfg.perfOut], ENV);
      } catch (err) {
        throw new RunbookError(`Lighthouse failed: ${err.message}`, 'lighthouse', 102);
      }
    });

    // 4) CVF gate
    await trackStep('cvf', async () => {
      try {
        await runNodeScript('orchestration/cvf-check.mjs', [cfg.cvfId], ENV);
      } catch (err) {
        throw new RunbookError(`CVF gate failed: ${err.message}`, 'cvf', 103);
      }
    });

    // 5) Result card
    const totalDuration = Date.now() - startTime;
    const cardPath = `runs/${auvId}/result-cards/runbook-summary.json`;
    
    // Observability breadcrumb
    appendHookLine({ ts: Date.now()/1000, event: 'RunbookSucceeded', auv: auvId, steps });
    
    // Collect artifacts and performance data
    const art = expectedArtifacts(auvId).filter(p => fs.existsSync(p));
    const perfFile = (cfg.perfOut && fs.existsSync(cfg.perfOut)) ? cfg.perfOut : null;
    const perf = perfFile ? readLighthouseMetrics(perfFile) : null;
    
    fs.mkdirSync(path.dirname(cardPath), { recursive: true });
    fs.writeFileSync(cardPath, JSON.stringify({
      version: "1.0",
      ts: Date.now() / 1000,
      event: 'RunbookDone',
      auv: auvId,
      duration_ms: totalDuration,
      steps,
      repaired,
      artifacts: art,
      perf,
      env: {
        STAGING_URL,
        API_BASE,
        NODE_ENV: process.env.NODE_ENV
      },
      ok: true,
    }, null, 2));
    log('DONE:', auvId, '→', cardPath, `(${totalDuration}ms)`);

  } catch (err) {
    // Observability breadcrumb
    appendHookLine({ ts: Date.now()/1000, event: 'RunbookFailed', auv: auvId, step: err.step || 'unknown', error: err.message });
    
    // Write failure result card
    const totalDuration = Date.now() - startTime;
    const cardPath = `runs/${auvId}/result-cards/runbook-summary.json`;
    try {
      fs.mkdirSync(path.dirname(cardPath), { recursive: true });
      fs.writeFileSync(cardPath, JSON.stringify({
        version: "1.0",
        ts: Date.now() / 1000,
        event: 'RunbookFailed', 
        auv: auvId,
        duration_ms: totalDuration,
        steps: steps,
        error: err.message,
        error_step: err.step || 'unknown',
        exit_code: err.exitCode || 1,
        env: {
          STAGING_URL: STAGING_URL,
          API_BASE: API_BASE,
          NODE_ENV: process.env.NODE_ENV
        },
        ok: false,
      }, null, 2));
    } catch (cardErr) {
      log('Failed to write error card:', cardErr.message);
    }
    throw err;
  } finally {
    cleanup();
  }
}
