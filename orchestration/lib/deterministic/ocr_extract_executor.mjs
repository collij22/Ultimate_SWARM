import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

export async function executeOcrExtract({ imagePath, tenant, runId }) {
  // Deterministic stub: no OCR engine dependency; writes empty extraction
  const outDir = tenantPath(tenant, `runs/${runId || 'latest'}/ocr`);
  const outPath = path.join(outDir, `ocr.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = { text: '', bbox: [0, 0, 0, 0], fields: {} };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { status: 'success', artifacts: [outPath], outputs: payload };
}


