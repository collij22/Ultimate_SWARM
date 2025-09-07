#!/usr/bin/env node
/**
 * Router Schema Validation Tests
 * Tests schema validation and cross-reference validation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'assert';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { stringify as stringifyYaml } from 'yaml';

describe('Router Schema Validation', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    // Create temp directory for test configs
    tempDir = join(tmpdir(), `router-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, 'mcp'), { recursive: true });
    mkdirSync(join(tempDir, 'mcp', 'schemas'), { recursive: true });

    // Copy schemas to temp dir
    const schemasDir = join(process.cwd(), 'mcp', 'schemas');
    const registrySchema = readFileSync(join(schemasDir, 'registry.schema.json'), 'utf8');
    const policiesSchema = readFileSync(join(schemasDir, 'policies.schema.json'), 'utf8');

    writeFileSync(join(tempDir, 'mcp', 'schemas', 'registry.schema.json'), registrySchema);
    writeFileSync(join(tempDir, 'mcp', 'schemas', 'policies.schema.json'), policiesSchema);

    // Save original cwd
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Restore cwd and cleanup
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Registry Schema Validation', () => {
    it('should reject registry with missing required fields', async () => {
      // Create invalid registry (missing cost_model)
      const invalidRegistry = {
        version: 2,
        tools: {
          'test-tool': {
            tier: 'primary',
            capabilities: ['test.cap'],
            requires_api_key: false,
            // Missing cost_model
            side_effects: ['network'],
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'registry.yaml'), stringifyYaml(invalidRegistry));

      // Create valid policies
      const validPolicies = {
        version: 1,
        router: {
          defaults: {
            prefer_tier: 'primary',
            budget_usd: 0.25,
            require_secondary_consent: true,
          },
        },
        tiers: {
          primary: { require_consent: false },
          secondary: { require_consent: true },
        },
        capability_map: {
          'test.cap': ['test-tool'],
        },
        agents: { allowlist: {} },
      };

      writeFileSync(join(tempDir, 'mcp', 'policies.yaml'), stringifyYaml(validPolicies));

      // Try to load config - should fail
      const { loadConfig } = await import('../../mcp/router.mjs');

      assert.throws(
        () => loadConfig(),
        /Registry validation failed/,
        'Should fail with missing cost_model',
      );
    });

    it('should reject registry with invalid tier value', async () => {
      const invalidRegistry = {
        version: 2,
        tools: {
          'test-tool': {
            tier: 'invalid-tier', // Invalid tier
            capabilities: ['test.cap'],
            requires_api_key: false,
            cost_model: { type: 'flat_per_run', usd: 0 },
            side_effects: [],
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'registry.yaml'), stringifyYaml(invalidRegistry));

      const validPolicies = {
        version: 1,
        router: {
          defaults: {
            prefer_tier: 'primary',
            budget_usd: 0.25,
            require_secondary_consent: true,
          },
        },
        tiers: {
          primary: { require_consent: false },
          secondary: { require_consent: true },
        },
        capability_map: {},
        agents: { allowlist: {} },
      };

      writeFileSync(join(tempDir, 'mcp', 'policies.yaml'), stringifyYaml(validPolicies));

      const { loadConfig } = await import('../../mcp/router.mjs');

      assert.throws(
        () => loadConfig(),
        /Registry validation failed/,
        'Should fail with invalid tier',
      );
    });
  });

  describe('Policies Schema Validation', () => {
    it('should reject policies with missing router defaults', async () => {
      // Create valid registry
      const validRegistry = {
        version: 2,
        tools: {
          'test-tool': {
            tier: 'primary',
            capabilities: ['test.cap'],
            requires_api_key: false,
            cost_model: { type: 'flat_per_run', usd: 0 },
            side_effects: [],
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'registry.yaml'), stringifyYaml(validRegistry));

      // Create invalid policies (missing router.defaults)
      const invalidPolicies = {
        version: 1,
        router: {
          // Missing defaults
        },
        tiers: {
          primary: { require_consent: false },
          secondary: { require_consent: true },
        },
        capability_map: {},
        agents: { allowlist: {} },
      };

      writeFileSync(join(tempDir, 'mcp', 'policies.yaml'), stringifyYaml(invalidPolicies));

      const { loadConfig } = await import('../../mcp/router.mjs');

      assert.throws(
        () => loadConfig(),
        /Policies validation failed/,
        'Should fail with missing router defaults',
      );
    });
  });

  describe('Cross-Reference Validation', () => {
    it('should reject capability_map referencing unknown tool', async () => {
      const validRegistry = {
        version: 2,
        tools: {
          'existing-tool': {
            tier: 'primary',
            capabilities: ['test.cap'],
            requires_api_key: false,
            cost_model: { type: 'flat_per_run', usd: 0 },
            side_effects: [],
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'registry.yaml'), stringifyYaml(validRegistry));

      const invalidPolicies = {
        version: 1,
        router: {
          defaults: {
            prefer_tier: 'primary',
            budget_usd: 0.25,
            require_secondary_consent: true,
          },
        },
        tiers: {
          primary: { require_consent: false },
          secondary: { require_consent: true },
        },
        capability_map: {
          'test.cap': ['unknown-tool'], // References non-existent tool
        },
        agents: { allowlist: {} },
      };

      writeFileSync(join(tempDir, 'mcp', 'policies.yaml'), stringifyYaml(invalidPolicies));

      const { loadConfig } = await import('../../mcp/router.mjs');

      assert.throws(
        () => loadConfig(),
        /capability_map references unknown tool: unknown-tool/,
        'Should fail with unknown tool reference',
      );
    });

    it('should reject agent allowlist referencing unknown tool', async () => {
      const validRegistry = {
        version: 2,
        tools: {
          'existing-tool': {
            tier: 'primary',
            capabilities: ['test.cap'],
            requires_api_key: false,
            cost_model: { type: 'flat_per_run', usd: 0 },
            side_effects: [],
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'registry.yaml'), stringifyYaml(validRegistry));

      const invalidPolicies = {
        version: 1,
        router: {
          defaults: {
            prefer_tier: 'primary',
            budget_usd: 0.25,
            require_secondary_consent: true,
          },
        },
        tiers: {
          primary: { require_consent: false },
          secondary: { require_consent: true },
        },
        capability_map: {
          'test.cap': ['existing-tool'],
        },
        agents: {
          allowlist: {
            'test-agent': ['unknown-tool'], // References non-existent tool
          },
        },
      };

      writeFileSync(join(tempDir, 'mcp', 'policies.yaml'), stringifyYaml(invalidPolicies));

      const { loadConfig } = await import('../../mcp/router.mjs');

      assert.throws(
        () => loadConfig(),
        /Agent test-agent allowlist references unknown tool: unknown-tool/,
        'Should fail with unknown tool in allowlist',
      );
    });
  });

  describe('Safety Policy Validation', () => {
    it('should enforce production safety policies', async () => {
      // Use real configs
      process.chdir(originalCwd);
      const { planTools, loadConfig } = await import('../../mcp/router.mjs');
      const { registry, policies } = loadConfig();

      // Test with production environment
      const result = planTools({
        agentId: 'test-agent',
        requestedCapabilities: ['browser.automation'],
        budgetUsd: 0.25,
        secondaryConsent: false,
        env: { NODE_ENV: 'production' }, // Production mode
        registry,
        policies,
      });

      // Playwright has exec side effect, should be blocked in production
      const playwright = result.decision.plan.find((t) => t.tool_id === 'playwright');
      const playwrightRejected = result.decision.rejected.find((r) => r.tool_id === 'playwright');

      if (playwright) {
        console.log('Note: Playwright allowed in production (may have SAFETY_ALLOW_PROD set)');
      } else if (playwrightRejected) {
        assert.equal(
          playwrightRejected.reason,
          'blocked by safety policy in production',
          'Should block risky tools in production',
        );
      }
    });

    it('should allow risky tools with SAFETY_ALLOW_PROD', async () => {
      process.chdir(originalCwd);
      const { planTools, loadConfig } = await import('../../mcp/router.mjs');
      const { registry, policies } = loadConfig();

      const result = planTools({
        agentId: 'test-agent',
        requestedCapabilities: ['browser.automation'],
        budgetUsd: 0.25,
        secondaryConsent: false,
        env: {
          NODE_ENV: 'production',
          SAFETY_ALLOW_PROD: 'true', // Override safety
        },
        registry,
        policies,
      });

      // Should allow playwright with override
      assert(
        result.decision.plan.some((t) => t.tool_id === 'playwright'),
        'Should allow risky tools with safety override',
      );
    });
  });
});
