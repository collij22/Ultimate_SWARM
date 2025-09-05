#!/usr/bin/env node
/**
 * Swarm1 — Orchestration CLI
 * Usage: node orchestration/cli.mjs AUV-0003
 */
import { runAuv } from './runbooks/auv_delivery.mjs';

const auvId = process.argv[2];
if (!auvId) {
  console.error('Usage: node orchestration/cli.mjs <AUV-ID>');
  process.exit(2);
}

runAuv(auvId).catch(err => {
  console.error('[runbook] FAILED:', err?.stack || err);
  process.exit(1);
});
