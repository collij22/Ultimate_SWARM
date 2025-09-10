/**
 * MCP Router - Runtime tool selection with policy governance
 * Phase 4 implementation for Swarm1
 *
 * Pure, deterministic capability → tool resolution with:
 * - Primary/Secondary tier enforcement
 * - Budget and consent validation
 * - Agent allowlist filtering
 * - Side effects tracking
 * - Auditable decision records
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { randomUUID } from 'crypto';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTER_VERSION = '1.0.0';

/**
 * Pure routing core - no IO, deterministic
 * @param {Object} params - Parameters for planning tools
 * @param {string} params.agentId - Agent identifier
 * @param {Array<string>} params.requestedCapabilities - Requested capabilities
 * @param {number} params.budgetUsd - Budget in USD
 * @param {boolean} params.secondaryConsent - Secondary consent flag
 * @param {Object.<string, string>} params.env - Environment variables
 * @param {Object} params.registry - Tool registry
 * @param {Object} params.policies - Policy configuration
 * @param {Object} [params.hints] - Optional hints for scale/constraint indication
 * @param {Object} [params.hints.crawl] - Optional crawl hints
 * @param {number} [params.hints.crawl.max_pages] - Maximum pages to crawl
 * @param {number} [params.hints.crawl.depth] - Crawl depth
 * @returns {Object} Tool planning decision
 */
