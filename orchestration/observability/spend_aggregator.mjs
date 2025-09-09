import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

export function aggregateSpend({
  ledgersDir = 'runs/observability/ledgers',
  outFile = 'reports/observability/spend.json',
} = {}) {
  const absDir = path.join(projectRoot, ledgersDir);
  const result = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    totals: { usd: 0 },
    by_tool: {},
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
    if (!result.by_tool[tool]) result.by_tool[tool] = { usd: 0, count: 0 };
    result.by_tool[tool].usd += usd;
    result.by_tool[tool].count += 1;
    result.totals.usd += usd;
  }

  const outPath = path.join(projectRoot, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  return outPath;
}
