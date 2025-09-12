#!/usr/bin/env node
/**
 * Preflight Doctor (Phase 16) — Comprehensive system diagnostics
 * 
 * Checks environment, binaries, fixtures, router config, and more
 * Writes actionable diagnostics to runs/diagnostics/preflight.json
 */
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const thisFile = fileURLToPath(import.meta.url);

/**
 * Check if a command exists with better cross-platform support
 */
async function which(command) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where' : 'which';
    
    const proc = spawn(cmd, [command], { shell: true });
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('exit', (code) => {
      resolve(code === 0 ? output.trim().split('\n')[0] : null);
    });
    
    proc.on('error', () => resolve(null));
  });
}

/**
 * Synchronous which for backwards compatibility
 */
function whichSync(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(cmd, [bin], { encoding: 'utf8', shell: true });
  return res.status === 0;
}

function checkBinary(name) {
  return { name, ok: whichSync(name) };
}

function checkFile(p) {
  try {
    return { path: p, ok: fs.existsSync(p) };
  } catch {
    return { path: p, ok: false };
  }
}

/**
 * Check Node.js version
 */
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  const minor = parseInt(version.slice(1).split('.')[1]);
  
  return {
    version,
    major,
    minor,
    valid: major >= 20,
    message: major >= 20 ? 'OK' : `Node.js ${version} is too old (need v20+)`
  };
}

/**
 * Check environment variables (including new API keys)
 */
function checkEnvironment() {
  const env = {
    // Core
    NODE_ENV: process.env.NODE_ENV || 'development',
    TEST_MODE: process.env.TEST_MODE || 'true',
    STAGING_URL: process.env.STAGING_URL || 'http://127.0.0.1:3000',
    API_BASE: process.env.API_BASE || 'http://127.0.0.1:3000/api',
    
    // API Keys (optional but tracked)
    REF_API_KEY: process.env.REF_API_KEY ? '***SET***' : undefined,
    BRAVE_API_KEY: process.env.BRAVE_API_KEY ? '***SET***' : undefined,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? '***SET***' : undefined,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY ? '***SET***' : undefined,
    STRIPE_API_KEY: process.env.STRIPE_API_KEY ? '***SET***' : undefined,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '***SET***' : undefined,
    TTS_CLOUD_API_KEY: process.env.TTS_CLOUD_API_KEY ? '***SET***' : undefined
  };
  
  const hasLiveKeys = !!(
    process.env.YOUTUBE_API_KEY ||
    process.env.FIRECRAWL_API_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  );
  
  return { ...env, hasLiveKeys };
}

function writeDiagnostics(out) {
  const outDir = path.join(process.cwd(), 'runs', 'diagnostics');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'preflight.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  return outPath;
}

export async function runPreflight(options = {}) {
  const testMode = process.env.TEST_MODE === 'true';
  const diagnostics = {
    ts: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    test_mode: testMode,
    env: {
      STAGING_URL: process.env.STAGING_URL || null,
      API_BASE: process.env.API_BASE || null,
      BRAVE_API_KEY: process.env.BRAVE_API_KEY ? 'set' : 'missing',
      REF_API_KEY: process.env.REF_API_KEY ? 'set' : 'missing',
    },
    binaries: {},
    fixtures: {},
    router: { ok: true, issues: [] },
    summary: { ok: true, errors: [], warnings: [] },
  };

  // Binaries
  const requiredBins = ['ffmpeg', 'node'];
  const optionalBins = ['tesseract'];
  diagnostics.binaries.required = requiredBins.map(checkBinary);
  diagnostics.binaries.optional = optionalBins.map(checkBinary);

  for (const b of diagnostics.binaries.required) {
    if (!b.ok) {
      diagnostics.summary.ok = false;
      diagnostics.summary.errors.push(`Missing binary: ${b.name}`);
    }
  }

  // Fixtures
  const fixturePaths = [
    'tests/fixtures/sample-data.csv',
    'mock/public/products.html',
  ];
  diagnostics.fixtures.present = fixturePaths.map(checkFile);
  for (const f of diagnostics.fixtures.present) {
    if (!f.ok) diagnostics.summary.warnings.push(`Fixture missing: ${f.path}`);
  }

  // Router health
  try {
    const { generateCoverageReport } = await import('../../mcp/router-report.mjs');
    const report = generateCoverageReport();
    diagnostics.router.summary = report.summary;
    diagnostics.router.statistics = report.statistics;
    if (report.orphaned_capabilities.length > 0) {
      diagnostics.router.ok = false;
      diagnostics.summary.ok = false;
      diagnostics.summary.errors.push('Router has orphaned capabilities');
    }
    if (report.capabilities_without_primary.length > 0) {
      diagnostics.summary.warnings.push('Some capabilities lack primary tools');
    }
  } catch (e) {
    diagnostics.router.ok = false;
    diagnostics.summary.ok = false;
    diagnostics.summary.errors.push(`Router check failed: ${e.message}`);
  }

  // TEST_MODE policy checks
  if (!testMode) {
    if (!process.env.BRAVE_API_KEY) {
      diagnostics.summary.warnings.push('BRAVE_API_KEY missing; web.search will be disabled');
    }
  }

  // Tailored checks: optional graph path
  const graphPath = options.graph || process.argv.find((a) => a.endsWith('.yaml'));
  if (graphPath && fs.existsSync(graphPath)) {
    try {
      const yamlMod = await import('yaml');
      const yamlLib = yamlMod.default || yamlMod;
      const content = fs.readFileSync(graphPath, 'utf8');
      const graph = yamlLib.parse(content);
      diagnostics.graph = { id: graph.project_id, nodes: graph.nodes?.length || 0 };
      // Quick capability coverage check
      const caps = [];
      for (const n of graph.nodes || []) {
        if (n.type === 'agent_task' && n.params?.capability) caps.push(n.params.capability);
      }
      diagnostics.graph.capabilities = Array.from(new Set(caps));
    } catch (e) {
      diagnostics.summary.warnings.push(`Graph parse failed: ${e.message}`);
    }
  }

  const outPath = writeDiagnostics(diagnostics);
  return { ok: diagnostics.summary.ok, path: outPath, diagnostics };
}

// CLI
if (process.argv[1] === thisFile) {
  (async () => {
    const res = await runPreflight({});
    console.log(`Preflight report: ${res.path}`);
    process.exit(res.ok ? 0 : 501);
  })();
}


