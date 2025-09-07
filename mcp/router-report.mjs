#!/usr/bin/env node
/**
 * Router Coverage Report
 * Generates a report of router configuration coverage and issues
 */

import { loadConfig } from './router.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function generateCoverageReport() {
  const { registry, policies } = loadConfig();

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_tools: 0,
      total_capabilities: 0,
      total_agents: 0,
    },
    capabilities_without_primary: [],
    unmapped_tools: [],
    orphaned_capabilities: [],
    restrictive_agents: [],
    missing_budgets: [],
    statistics: {
      primary_tools: 0,
      secondary_tools: 0,
      tools_requiring_api_keys: 0,
      average_tools_per_capability: 0,
      average_allowlist_size: 0,
    },
  };

  // Count totals
  report.summary.total_tools = Object.keys(registry.tools || {}).length;
  report.summary.total_capabilities = Object.keys(policies.capability_map || {}).length;
  report.summary.total_agents = Object.keys(policies.agents?.allowlist || {}).length;

  // Find capabilities with only secondary tools
  for (const [cap, toolIds] of Object.entries(policies.capability_map || {})) {
    const hasPrimary = toolIds.some((t) => registry.tools[t]?.tier === 'primary');
    if (!hasPrimary && toolIds.length > 0) {
      report.capabilities_without_primary.push({
        capability: cap,
        tools: toolIds,
        recommendation: 'Consider adding a primary tool or adjusting on_missing_primary policy',
      });
    }
  }

  // Find unmapped tools
  const mappedTools = new Set();
  Object.values(policies.capability_map || {})
    .flat()
    .forEach((t) => mappedTools.add(t));

  for (const toolId of Object.keys(registry.tools || {})) {
    if (!mappedTools.has(toolId)) {
      const tool = registry.tools[toolId];
      report.unmapped_tools.push({
        tool_id: toolId,
        tier: tool.tier,
        capabilities: tool.capabilities,
        recommendation: 'Add to capability_map or remove if unused',
      });
    }
  }

  // Find orphaned capabilities (in capability_map but no valid tools)
  for (const [cap, toolIds] of Object.entries(policies.capability_map || {})) {
    const validTools = toolIds.filter((t) => registry.tools[t]);
    if (validTools.length === 0) {
      report.orphaned_capabilities.push({
        capability: cap,
        invalid_tools: toolIds,
        recommendation: 'Fix tool references or remove capability',
      });
    }
  }

  // Find overly restrictive agents (< 3 tools)
  for (const [agent, allowlist] of Object.entries(policies.agents?.allowlist || {})) {
    if (allowlist.length < 3) {
      report.restrictive_agents.push({
        agent,
        tool_count: allowlist.length,
        tools: allowlist,
        recommendation: 'Consider expanding allowlist for better flexibility',
      });
    }
  }

  // Find tools without budget overrides (secondary only)
  for (const [toolId, tool] of Object.entries(registry.tools || {})) {
    if (tool.tier === 'secondary') {
      const hasOverride = policies.tiers?.secondary?.budget_overrides?.[toolId] !== undefined;
      if (
        !hasOverride &&
        tool.cost_model?.usd > (policies.tiers?.secondary?.default_budget_usd || 0.1)
      ) {
        report.missing_budgets.push({
          tool_id: toolId,
          cost: tool.cost_model?.usd,
          default_budget: policies.tiers?.secondary?.default_budget_usd || 0.1,
          recommendation: 'Add budget override or increase default budget',
        });
      }
    }
  }

  // Calculate statistics
  let primaryCount = 0;
  let secondaryCount = 0;
  let apiKeyCount = 0;

  for (const tool of Object.values(registry.tools || {})) {
    if (tool.tier === 'primary') primaryCount++;
    if (tool.tier === 'secondary') secondaryCount++;
    if (tool.requires_api_key) apiKeyCount++;
  }

  report.statistics.primary_tools = primaryCount;
  report.statistics.secondary_tools = secondaryCount;
  report.statistics.tools_requiring_api_keys = apiKeyCount;

  // Average tools per capability
  const capToolCounts = Object.values(policies.capability_map || {}).map((tools) => tools.length);
  report.statistics.average_tools_per_capability =
    capToolCounts.length > 0
      ? (capToolCounts.reduce((a, b) => a + b, 0) / capToolCounts.length).toFixed(2)
      : 0;

  // Average allowlist size
  const allowlistSizes = Object.values(policies.agents?.allowlist || {}).map((list) => list.length);
  report.statistics.average_allowlist_size =
    allowlistSizes.length > 0
      ? (allowlistSizes.reduce((a, b) => a + b, 0) / allowlistSizes.length).toFixed(2)
      : 0;

  return report;
}

// CLI mode
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const report = generateCoverageReport();

    // Write report
    const outputDir = join(process.cwd(), 'runs', 'router');
    mkdirSync(outputDir, { recursive: true });

    const outputPath = join(outputDir, 'coverage-report.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n📊 Router Coverage Report\n');
    console.log('Summary:');
    console.log(
      `  Tools: ${report.summary.total_tools} (${report.statistics.primary_tools} primary, ${report.statistics.secondary_tools} secondary)`,
    );
    console.log(`  Capabilities: ${report.summary.total_capabilities}`);
    console.log(`  Configured Agents: ${report.summary.total_agents}`);
    console.log(`  Average tools/capability: ${report.statistics.average_tools_per_capability}`);
    console.log(`  Average agent allowlist: ${report.statistics.average_allowlist_size} tools`);

    if (report.capabilities_without_primary.length > 0) {
      console.log(
        `\n⚠️  ${report.capabilities_without_primary.length} capabilities lack primary tools`,
      );
    }

    if (report.unmapped_tools.length > 0) {
      console.log(`⚠️  ${report.unmapped_tools.length} tools not mapped to any capability`);
    }

    if (report.orphaned_capabilities.length > 0) {
      console.log(
        `❌ ${report.orphaned_capabilities.length} capabilities have invalid tool references`,
      );
    }

    if (report.restrictive_agents.length > 0) {
      console.log(
        `⚠️  ${report.restrictive_agents.length} agents have very restrictive allowlists (<3 tools)`,
      );
    }

    if (report.missing_budgets.length > 0) {
      console.log(
        `⚠️  ${report.missing_budgets.length} expensive secondary tools lack budget overrides`,
      );
    }

    console.log(`\n✅ Full report written to: ${outputPath}\n`);

    process.exit(report.orphaned_capabilities.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Failed to generate coverage report:', error.message);
    process.exit(1);
  }
}