export function planTools({
  agentId,
  requestedCapabilities = [],
  budgetUsd,
  secondaryConsent = false,
  env = {},
  registry,
  policies,
  hints = {}, // NEW: hints for scale/constraint indication
}) {
  // Normalize inputs
  const capabilities = [...new Set(requestedCapabilities)]; // dedupe
  const policyDefaults = policies?.router?.defaults || {
    prefer_tier: 'primary',
    budget_usd: 0.25,
    require_secondary_consent: true,
  };

  // Determine effective budget with tier defaults and per-agent ceilings
  let effectiveBudget = budgetUsd;
  if (effectiveBudget === undefined || effectiveBudget === null) {
    // Check if we should use secondary tier default
    const hasOnlySecondaryTools = capabilities.every((cap) => {
      const tools = policies?.capability_map?.[cap] || [];
      return tools.every((toolId) => registry?.tools?.[toolId]?.tier === 'secondary');
    });

    if (hasOnlySecondaryTools && policies?.tiers?.secondary?.default_budget_usd !== undefined) {
      effectiveBudget = policies.tiers.secondary.default_budget_usd;
    } else {
      effectiveBudget = policyDefaults.budget_usd;
    }
  }

  // Per-agent budget ceilings
  const agentBudgets = policies?.agents?.budgets?.[agentId];
  if (agentBudgets?.total_usd !== undefined) {
    if (effectiveBudget > agentBudgets.total_usd) {
      effectiveBudget = agentBudgets.total_usd;
    }
  }

  const requireConsent = policyDefaults.require_secondary_consent;

  // Initialize result structure
  const decision = {
    router_version: ROUTER_VERSION,
    agent_id: agentId,
    requested_capabilities: capabilities,
    policy_defaults: policyDefaults,
    constraints: {
      budget_usd: effectiveBudget,
      secondary_consent: secondaryConsent,
    },
    candidates: [],
    plan: [],
    rejected: [],
    alternatives: {}, // Track all alternatives considered per capability
    warnings: [],
    totals: { estimated_cost_usd: 0 },
  };

  // Get agent allowlist
  const agentConfig = policies?.agents?.allowlist?.[agentId];
  const allowedTools = agentConfig || [];

  // Resolve capability → tool candidates
  const toolPlan = new Map(); // toolId → { capabilities, tool }
  const capabilityMap = policies?.capability_map || {};
  const preferPrimary = policyDefaults.prefer_tier === 'primary';

  for (const capability of capabilities) {
    const candidateToolIds = capabilityMap[capability] || [];

    // Check hints to determine if Secondary tools are needed
    let preferSecondaryForScale = false;
    if (capability === 'web.crawl' && hints?.crawl) {
      const { max_pages, depth } = hints.crawl;
      // Use Secondary if scale exceeds Primary limits
      if (max_pages > 100 || depth > 2) {
        preferSecondaryForScale = true;
        decision.warnings.push(
          `Scale requirements (max_pages: ${max_pages}, depth: ${depth}) suggest Secondary tool for ${capability}`,
        );
      }
    }

    // Reorder candidates based on tier preference and hints
    let orderedCandidates = [...candidateToolIds];
    if (preferSecondaryForScale) {
      // For scale requirements, prefer Secondary tools first
      const primaryTools = [];
      const secondaryTools = [];

      for (const toolId of candidateToolIds) {
        const tool = registry?.tools?.[toolId];
        if (tool?.tier === 'primary') {
          primaryTools.push(toolId);
        } else {
          secondaryTools.push(toolId);
        }
      }

      orderedCandidates = [...secondaryTools, ...primaryTools]; // Secondary first for scale
    } else if (preferPrimary) {
      const primaryTools = [];
      const secondaryTools = [];

      for (const toolId of candidateToolIds) {
        const tool = registry?.tools?.[toolId];
        if (tool?.tier === 'primary') {
          primaryTools.push(toolId);
        } else {
          secondaryTools.push(toolId);
        }
      }

      orderedCandidates = [...primaryTools, ...secondaryTools];
    }

    decision.candidates.push({ capability, tools: orderedCandidates });

    // Initialize alternatives tracking for this capability
    decision.alternatives[capability] = orderedCandidates.map((toolId) => ({
      tool_id: toolId,
      tier: registry?.tools?.[toolId]?.tier,
      cost_usd: calculateToolCost(registry?.tools?.[toolId] || {}),
      selected: false,
      rejection_reason: null,
    }));

    let toolFound = false;
    let hasPrimary = false;

    // Check if any primary tool exists for this capability
    for (const toolId of orderedCandidates) {
      const tool = registry?.tools?.[toolId];
      if (tool?.tier === 'primary') {
        hasPrimary = true;
        break;
      }
    }

    // Handle on_missing_primary policy
    let allowSecondaryFallback = false;
    let fallbackBudget = effectiveBudget;

    if (!hasPrimary && policies?.router?.on_missing_primary) {
      const action = policies.router.on_missing_primary.action;
      if (action === 'propose_secondary_with_budget') {
        allowSecondaryFallback = true;
        fallbackBudget = policies.router.on_missing_primary.default_budget_usd || effectiveBudget;
        decision.warnings.push(
          `No primary tool for ${capability}, proposing secondary with budget $${fallbackBudget}`,
        );
      }
    }

    for (const toolId of orderedCandidates) {
      const tool = registry?.tools?.[toolId];
      if (!tool) {
        decision.warnings.push(`Tool ${toolId} not found in registry`);
        continue;
      }

      // Check agent allowlist
      if (allowedTools.length > 0 && !allowedTools.includes(toolId)) {
        decision.rejected.push({
          tool_id: toolId,
          reason: 'not in agent allowlist',
          capability,
        });
        // Update alternatives tracking
        const alt = decision.alternatives[capability]?.find((a) => a.tool_id === toolId);
        if (alt) alt.rejection_reason = 'not in agent allowlist';
        continue;
      }

      // Check tier preference
      const isSecondary = tool.tier === 'secondary';

      // Check secondary consent (unless on_missing_primary allows it)
      if (isSecondary && requireConsent && !secondaryConsent && !allowSecondaryFallback) {
        decision.rejected.push({
          tool_id: toolId,
          reason: 'secondary tool requires consent',
          capability,
        });
        continue;
      }

      // Safety policy enforcement
      const safety = policies?.safety || {};
      const isProd = env && env['NODE_ENV'] === 'production';

      // Block risky tools in production unless explicitly allowed
      if (isProd && !safety.allow_production_mutations) {
        const riskyEffects = ['exec', 'file_write', 'database'];
        const hasRiskyEffects = (tool.side_effects || []).some((e) => riskyEffects.includes(e));

        if (hasRiskyEffects && env && env['SAFETY_ALLOW_PROD'] !== 'true') {
          decision.rejected.push({
            tool_id: toolId,
            reason: 'blocked by safety policy in production',
            capability,
          });
          continue;
        }
      }

      // Check test mode requirements - enhanced enforcement
      if (safety.require_test_mode_for?.length > 0) {
        const requiresTestMode = safety.require_test_mode_for.some((domain) => {
          // Check if capability matches restricted domain
          if (capability.includes(domain)) return true;
          // Check if any tool capability contains the restricted domain
          return (tool.capabilities || []).some((cap) => cap.includes(domain));
        });

        if (requiresTestMode && env && env['TEST_MODE'] !== 'true') {
          decision.rejected.push({
            tool_id: toolId,
            reason: 'policy_violation: TEST_MODE required for restricted domain',
            capability,
            policy_requirement: 'TEST_MODE=true',
          });
          // Update alternatives tracking
          const alt = decision.alternatives[capability]?.find((a) => a.tool_id === toolId);
          if (alt) alt.rejection_reason = 'TEST_MODE required';
          continue;
        }
      }

      // Check API key requirements with optional override
      if (tool.requires_api_key) {
        const keyName = tool.api_key_env || `${toolId.toUpperCase()}_API_KEY`;
        if (!env[keyName]) {
          // In TEST_MODE, bypass API key requirement for stubs
          if (env.TEST_MODE === 'true') {
            console.log(`[router] TEST_MODE: bypassing API key check for ${toolId}`);
          } else {
            decision.rejected.push({
              tool_id: toolId,
              reason: `missing API key: ${keyName}`,
              capability,
            });
            continue;
          }
        }
      }

      // Calculate cost
      const costUsd = calculateToolCost(tool);

      // Determine effective budget for this tool and capability ceilings
      let toolBudget = effectiveBudget;

      // Use fallback budget if no primary available
      if (isSecondary && allowSecondaryFallback) {
        toolBudget = fallbackBudget;
      }

      // Apply per-tool budget override if specified
      if (isSecondary && policies?.tiers?.secondary?.budget_overrides?.[toolId] !== undefined) {
        toolBudget = policies.tiers.secondary.budget_overrides[toolId];
      }

      // Apply per-capability ceilings if configured
      const perCapBudget = agentBudgets?.per_capability_usd?.[capability];
      if (perCapBudget !== undefined && toolBudget > perCapBudget) {
        toolBudget = perCapBudget;
      }

      // Check budget for secondary tools and ceilings
      if (costUsd > toolBudget) {
        decision.rejected.push({
          tool_id: toolId,
          reason: `exceeds budget: $${costUsd.toFixed(2)} > $${toolBudget.toFixed(2)}`,
          capability,
        });
        continue;
      }

      // Add to plan (coalesce capabilities per tool)
      if (!toolPlan.has(toolId)) {
        toolPlan.set(toolId, {
          tool,
          capabilities: [],
          cost_usd: costUsd,
        });
      }
      toolPlan.get(toolId).capabilities.push(capability);

      // Mark as selected in alternatives
      const alt = decision.alternatives[capability]?.find((a) => a.tool_id === toolId);
      if (alt) alt.selected = true;

      toolFound = true;
      break; // Use first valid tool for this capability
    }

    if (!toolFound) {
      decision.warnings.push(`No valid tool found for capability: ${capability}`);
    }
  }

  // Build final plan
  let totalCost = 0;
  for (const [toolId, planItem] of toolPlan) {
    const tool = planItem.tool;
    const rationale = buildRationale(
      tool,
      planItem.capabilities,
      secondaryConsent,
      effectiveBudget,
    );

    decision.plan.push({
      tool_id: toolId,
      capabilities: planItem.capabilities,
      estimated_cost_usd: planItem.cost_usd,
      side_effects: tool.side_effects || [],
      requires_api_key: tool.requires_api_key || false,
      rationale,
    });

    totalCost += planItem.cost_usd;
  }

  decision.totals.estimated_cost_usd = totalCost;

  // Check total budget
  let ok =
    capabilities.length === 0 || // Empty capabilities = trivially satisfied
    (decision.plan.length > 0 &&
      capabilities.every((cap) => decision.plan.some((p) => p.capabilities.includes(cap))));

  if (ok && totalCost > effectiveBudget) {
    ok = false;
    decision.warnings.push(
      `Total cost $${totalCost.toFixed(2)} exceeds budget $${effectiveBudget.toFixed(2)}`,
    );
    decision.totals.min_feasible_budget_usd = totalCost;
  }

  if (!ok && decision.warnings.length === 0) {
    decision.warnings.push('Unable to satisfy all requested capabilities');
  }

  return {
    ok,
    toolPlan: decision.plan,
    budget: decision.totals.estimated_cost_usd,
    rejected: decision.rejected,
    decision,
    warnings: decision.warnings,
  };
}

