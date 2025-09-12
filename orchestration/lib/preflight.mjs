#!/usr/bin/env node
/**
 * Preflight Doctor — environment, binaries, fixtures, and router config checks
 * Writes actionable diagnostics to runs/diagnostics/preflight.json
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const thisFile = fileURLToPath(import.meta.url);

function which(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(cmd, [bin], { encoding: 'utf8', shell: true });
  return res.status === 0;
}

function checkBinary(name) {
  return { name, ok: which(name) };
}

function checkFile(p) {
  try {
    return { path: p, ok: fs.existsSync(p) };
  } catch {
    return { path: p, ok: false };
  }
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


