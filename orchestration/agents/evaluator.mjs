import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { validateAgentOutputObject } from '../lib/agent_output_validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function loadTasks(dir = 'tests/agents/synthetic') {
  const absDir = path.join(projectRoot, dir);
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => ({ id: path.basename(f, path.extname(f)), file: path.join(absDir, f) }));
}

function scoreAgentOutputSchema(task) {
  // Task fields: { input_file }
  const dataPath = path.isAbsolute(task.input_file)
    ? task.input_file
    : path.join(projectRoot, task.input_file);
  try {
    const obj = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const res = validateAgentOutputObject(obj);
    return {
      ok: res.ok,
      score: res.ok ? 1 : 0,
      violations: res.ok ? [] : res.errors.map((e) => e.message),
    };
  } catch (err) {
    return { ok: false, score: 0, violations: [err.message] };
  }
}

export async function evaluateAgent({
  agentId,
  tasksDir = 'tests/agents/synthetic',
  outDir = 'runs/agents/scorecards',
}) {
  const tasks = loadTasks(tasksDir);
  const results = [];

  for (const t of tasks) {
    const spec = YAML.parse(fs.readFileSync(t.file, 'utf8')) || {};
    const type = spec.type;
    let r = { ok: false, score: 0, violations: [], duration_ms: 0 };
    const start = Date.now();
    try {
      if (type === 'agent-output-schema') {
        r = { ...scoreAgentOutputSchema(spec), duration_ms: 0 };
      } else {
        r = { ok: false, score: 0, violations: [`Unknown task type: ${type}`], duration_ms: 0 };
      }
    } catch (err) {
      r = { ok: false, score: 0, violations: [err.message], duration_ms: 0 };
    }
    r.duration_ms = Date.now() - start;
    results.push({ task_id: t.id, capability: spec.capability || 'unknown', ...r });
  }

  const avg = results.length > 0 ? results.reduce((a, b) => a + b.score, 0) / results.length : 0;
  const byCap = {};
  for (const r of results) {
    if (!byCap[r.capability]) byCap[r.capability] = { sum: 0, n: 0 };
    byCap[r.capability].sum += r.score;
    byCap[r.capability].n += 1;
  }
  const by_capability = Object.fromEntries(
    Object.entries(byCap).map(([k, v]) => [k, v.n ? v.sum / v.n : 0]),
  );

  const scorecard = {
    agent_id: agentId,
    ts: Date.now() / 1000,
    results,
    summary: { avg_score: avg, by_capability },
  };

  const outPath = path.join(projectRoot, outDir, `${agentId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(scorecard, null, 2));
  return { outPath, scorecard };
}
