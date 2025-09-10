import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function loadRegistry() {
  const registryPath = path.join(projectRoot, 'mcp/registry.yaml');
  if (!fs.existsSync(registryPath)) return {};
  const content = fs.readFileSync(registryPath, 'utf8');
  const registry = yaml.parse(content);

  // Create tool -> tier mapping
  const toolTiers = {};
  for (const [toolId, tool] of Object.entries(registry.tools || {})) {
    toolTiers[toolId] = tool.tier || 'primary';
  }
  return toolTiers;
}

export function aggregateSpend({
  ledgersDir = 'runs/observability/ledgers',
  outFile = 'reports/observability/spend.json',
} = {}) {
  const absDir = path.join(projectRoot, ledgersDir);
  const toolTiers = loadRegistry();

  const result = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    totals: { usd: 0 },
    by_tool: {},
    by_tier: { primary: { usd: 0, count: 0 }, secondary: { usd: 0, count: 0 } },
    by_capability: {},
    secondary: { total_usd: 0, tools: {} },
  };

  if (!fs.existsSync(absDir)) {
    const outPath = path.join(projectRoot, outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    return outPath;
  }

  const entries = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .flatMap((f) => readJsonl(path.join(absDir, f)));

  for (const e of entries) {
    const tool = e.tool_id || 'unknown';
    const usd = Number(e.estimated_cost_usd || 0);
    // Use first capability from array or fall back to 'unknown'
    const capability =
      (Array.isArray(e.capabilities) && e.capabilities[0]) || e.capability || 'unknown';
    const tier = toolTiers[tool] || 'primary';

    // By tool
    if (!result.by_tool[tool]) result.by_tool[tool] = { usd: 0, count: 0 };
    result.by_tool[tool].usd += usd;
    result.by_tool[tool].count += 1;

    // By tier
    result.by_tier[tier].usd += usd;
    result.by_tier[tier].count += 1;

    // By capability
    if (!result.by_capability[capability]) result.by_capability[capability] = { usd: 0, count: 0 };
    result.by_capability[capability].usd += usd;
    result.by_capability[capability].count += 1;

    // Secondary tools breakdown
    if (tier === 'secondary') {
      result.secondary.total_usd += usd;
      if (!result.secondary.tools[tool]) {
        result.secondary.tools[tool] = { usd: 0, count: 0, capabilities: {} };
      }
      result.secondary.tools[tool].usd += usd;
      result.secondary.tools[tool].count += 1;
      if (!result.secondary.tools[tool].capabilities[capability]) {
        result.secondary.tools[tool].capabilities[capability] = { usd: 0, count: 0 };
      }
      result.secondary.tools[tool].capabilities[capability].usd += usd;
      result.secondary.tools[tool].capabilities[capability].count += 1;
    }

    // Total
    result.totals.usd += usd;
  }

  const outPath = path.join(projectRoot, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  // Also write secondary-specific report
  const secondaryPath = path.join(projectRoot, 'reports/observability/secondary_spend.json');
  fs.writeFileSync(
    secondaryPath,
    JSON.stringify(
      {
        version: '1.0',
        generated_at: result.generated_at,
        secondary: result.secondary,
        by_tier: result.by_tier,
      },
      null,
      2,
    ),
  );

  return outPath;
}