// Derive capabilities from AUV spec
export function deriveCapabilities(auvSpec) {
  const caps = new Set();
  const hints = auvSpec?.authoring_hints || {};

  // UI capabilities
  if (hints.ui?.page) {
    caps.add('browser.automation');
    caps.add('web.perf_audit');
    if (hints.ui?.screenshot) {
      caps.add('screenshot');
    }
  }

  // API capabilities
  if (hints.api) {
    caps.add('api.test');
  }

  // Visual capabilities
  if (hints.visual || hints.ui?.visual_regression) {
    caps.add('visual.regression');
  }

  // Database capabilities
  if (hints.db || hints.api?.db_assertions) {
    caps.add('db.query');
  }

  // Security capabilities
  if (auvSpec?.tags?.includes('security')) {
    caps.add('security.scan');
  }

  // Documentation capabilities
  if (auvSpec?.tags?.includes('docs')) {
    caps.add('docs.search');
  }

  return [...caps];
}

// Helper functions
function calculateToolCost(tool) {
  if (!tool.cost_model) return 0;

  if (tool.cost_model.type === 'flat_per_run') {
    return tool.cost_model.usd || 0;
  }

  // Legacy cost_score mapping
  const costScore = tool.cost_score || 0;
  return costScore * 0.01; // $0.01 per cost point
}

