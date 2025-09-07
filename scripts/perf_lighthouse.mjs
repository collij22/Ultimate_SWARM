#!/usr/bin/env node
/**
 * Swarm1 — Lighthouse perf proof (robust, local-friendly)
 * Usage:
 *   node scripts/perf_lighthouse.mjs http://127.0.0.1:3000/products.html runs/AUV-0002/perf/lighthouse.json
 */
import fs from 'fs';
import path from 'path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

// Prefer 127.0.0.1 over localhost to avoid DNS/proxy quirks & interstitials
const inUrl = process.argv[2] || process.env.LH_URL || 'http://127.0.0.1:3000/products.html';
const url = inUrl.replace('localhost', '127.0.0.1');
const outPath = process.argv[3] || 'runs/AUV-0002/perf/lighthouse.json';

const chrome = await launch({
  chromeFlags: [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-insecure-localhost',
    '--ignore-certificate-errors',
    '--disable-client-side-phishing-detection',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
    '--window-size=1366,768',
  ],
});

const options = {
  logLevel: 'error',
  output: 'json',
  onlyCategories: ['performance'],
  port: chrome.port,
};

let lhr;
try {
  const runnerResult = await lighthouse(url, options);
  const rawReport = Array.isArray(runnerResult.report)
    ? runnerResult.report[0]
    : runnerResult.report;
  lhr = typeof rawReport === 'string' ? JSON.parse(rawReport) : runnerResult.lhr || rawReport;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(lhr));
} finally {
  await chrome.kill();
}

const perfScore = lhr?.categories?.performance?.score;
const lcpMs = lhr?.audits?.['largest-contentful-paint']?.numericValue;
if (typeof perfScore === 'number') {
  console.log('[lighthouse] perf.score =', perfScore);
  if (typeof lcpMs === 'number') console.log('[lighthouse] LCP(ms) =', Math.round(lcpMs));
} else {
  const rtErr = lhr?.runtimeError;
  console.log('[lighthouse] perf.score = n/a');
  if (rtErr) {
    console.log('[lighthouse] runtimeError:', rtErr.code, '-', rtErr.message);
    console.log('[lighthouse] Saved JSON for inspection at:', outPath);
  } else {
    console.log('[lighthouse] note: performance category missing; check:', outPath);
  }
}
