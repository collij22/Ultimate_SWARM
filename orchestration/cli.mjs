#!/usr/bin/env node
/**
 * Swarm1 — Orchestration CLI
 * Usage: node orchestration/cli.mjs AUV-0003
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Usage error
 *   101 - Playwright tests failed
 *   102 - Lighthouse performance check failed
 *   103 - CVF gate failed
 *   104 - Test authoring failed
 *   105 - Server startup failed
 */
import { runAuv, RunbookError } from './runbooks/auv_delivery.mjs';
import fs from 'fs';
import path from 'path';

const auvId = process.argv[2];
if (!auvId) {
  console.error('Usage: node orchestration/cli.mjs <AUV-ID>');
  process.exit(2);
}

const startTime = Date.now();

runAuv(auvId).then(() => {
  const duration = Date.now() - startTime;
  console.log(`[cli] SUCCESS: ${auvId} completed in ${duration}ms`);
  process.exit(0);
}).catch(err => {
  const duration = Date.now() - startTime;
  console.error('[cli] FAILED:', err?.message || err);
  
  // Write failure result card
  const cardPath = `runs/${auvId}/result-cards/cli-summary.json`;
  try {
    fs.mkdirSync(path.dirname(cardPath), { recursive: true });
    fs.writeFileSync(cardPath, JSON.stringify({
      version: "1.0",
      ts: Date.now() / 1000,
      event: 'CliFailed',
      auv: auvId,
      duration_ms: duration,
      error: err?.message || String(err),
      error_step: err?.step || 'unknown',
      env: {
        STAGING_URL: process.env.STAGING_URL,
        API_BASE: process.env.API_BASE,
        NODE_ENV: process.env.NODE_ENV
      },
      ok: false,
    }, null, 2));
  } catch (cardErr) {
    console.error('[cli] Failed to write error card:', cardErr.message);
  }

  // Return typed exit codes based on error type
  if (err instanceof RunbookError) {
    process.exit(err.exitCode);
  }
  
  process.exit(1);
});
