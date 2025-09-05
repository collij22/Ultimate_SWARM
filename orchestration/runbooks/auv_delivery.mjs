#!/usr/bin/env node
/**
 * Swarm1 — AUV Delivery Runbook (v0.5: auto-author tests + 1-shot repair/retry)
 * Drives: start server → (ensure tests) → Playwright → Lighthouse → CVF → summary card.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ensureTests } from '../lib/test_authoring.mjs';

// Minimal per-AUV config; perf and CVF details stay here.
const AUV_MAP = {
  'AUV-0002': {
    // Keep hard-coded specs for 0002 (already hand-written)
    specs: [
      'tests/robot/playwright/add-to-cart.spec.ts',
      'tests/robot/playwright/api/cart.spec.ts',
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
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Health check failed for ${url} after ${timeoutMs}ms${lastErr ? ': ' + lastErr : ''}`);
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

/** Basic repair plan: capture failure context and retry Playwright once.
 *  Later you can call Debugger / Rapid Builder here and then re-run tests.
 */
async function maybeRepair(auvId, err) {
  const dir = path.resolve(process.cwd(), 'runs', auvId, 'repair');
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    ts: Date.now() / 1000,
    event: 'RepairPlan',
    auv: auvId,
    error: String(err),
    hint: 'Retry once. TODO: call Debugger & Rapid Builder to auto-fix then re-run.',
  };
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify(payload, null, 2), 'utf8');
  console.warn(`[repair] ${auvId}: captured failure; retrying once...`);
  return true; // signal to retry once
}

export async function runAuv(auvId, { stagingUrl, apiBase } = {}) {
  const cfg = AUV_MAP[auvId];
  if (!cfg) throw new Error(`Unknown AUV id: ${auvId}`);

  const STAGING_URL = stagingUrl || process.env.STAGING_URL || 'http://127.0.0.1:3000';
  const API_BASE    = apiBase    || process.env.API_BASE    || 'http://127.0.0.1:3000/api';
  const ENV = { ...process.env, STAGING_URL, API_BASE, AUV_ID: auvId };

  // Ensure perf dir exists
  fs.mkdirSync(path.dirname(cfg.perfOut), { recursive: true });

  // 0) Determine spec list (from capabilities; auto-create if missing)
  let specList = cfg.specs;
  if (!specList) {
    specList = ensureTests(auvId); // creates them if missing
    if (!Array.isArray(specList) || specList.length === 0) {
      throw new Error(`No specs found or generated for ${auvId}`);
    }
    log('specs for', auvId, '→', specList.join(', '));
  }

  // 1) Start mock server
  log('starting mock server...');
  const serverProc = spawn(process.execPath, ['mock/server.js'], { stdio: 'inherit' });
  const cleanup = () => { try { serverProc.kill(); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  let repaired = false;

  try {
    // 2) Wait for /health
    await waitForHealth(`${STAGING_URL}/health`, 20000);
    log('server healthy');

    // 3) Run Playwright (with 1-shot repair/retry)
    try {
      await runPlaywright(specList, ENV);
    } catch (err) {
      const shouldRetry = await maybeRepair(auvId, err);
      if (!shouldRetry) throw err;
      repaired = true;
      await runPlaywright(specList, ENV);
    }

    // 4) Lighthouse perf proof
    await runNodeScript('scripts/perf_lighthouse.mjs', [cfg.perfUrl(STAGING_URL), cfg.perfOut], ENV);

    // 5) CVF gate
    await runNodeScript('orchestration/cvf-check.mjs', [cfg.cvfId], process.env);

    // 6) Result card
    const cardPath = `runs/${auvId}/result-cards/runbook-summary.json`;
    fs.mkdirSync(path.dirname(cardPath), { recursive: true });
    fs.writeFileSync(cardPath, JSON.stringify({
      ts: Date.now() / 1000,
      event: 'RunbookDone',
      auv: auvId,
      steps: ['ensure-tests', 'playwright', (repaired ? 'repair+retry' : null), 'lighthouse', 'cvf'].filter(Boolean),
      ok: true,
    }, null, 2));
    log('DONE:', auvId, '→', cardPath);
  } finally {
    cleanup();
  }
}
