import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

export async function executeNlpExtract({ content, schema = {}, tenant, runId }) {
  // Simple key:value line extractor as deterministic baseline
  const fields = {};
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_\- ]+)\s*:\s*(.+)$/);
    if (m) fields[m[1].toLowerCase()] = m[2];
  }
  const outDir = tenantPath(tenant, `runs/${runId || 'latest'}/nlp`);
  const outPath = path.join(outDir, `extraction.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = { fields, confidence: 1.0 };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { status: 'success', artifacts: [outPath], outputs: payload };
}


