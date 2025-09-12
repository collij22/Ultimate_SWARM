#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return parseEnv(content);
}

function setEnv(vars, overwrite = false) {
  for (const [k, v] of Object.entries(vars)) {
    if (!overwrite && process.env[k] !== undefined) continue;
    process.env[k] = v;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes('--overwrite');
  const customIdx = args.indexOf('--file');
  const repoRoot = process.cwd();

  // Default search order: .env.local, then .env
  const files = [];
  if (customIdx > -1 && args[customIdx + 1]) {
    files.push(path.resolve(args[customIdx + 1]));
  } else {
    files.push(path.resolve(repoRoot, '.env.local'));
    files.push(path.resolve(repoRoot, '.env'));
  }

  let loaded = {};
  for (const f of files) {
    const envs = loadEnvFile(f);
    loaded = { ...loaded, ...envs };
  }

  if (Object.keys(loaded).length === 0) {
    console.warn('[load_env] No env vars loaded (no .env/.env.local found or empty).');
  }

  setEnv(loaded, overwrite);

  // Print summary (redact any keys ending with _KEY, _TOKEN, _SECRET, API_KEY)
  const redacted = {};
  for (const [k, v] of Object.entries(loaded)) {
    if (/(?:_KEY|_TOKEN|_SECRET|API_KEY)$/i.test(k)) redacted[k] = '***SET***';
    else redacted[k] = v;
  }

  console.log('[load_env] Loaded variables:', JSON.stringify(redacted, null, 2));
}

main().catch((e) => {
  console.error('[load_env] Error:', e?.message || e);
  process.exit(1);
});