function buildRationale(tool, capabilities, hasConsent, budget) {
  const parts = [];

  if (tool.tier === 'primary') {
    parts.push('primary');
  } else if (tool.tier === 'secondary') {
    parts.push('secondary');
    if (hasConsent) parts.push('with consent');
  }

  const cost = calculateToolCost(tool);
  if (cost <= budget) {
    parts.push('within budget');
  }

  parts.push(`for ${capabilities.join(', ')}`);

  return parts.join('; ');
}

// Load and validate configuration files
export function loadConfig() {
  const registryPath = join(__dirname, 'registry.yaml');
  const policiesPath = join(__dirname, 'policies.yaml');
  const registrySchemaPath = join(__dirname, 'schemas', 'registry.schema.json');
  const policiesSchemaPath = join(__dirname, 'schemas', 'policies.schema.json');

  if (!existsSync(registryPath)) {
    throw new Error(`Registry not found: ${registryPath}`);
  }
  if (!existsSync(policiesPath)) {
    throw new Error(`Policies not found: ${policiesPath}`);
  }

  // Parse YAML files
  const registry = parseYaml(readFileSync(registryPath, 'utf8'));
  const policies = parseYaml(readFileSync(policiesPath, 'utf8'));

  // Load and validate with schemas if they exist
  if (existsSync(registrySchemaPath) && existsSync(policiesSchemaPath)) {
    const ajv = new Ajv({ allErrors: true, verbose: true });

    // Load schemas
    const registrySchema = JSON.parse(readFileSync(registrySchemaPath, 'utf8'));
    const policiesSchema = JSON.parse(readFileSync(policiesSchemaPath, 'utf8'));

    // Validate registry
    const validateRegistry = ajv.compile(registrySchema);
    if (!validateRegistry(registry)) {
      const errors = validateRegistry.errors
        .map(
          (e) =>
            `  - ${e.instancePath || 'root'}: ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`,
        )
        .join('\n');
      throw new Error(`Registry validation failed:\n${errors}`);
    }

    // Validate policies
    const validatePolicies = ajv.compile(policiesSchema);
    if (!validatePolicies(policies)) {
      const errors = validatePolicies.errors
        .map(
          (e) =>
            `  - ${e.instancePath || 'root'}: ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`,
        )
        .join('\n');
      throw new Error(`Policies validation failed:\n${errors}`);
    }
  }

  // Cross-reference validation
  // Check that all capability_map tools exist in registry
  for (const [cap, toolIds] of Object.entries(policies.capability_map || {})) {
    for (const toolId of toolIds) {
      if (!registry.tools[toolId]) {
        throw new Error(`capability_map references unknown tool: ${toolId} (capability=${cap})`);
      }
    }
  }

  // Check that all agent allowlist tools exist in registry
  for (const [agent, allowlist] of Object.entries(policies.agents?.allowlist || {})) {
    for (const toolId of allowlist) {
      if (!registry.tools[toolId]) {
        throw new Error(`Agent ${agent} allowlist references unknown tool: ${toolId}`);
      }
    }
  }

  // Warn about orphaned tools (not mapped to any capability)
  const mappedTools = new Set();
  for (const tools of Object.values(policies.capability_map || {})) {
    tools.forEach((t) => mappedTools.add(t));
  }
  const orphanedTools = [];
  for (const toolId of Object.keys(registry.tools || {})) {
    if (!mappedTools.has(toolId)) {
      orphanedTools.push(toolId);
    }
  }
  if (orphanedTools.length > 0 && process.env.ROUTER_VERBOSE === 'true') {
    console.warn(
      `Warning: ${orphanedTools.length} tools not mapped to any capability:`,
      orphanedTools.join(', '),
    );
  }

  return { registry, policies };
}

