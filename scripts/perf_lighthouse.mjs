#!/usr/bin/env node
/**
 * Run Lighthouse against the products page and store JSON results.
 * Usage:
 *   node scripts/perf_lighthouse.mjs http://localhost:3000/products.html runs/AUV-0002/perf/lighthouse.json
 */
import fs from 'fs';
import path from 'path';
import lighthouse from 'lighthouse';
import chromeLauncher from 'chrome-launcher';

const url = process.argv[2] || process.env.LH_URL || 'http://localhost:3000/products.html';
const outPath = process.argv[3] || 'runs/AUV-0002/perf/lighthouse.json';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const options = { logLevel: 'error', output: 'json', onlyCategories: ['performance'], port: chrome.port };
const runnerResult = await lighthouse(url, options);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, runnerResult.report);

console.log('[lighthouse] perf.score =', runnerResult.lhr.categories.performance.score);
await chrome.kill();
