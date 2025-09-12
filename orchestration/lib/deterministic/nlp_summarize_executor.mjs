import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

export async function executeNlpSummarize({ content, max_sentences = 3, format = 'md', tenant, runId }) {
  const sentences = String(content)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(10, max_sentences)));
  const summary = sentences.join(' ');
  const outDir = tenantPath(tenant, `runs/${runId || 'latest'}/nlp`);
  const outPath = path.join(outDir, `summary.${format === 'md' ? 'md' : 'txt'}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, summary);
  return { status: 'success', artifacts: [outPath], outputs: { summary } };
}


