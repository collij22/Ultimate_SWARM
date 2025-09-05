#!/usr/bin/env node
/**
 * Swarm1 — AUV Delivery Runbook (v0.3, Windows-safe)
 * Drives: start server → Playwright specs → Lighthouse → CVF → summary card.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Minimal per-AUV config (extend as you add slices)
const AUV_MAP = {
  'AUV-0002': {
    specs: [
      'tests/robot/playwright/add-to-cart.spec.ts',
      'tests/robot/playwright/api/cart.spec.ts',
    ],
    perfUrl: (base) => `${base}/products.html`,
    perfOut: 'runs/AUV-0002/perf/lighthouse.json',
    cvfId: 'AUV-0002',
  },
  'AUV-0003': {
    specs: [
      'tests/robot/playwright/products-filter.spec.ts',
    ],
    perfUrl: (base) => `${base}/products.html`,
    perfOut: 'runs/AUV-0003/perf/lighthouse.json',
    cvfId: 'AUV-0003',
  },
};

function log(...args) { console.log('[runbook]', ...args); }

async function waitForHealth(url, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { lastErr = e; }
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

// Run a shell command (Windows-safe). `cmd` is a single string.
function runShell(cmd, env) {
  log('sh>', cmd);
  return spawnP(cmd, [], { env, shell: true });
}

// Always use NPX in a shell to avoid .cmd spawning quirks on Windows.
async function runPlaywright(specs, env) {
  // Quote each spec to survive spaces
  const specArgs = specs.map(s => `"${s.replace(/"/g, '\\"')}"`).join(' ');
  const pw = `npx playwright test -c "tests/robot/playwright/playwright.config.ts" ${specArgs}`;
  await runShell(pw, env);
}

async function runNodeScript(script, args, env) {
  log('node', script, ...args);
  await spawnP(process.execPath, [script, ...args], { env });
}

export async function runAuv(auvId, { stagingUrl, apiBase } = {}) {
  const cfg = AUV_MAP[auvId];
  if (!cfg) throw new Error(`Unknown AUV id: ${auvId}`);

  const STAGING_URL = stagingUrl || process.env.STAGING_URL || 'http://127.0.0.1:3000';
  const API_BASE    = apiBase    || process.env.API_BASE    || 'http://127.0.0.1:3000/api';

  // Ensure result dirs exist
  fs.mkdirSync(path.dirname(cfg.perfOut), { recursive: true });

  // 1) Start mock server
  log('starting mock server...');
  const serverProc = spawn(process.execPath, ['mock/server.js'], { stdio: 'inherit' });
  const cleanup = () => { try { serverProc.kill(); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    // 2) Wait for /health
    await waitForHealth(`${STAGING_URL}/health`, 20000);
    log('server healthy');

    // 3) Run Playwright specs (Windows-safe via shell+npx)
    await runPlaywright(cfg.specs, { ...process.env, STAGING_URL, API_BASE, AUV_ID: auvId });

    // 4) Lighthouse perf proof
    await runNodeScript('scripts/perf_lighthouse.mjs', [cfg.perfUrl(STAGING_URL), cfg.perfOut], { ...process.env, STAGING_URL, API_BASE, AUV_ID: auvId });

    // 5) CVF gate
    await runNodeScript('orchestration/cvf-check.mjs', [cfg.cvfId], process.env);

    // 6) Result card
    const cardPath = `runs/${auvId}/result-cards/runbook-summary.json`;
    fs.mkdirSync(path.dirname(cardPath), { recursive: true });
    fs.writeFileSync(cardPath, JSON.stringify({
      ts: Date.now() / 1000,
      event: 'RunbookDone',
      auv: auvId,
      steps: ['playwright', 'lighthouse', 'cvf'],
      ok: true,
    }, null, 2));
    log('DONE:', auvId, '→', cardPath);
  } finally {
    cleanup();
  }
}