import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

export async function executeAudioTranscribe({ audioPath, tenant, runId }) {
  // Deterministic stub: writes a placeholder transcript; real impl can wire offline ASR later
  const text = 'TRANSCRIPT_PLACEHOLDER';
  const outDir = tenantPath(tenant, `runs/${runId || 'latest'}/asr`);
  const outPath = path.join(outDir, `transcript.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = { text, duration_sec: 0, language: 'en', segments: [] };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { status: 'success', artifacts: [outPath], outputs: payload };
}