// Write decision artifacts
export function writeDecision(decision, runId) {
  const outputDir = join(process.cwd(), 'runs', 'router', runId);
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'decision.json');
  writeFileSync(outputPath, JSON.stringify(decision, null, 2));

  return outputPath;
}

// Append to observability log
export function appendToHooks(event) {
  const hooksPath = join(process.cwd(), 'runs', 'observability', 'hooks.jsonl');
  const hooksDir = dirname(hooksPath);

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const entry = {
    ts: Date.now() / 1000, // Epoch seconds to match other emitters
    ...event,
  };

  const line = JSON.stringify(entry) + '\n';

  // Use appendFileSync for efficiency
  appendFileSync(hooksPath, line);
}

// Update spend ledger
export function updateLedger(sessionId, toolPlan) {
  if (!sessionId || !toolPlan || toolPlan.length === 0) return;

  const ledgerDir = join(process.cwd(), 'runs', 'observability', 'ledgers');
  const ledgerPath = join(ledgerDir, `${sessionId}.jsonl`);

  if (!existsSync(ledgerDir)) {
    mkdirSync(ledgerDir, { recursive: true });
  }

  for (const tool of toolPlan) {
    const entry = {
      ts: Date.now() / 1000,
      tool_id: tool.tool_id,
      capabilities: tool.capabilities || [],
      estimated_cost_usd: tool.estimated_cost_usd || 0,
    };
    appendFileSync(ledgerPath, JSON.stringify(entry) + '\n');
  }
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry');
  const validateOnly = args.includes('--validate');

  // Parse CLI arguments
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  // Validation mode - just check configs and exit
  if (validateOnly) {
    try {
      const { registry, policies } = loadConfig();
      console.log('✅ Configuration validation passed');
      console.log(`  - Registry: ${Object.keys(registry.tools || {}).length} tools`);
      console.log(
        `  - Policies: ${Object.keys(policies.capability_map || {}).length} capabilities`,
      );
      console.log(`  - Agents: ${Object.keys(policies.agents?.allowlist || {}).length} configured`);
      process.exit(0);
    } catch (error) {
      console.error('❌ Configuration validation failed:');
      console.error(`  ${error.message}`);
      process.exit(1);
    }
  }

  const agentId = getArg('--agent') || 'B7.rapid_builder';
  const capabilitiesArg = getArg('--capabilities') || 'browser.automation,screenshot';
  const capabilities = capabilitiesArg.split(',').map((c) => c.trim());
  const budgetUsd = parseFloat(getArg('--budget') || '0.25');
  const secondaryConsent = args.includes('--secondary-consent');
  const inputFile = getArg('--input');
  const sessionId = getArg('--session') || randomUUID();

  try {
    // Load request from file if provided
    let request;
    if (inputFile) {
      const inputPath = join(process.cwd(), inputFile);
      request = JSON.parse(readFileSync(inputPath, 'utf8'));
    } else {
      request = {
        agentId,
        requestedCapabilities: capabilities,
        budgetUsd,
        secondaryConsent,
        env: process.env,
      };
    }

    // Load config and run router
    const { registry, policies } = loadConfig();

    // Log start event
    appendToHooks({
      event: 'RouterDecisionStart',
      agent_id: request.agentId,
      capabilities: request.requestedCapabilities,
    });

    const result = planTools({
      ...request,
      registry,
      policies,
    });

    // Log completion event
    appendToHooks({
      event: 'RouterDecisionComplete',
      agent_id: request.agentId,
      ok: result.ok,
      totals: result.decision.totals,
      plan: result.toolPlan,
    });

    // Write artifacts
    const runId = randomUUID();
    const artifactPath = writeDecision(result.decision, runId);

    // Update spend ledger (use --session arg or SESSION_ID env or runId)
    const ledgerSessionId = sessionId || process.env.SESSION_ID || runId;
    updateLedger(ledgerSessionId, result.toolPlan);

    // Output results
    if (isDryRun) {
      console.log('\n=== Router Dry Run ===');
      console.log(`Agent: ${request.agentId}`);
      console.log(`Capabilities: ${request.requestedCapabilities.join(', ')}`);
      console.log(`Budget: $${budgetUsd}`);
      console.log(`Secondary Consent: ${secondaryConsent}`);
      console.log('\n=== Decision ===');
      console.log(JSON.stringify(result.decision, null, 2));
      console.log(`\nArtifact written to: ${artifactPath}`);
    } else {
      console.log(JSON.stringify(result.decision, null, 2));
    }

    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error('Router error:', error.message);
    process.exit(1);
  }
}
