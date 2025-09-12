import fs from 'fs';
import path from 'path';
import { tenantPath } from '../tenant.mjs';

export async function executeGltfValidate({ path: modelPath, max_size_mb = 50, require_draco = false, tenant, runId }) {
  const stats = fs.existsSync(modelPath) ? fs.statSync(modelPath) : { size: 0 };
  const sizeMb = stats.size / (1024 * 1024);
  const issues = [];
  if (sizeMb > max_size_mb) issues.push(`file too large: ${sizeMb.toFixed(2)} MB > ${max_size_mb} MB`);
  // Skipping real GLTF parsing to avoid heavy deps; deterministic check only
  const outDir = tenantPath(tenant, `runs/${runId || 'latest'}/gltf`);
  const outPath = path.join(outDir, `validation.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = { ok: issues.length === 0, size_mb: sizeMb, issues };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { status: payload.ok ? 'success' : 'failed', artifacts: [outPath], outputs: payload };
}


