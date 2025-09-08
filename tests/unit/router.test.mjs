/**
 * Unit tests for MCP Router
 * Tests the pure, deterministic capability → tool resolution
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planTools } from '../../mcp/router.mjs';

// Mock registry and policies for testing
const mockRegistry = {
  tools: {
    playwright: {
      tier: 'primary',
      capabilities: ['browser.automation', 'screenshot'],
      requires_api_key: false,
      cost_model: { type: 'flat_per_run', usd: 0.0 },
      side_effects: ['network', 'file_read', 'file_write', 'exec'],
    },
    lighthouse: {
      tier: 'primary',
      capabilities: ['perf.web', 'web.perf_audit'],
      requires_api_key: false,
      cost_model: { type: 'flat_per_run', usd: 0.0 },
      side_effects: ['network', 'file_read', 'file_write'],
    },
    semgrep: {
      tier: 'primary',
      capabilities: ['security.scan', 'code.static_analysis'],
      requires_api_key: false,
      cost_model: { type: 'flat_per_run', usd: 0.0 },
      side_effects: ['file_read'],
    },
    vercel: {
      tier: 'secondary',
      capabilities: ['deploy.preview'],
      requires_api_key: true,
      cost_model: { type: 'flat_per_run', usd: 0.1 },
      side_effects: ['network'],
    },
    k6: {
      tier: 'secondary',
      capabilities: ['perf.load'],
      requires_api_key: false,
      cost_model: { type: 'flat_per_run', usd: 0.05 },
      side_effects: ['network', 'exec', 'file_write'],
    },
    datadog: {
      tier: 'secondary',
      capabilities: ['monitoring.saas'],
      requires_api_key: true,
      cost_model: { type: 'flat_per_run', usd: 0.2 },
      side_effects: ['network'],
    },
  },
};

const mockPolicies = {
  router: {
    defaults: {
      prefer_tier: 'primary',
      budget_usd: 0.25,
      require_secondary_consent: true,
    },
  },
  capability_map: {
    'browser.automation': ['playwright'],
    screenshot: ['playwright'],
    'web.perf_audit': ['lighthouse'],
    'perf.web': ['lighthouse'],
    'security.scan': ['semgrep'],
    'code.static_analysis': ['semgrep'],
    'deploy.preview': ['vercel'],
    'perf.load': ['k6'],
    'monitoring.saas': ['datadog'],
  },
  agents: {
    allowlist: {
      'B7.rapid_builder': ['playwright', 'lighthouse', 'semgrep'],
      'C15.security_auditor': ['semgrep'],
      'C16.devops_engineer': ['vercel', 'k6', 'datadog'],
      'B12.documentation_writer': ['refdocs'],
    },
  },
};

describe('MCP Router - planTools', () => {
  it('should select primary tools for basic capabilities', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation', 'web.perf_audit'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan.length, 2);
    assert.equal(result.toolPlan[0].tool_id, 'playwright');
    assert.equal(result.toolPlan[1].tool_id, 'lighthouse');
    assert.equal(result.budget, 0);
  });

  it('should reject secondary tools without consent', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['deploy.preview'],
      budgetUsd: 0.5,
      secondaryConsent: false,
      env: { VERCEL_API_KEY: 'xxx' },
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.toolPlan.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].reason, 'secondary tool requires consent');
  });

  it('should allow secondary tools with consent and budget', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['deploy.preview'],
      budgetUsd: 0.5,
      secondaryConsent: true,
      env: { VERCEL_API_KEY: 'xxx' },
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan.length, 1);
    assert.equal(result.toolPlan[0].tool_id, 'vercel');
    assert.equal(result.budget, 0.1);
  });

  it('should reject tools not in agent allowlist', () => {
    const result = planTools({
      agentId: 'B12.documentation_writer',
      requestedCapabilities: ['browser.automation'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.toolPlan.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].reason, 'not in agent allowlist');
  });

  it('should reject tools requiring missing API keys', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['deploy.preview'],
      budgetUsd: 0.5,
      secondaryConsent: true,
      env: {}, // Missing VERCEL_API_KEY
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].reason, 'missing API key: VERCEL_API_KEY');
  });

  it('should reject tools exceeding budget', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['monitoring.saas'],
      budgetUsd: 0.05, // Less than $0.20 required
      secondaryConsent: true,
      env: { DATADOG_API_KEY: 'xxx' },
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0].reason, /exceeds budget/);
  });

  it('should coalesce multiple capabilities to same tool', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation', 'screenshot'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan.length, 1); // Both capabilities handled by playwright
    assert.equal(result.toolPlan[0].tool_id, 'playwright');
    assert.deepEqual(result.toolPlan[0].capabilities, ['browser.automation', 'screenshot']);
  });

  it('should handle missing capability mapping gracefully', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['unknown.capability'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /No valid tool found/);
  });

  it('should prefer primary over secondary when both available', () => {
    const extendedPolicies = {
      ...mockPolicies,
      capability_map: {
        ...mockPolicies.capability_map,
        'security.scan': ['semgrep', 'expensive-scanner'],
      },
    };

    const extendedRegistry = {
      tools: {
        ...mockRegistry.tools,
        'expensive-scanner': {
          tier: 'secondary',
          capabilities: ['security.scan'],
          requires_api_key: false,
          cost_model: { type: 'flat_per_run', usd: 0.5 },
          side_effects: ['network'],
        },
      },
    };

    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['security.scan'],
      budgetUsd: 1.0,
      secondaryConsent: true,
      env: {},
      registry: extendedRegistry,
      policies: extendedPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan.length, 1);
    assert.equal(result.toolPlan[0].tool_id, 'semgrep'); // Primary chosen
    assert.equal(result.budget, 0);
  });

  it('should use default budget when not specified', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation'],
      budgetUsd: undefined, // Use default budget
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.decision.constraints.budget_usd, 0.25); // Default from policies
  });

  it('should handle empty capabilities gracefully', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: [],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true); // No capabilities = trivially satisfied
    assert.equal(result.toolPlan.length, 0);
    assert.equal(result.budget, 0);
  });

  it('should track side effects in tool plan', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan[0].tool_id, 'playwright');
    assert.deepEqual(result.toolPlan[0].side_effects, [
      'network',
      'file_read',
      'file_write',
      'exec',
    ]);
  });

  it('should include rationale in tool plan', () => {
    const result = planTools({
      agentId: 'C16.devops_engineer',
      requestedCapabilities: ['deploy.preview'],
      budgetUsd: 0.5,
      secondaryConsent: true,
      env: { VERCEL_API_KEY: 'xxx' },
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.match(result.toolPlan[0].rationale, /secondary/);
    assert.match(result.toolPlan[0].rationale, /with consent/);
    assert.match(result.toolPlan[0].rationale, /within budget/);
  });

  it('should be deterministic - same inputs produce same outputs', () => {
    const params = {
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation', 'web.perf_audit', 'security.scan'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    };

    const result1 = planTools(params);
    const result2 = planTools(params);

    assert.deepEqual(result1.toolPlan, result2.toolPlan);
    assert.equal(result1.budget, result2.budget);
  });
});

describe('MCP Router - Edge Cases', () => {
  it('should handle malformed registry gracefully', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: { tools: {} }, // Empty registry
      policies: mockPolicies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.warnings.length, 2); // Tool not found + No valid tool
  });

  it('should handle malformed policies gracefully', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: {}, // Empty policies
    });

    assert.equal(result.ok, false);
    assert.equal(result.warnings.length, 1);
  });

  it('should handle duplicate capabilities', () => {
    const result = planTools({
      agentId: 'B7.rapid_builder',
      requestedCapabilities: ['browser.automation', 'browser.automation', 'browser.automation'],
      budgetUsd: 0.25,
      secondaryConsent: false,
      env: {},
      registry: mockRegistry,
      policies: mockPolicies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolPlan.length, 1);
    assert.equal(result.toolPlan[0].capabilities.length, 1); // Deduped
  });
});
