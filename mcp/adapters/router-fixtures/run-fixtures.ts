// mcp/adapters/router-fixtures/run-fixtures.ts
import fs from 'fs';
import path from 'path';
import * as yaml from 'yaml';

type AnyObj = Record<string, any>;

function readYaml(p: string): any {
  const txt = fs.readFileSync(p, 'utf-8');
  return yaml.parse(txt);
}

function toSet<T>(arr: T[] | undefined): Set<T> {
  return new Set((arr ?? []) as T[]);
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function arrayEqAsSets(a: string[] | undefined, b: string[] | undefined): boolean {
  const A = new Set(a ?? []), B = new Set(b ?? []);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

function deepSubsetMatch(expected: AnyObj, actual: AnyObj, pathStr: string = ''): string[] {
  // returns list of mismatch descriptions; empty = OK
  const mismatches: string[] = [];
  for (const k of Object.keys(expected)) {
    const e = expected[k];
    const a = actual[k];
    const keyPath = pathStr ? `${pathStr}.${k}` : k;

    if (Array.isArray(e)) {
      if (!Array.isArray(a) || !arrayEqAsSets(e, a)) {
        mismatches.push(`Field ${keyPath}: expected array ≈ ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
      }
    } else if (e && typeof e === 'object') {
      if (!a || typeof a !== 'object') {
        mismatches.push(`Field ${keyPath}: expected object, got ${typeof a}`);
      } else {
        mismatches.push(...deepSubsetMatch(e, a, keyPath));
      }
    } else {
      if (e !== a) mismatches.push(`Field ${keyPath}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
    }
  }
  return mismatches;
}

function loadPolicies(policiesPath: string) {
  const pol = readYaml(policiesPath);
  const capMap: Record<string,string[]> = pol?.capability_map ?? {};
  const agents: AnyObj = pol?.agents ?? {};
  const routing: AnyObj = pol?.routing ?? { prefer_primary: true };
  const tiers: AnyObj = pol?.tiers ?? {};
  const secondaryBudgetDefault = tiers?.secondary?.default_budget_usd ?? 0;
  const budgetOverrides: AnyObj = tiers?.secondary?.budget_overrides ?? {};
  return { capMap, agents, routing, tiers, secondaryBudgetDefault, budgetOverrides };
}

function loadRegistry(registryPath: string) {
  const reg = readYaml(registryPath);
  const version = reg?.version ?? 1;
  const toolsObj: AnyObj = reg?.tools ?? {};
  // Normalize: id -> metadata
  const tools: Record<string, AnyObj> = {};
  for (const [id, meta] of Object.entries(toolsObj)) {
    tools[id] = meta as AnyObj;
  }
  return { version, tools };
}

function classifyTools(tools: string[], registry: AnyObj) {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const t of tools) {
    const tier = registry.tools[t]?.tier ?? 'primary';
    (tier === 'secondary' ? secondary : primary).push(t);
  }
  return { primary, secondary };
}

function intersect(a: string[], b: string[]): string[] {
  const B = new Set(b);
  return a.filter(x => B.has(x));
}

function toolBudget(tool: string, def: number, overrides: Record<string, number>) {
  return overrides[tool] ?? def;
}

function computeToolPlan(input: AnyObj, pol: ReturnType<typeof loadPolicies>, reg: ReturnType<typeof loadRegistry>) {
  const agent = input.agent as string;
  const reqCaps: string[] = input.requested_capabilities ?? [];
  const agentCfg: AnyObj | undefined = pol.agents?.[agent];

  const allowPrimaries: string[] = [];
  const secondaryCandidates: string[] = [];
  const proposals: Set<string> = new Set();
  let proposedBudgetTotal = 0;

  for (const cap of reqCaps) {
    const candidates = pol.capMap[cap] ?? [];
    if (candidates.length === 0) {
      return {
        escalation: {
          type: 'missing-capability-map',
          message: `No tools mapped for capability '${cap}'`,
          request: [`Add at least one tool to capability_map.${cap}`]
        }
      };
    }
    const { primary, secondary } = classifyTools(candidates, reg);

    // Apply agent allowlist if present
    let allowedPrim = primary.slice();
    let allowedSec = secondary.slice();
    if (agentCfg?.allowlist) {
      const aaPrim: string[] = agentCfg.allowlist.primary ?? [];
      const aaSec: string[] = agentCfg.allowlist.secondary ?? [];
      allowedPrim = intersect(primary, aaPrim.length ? aaPrim : primary);
      allowedSec = intersect(secondary, aaSec.length ? aaSec : secondary);
    }

    if (pol.routing?.prefer_primary !== false && allowedPrim.length > 0) {
      // Grant all primaries for this capability (or could prefer first)
      for (const t of allowedPrim) allowPrimaries.push(t);
    } else if (allowedSec.length > 0) {
      // Propose secondary (consent path)
      for (const t of allowedSec) {
        if (!proposals.has(t)) {
          proposals.add(t);
          proposedBudgetTotal += toolBudget(t, pol.secondaryBudgetDefault, pol.budgetOverrides);
        }
      }
    } else {
      // Neither primary nor secondary available after allowlist
      return {
        escalation: {
          type: 'missing-allowlist',
          message: `No permitted tools intersect capability '${cap}' for agent ${agent}`,
          request: [
            `Add one of [${candidates.join(', ')}] to agents.${agent}.allowlist.primary/secondary`,
            `Or add another tool to capability_map.${cap}`
          ]
        }
      };
    }
  }

  const allowlist = uniq(allowPrimaries);
  const plan: AnyObj = { allowlist };

  // include secondary candidates (informational) if agent lists secondary in allowlist
  if (agentCfg?.allowlist?.secondary && agentCfg.allowlist.secondary.length) {
    const secPrefs = agentCfg.allowlist.secondary;
    const mappedSec = reqCaps.flatMap(cap => {
      const cands = pol.capMap[cap] ?? [];
      return cands.filter(t => reg.tools[t]?.tier === 'secondary' && secPrefs.includes(t));
    });
    plan.secondary_candidates = uniq(mappedSec);
  }

  if (proposals.size > 0) {
    const list = Array.from(proposals);
    plan.proposal = {
      secondary: list,
      budget_usd: list.length === 1
        ? toolBudget(list[0], pol.secondaryBudgetDefault, pol.budgetOverrides)
        : list.reduce((sum, t) => sum + toolBudget(t, pol.secondaryBudgetDefault, pol.budgetOverrides), 0)
    };
  }

  // Validation warnings (advisory): registry.yaml capabilities mismatch
  const warnings: string[] = [];
  for (const cap of reqCaps) {
    const candidates = pol.capMap[cap] ?? [];
    for (const t of candidates) {
      const caps = reg.tools[t]?.capabilities;
      if (caps && !caps.includes(cap)) {
        warnings.push(`Registry metadata: tool '${t}' does not list capability '${cap}'`);
      }
    }
  }
  if (warnings.length) plan.warnings = warnings;

  return plan;
}

function main() {
  const repoRoot = path.resolve(__dirname, '../../..');
  const fixturesDir = path.resolve(__dirname);
  const policiesPath = path.join(repoRoot, 'mcp/policies.yaml');
  const registryPath = path.join(repoRoot, 'mcp/registry.yaml');

  if (!fs.existsSync(policiesPath) || !fs.existsSync(registryPath)) {
    console.error(`Missing policies or registry:\n- ${policiesPath}\n- ${registryPath}`);
    process.exit(1);
  }

  const pol = loadPolicies(policiesPath);
  const reg = loadRegistry(registryPath);

  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.yaml'));
  let pass = 0, fail = 0;

  for (const f of files) {
    const p = path.join(fixturesDir, f);
    const fx = readYaml(p);
    const actual = computeToolPlan(fx.input, pol, reg);
    const expected = fx.expected;

    let mismatches: string[] = [];
    if ('escalation' in expected) {
      if (!('escalation' in actual)) {
        mismatches.push(`Expected escalation but got tool plan: ${JSON.stringify(actual, null, 2)}`);
      } else {
        mismatches = deepSubsetMatch(expected.escalation, (actual as any).escalation);
      }
    } else {
      if ('escalation' in actual) {
        mismatches.push(`Unexpected escalation: ${JSON.stringify(actual, null, 2)}`);
      } else {
        mismatches = deepSubsetMatch(expected, actual);
      }
    }

    const ok = mismatches.length === 0;
    if (ok) pass++; else fail++;

    console.log(`\n=== ${fx.name || f} — ${ok ? 'PASS' : 'FAIL'} ===`);
    if (!ok) {
      console.log('Mismatches:');
      for (const m of mismatches) console.log(' - ' + m);
      console.log('\nExpected:');
      console.log(JSON.stringify(expected, null, 2));
      console.log('\nActual:');
      console.log(JSON.stringify(actual, null, 2));
    } else {
      console.log('Expected ≈ Actual ✓');
    }
  }

  console.log(`\nSummary: PASS=${pass} FAIL=${fail} TOTAL=${pass+fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
