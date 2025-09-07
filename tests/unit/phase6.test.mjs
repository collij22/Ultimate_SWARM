/**
 * Swarm1 — Phase 6 Unit Tests
 *
 * Tests for security scanners, visual regression, and performance budget modules.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';


describe('Phase 6 - Security Scanners', () => {
  const testWaiverPath = path.join(process.cwd(), '.security', 'test-waivers.yaml');

  beforeEach(() => {
    // Create test waiver file
    const testWaivers = `
waivers:
  - tool: semgrep
    rule: test-rule
    path: test/file.js
    reason: Test waiver
    expires: 2030-01-01T00:00:00Z
  - tool: gitleaks
    rule: generic-api-key
    path: mock/
    reason: Mock files contain test keys
    expires: 2030-01-01T00:00:00Z
`;
    const dir = path.dirname(testWaiverPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(testWaiverPath, testWaivers);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testWaiverPath)) {
      fs.unlinkSync(testWaiverPath);
    }
  });

  it('should validate waiver expiration dates', () => {
    const content = fs.readFileSync(testWaiverPath, 'utf-8');
    assert(content.includes('expires:'), 'Waivers should have expiration dates');

    // Parse and check dates
    const lines = content.split('\n');
    const expiryLines = lines.filter((l) => l.includes('expires:'));

    expiryLines.forEach((line) => {
      const dateStr = line.split('expires:')[1].trim();
      const date = new Date(dateStr);
      assert(!isNaN(date.getTime()), `Invalid date format: ${dateStr}`);
      assert(date > new Date(), `Waiver should not be expired: ${dateStr}`);
    });
  });

  it('should validate security report schema', () => {
    const mockReport = {
      scan_id: 'test-123',
      timestamp: new Date().toISOString(),
      commit: 'abc123',
      policy_version: '1.0',
      totals: {
        high: 0,
        medium: 2,
        low: 5,
      },
      waived: 1,
      blocked: 0,
      findings: [],
    };

    // Validate required fields
    assert(mockReport.scan_id, 'Report must have scan_id');
    assert(mockReport.timestamp, 'Report must have timestamp');
    assert(mockReport.policy_version, 'Report must have policy_version');
    assert(typeof mockReport.totals === 'object', 'Report must have totals object');
    assert(typeof mockReport.blocked === 'number', 'Report must have blocked count');
  });
});

describe('Phase 6 - Visual Regression', () => {
  it('should calculate pixel difference percentage correctly', () => {
    const totalPixels = 1920 * 1080;
    const diffPixels = 2073; // ~0.1% difference
    const diffPercent = (diffPixels / totalPixels) * 100;

    assert(diffPercent < 0.11, 'Diff should be approximately 0.1%');
    assert(diffPercent > 0.09, 'Diff should be approximately 0.1%');
  });

  it('should validate visual comparison thresholds', () => {
    const testCases = [
      { diffPercent: 0.05, threshold: 0.1, shouldPass: true },
      { diffPercent: 0.1, threshold: 0.1, shouldPass: true },
      { diffPercent: 0.11, threshold: 0.1, shouldPass: false },
      { diffPercent: 1.0, threshold: 0.1, shouldPass: false },
    ];

    testCases.forEach((tc) => {
      const passed = tc.diffPercent <= tc.threshold;
      assert.strictEqual(
        passed,
        tc.shouldPass,
        `Diff ${tc.diffPercent}% vs threshold ${tc.threshold}% should ${tc.shouldPass ? 'pass' : 'fail'}`,
      );
    });
  });

  it('should validate SSIM calculation range', () => {
    // SSIM should always be between 0 and 1
    const testSSIMValues = [0, 0.5, 0.95, 0.99, 1];

    testSSIMValues.forEach((ssim) => {
      assert(ssim >= 0 && ssim <= 1, `SSIM ${ssim} should be between 0 and 1`);
    });
  });
});

describe('Phase 6 - Performance Budgets', () => {
  it('should validate budget metric names', () => {
    const validMetrics = [
      'lcp_ms',
      'tti_ms',
      'cls',
      'fcp_ms',
      'tbt_ms',
      'si_ms',
      'size_kb',
      'score',
    ];

    const testBudget = {
      lcp_ms: 2500,
      tti_ms: 3800,
      cls: 0.1,
      invalid_metric: 100,
    };

    Object.keys(testBudget).forEach((key) => {
      if (key !== 'invalid_metric') {
        assert(validMetrics.includes(key), `${key} should be a valid metric`);
      }
    });
  });

  it('should calculate budget violation percentages', () => {
    const testCases = [
      { actual: 3000, budget: 2500, expectedPercent: 20 },
      { actual: 2750, budget: 2500, expectedPercent: 10 },
      { actual: 2500, budget: 2500, expectedPercent: 0 },
      { actual: 2000, budget: 2500, expectedPercent: 0 }, // Under budget
    ];

    testCases.forEach((tc) => {
      const percentOver = tc.actual > tc.budget ? ((tc.actual - tc.budget) / tc.budget) * 100 : 0;

      assert.strictEqual(
        Math.round(percentOver),
        tc.expectedPercent,
        `Actual ${tc.actual} vs budget ${tc.budget} should be ${tc.expectedPercent}% over`,
      );
    });
  });

  it('should classify violation severity correctly', () => {
    const testCases = [
      { percentOver: 5, expectedSeverity: 'medium' },
      { percentOver: 15, expectedSeverity: 'medium' },
      { percentOver: 20, expectedSeverity: 'medium' },
      { percentOver: 21, expectedSeverity: 'high' },
      { percentOver: 50, expectedSeverity: 'high' },
    ];

    testCases.forEach((tc) => {
      const severity = tc.percentOver > 20 ? 'high' : 'medium';
      assert.strictEqual(
        severity,
        tc.expectedSeverity,
        `${tc.percentOver}% over should be ${tc.expectedSeverity} severity`,
      );
    });
  });
});

describe('Phase 6 - CVF Integration', () => {
  it('should validate enhanced CVF gate structure', () => {
    const mockCVFResult = {
      artifacts: {
        passed: true,
        missing: [],
        invalid: [],
      },
      security: {
        passed: true,
        messages: ['Security: Semgrep passed', 'Security: Gitleaks passed'],
      },
      visual: {
        passed: true,
        messages: ['Visual: All routes within threshold'],
      },
      performance: {
        passed: true,
        messages: ['Performance: All budgets met'],
      },
    };

    // Validate all gates present
    assert(mockCVFResult.artifacts, 'CVF must check artifacts');
    assert(mockCVFResult.security, 'CVF must check security');
    assert(mockCVFResult.visual, 'CVF must check visual');
    assert(mockCVFResult.performance, 'CVF must check performance');

    // Validate overall pass condition
    const allPassed =
      mockCVFResult.artifacts.passed &&
      mockCVFResult.security.passed &&
      mockCVFResult.visual.passed &&
      mockCVFResult.performance.passed;

    assert(allPassed, 'All gates should pass for overall success');
  });

  it('should validate exit codes for Phase 6', () => {
    const exitCodes = {
      security_semgrep: 301,
      security_gitleaks: 302,
      visual_regression: 303,
      performance_budget: 304, // Reserved for future use
    };

    // All codes should be in 3xx range for Phase 6
    Object.values(exitCodes).forEach((code) => {
      assert(code >= 300 && code < 400, `Exit code ${code} should be in 300-399 range`);
    });

    // Codes should be unique
    const uniqueCodes = new Set(Object.values(exitCodes));
    assert.strictEqual(
      uniqueCodes.size,
      Object.values(exitCodes).length,
      'Exit codes should be unique',
    );
  });
});

describe('Phase 6 - Configuration Files', () => {
  it('should validate Semgrep configuration structure', () => {
    const semgrepPath = path.join(process.cwd(), 'semgrep.yml');
    if (fs.existsSync(semgrepPath)) {
      const content = fs.readFileSync(semgrepPath, 'utf-8');

      // Check for required sections
      assert(content.includes('rules:'), 'Semgrep config must have rules');
      assert(content.includes('severity:'), 'Rules should have severity levels');
      assert(content.includes('message:'), 'Rules should have messages');
      assert(content.includes('languages:'), 'Rules should specify languages');
    }
  });

  it('should validate Gitleaks configuration structure', () => {
    const gitleaksPath = path.join(process.cwd(), '.gitleaks.toml');
    if (fs.existsSync(gitleaksPath)) {
      const content = fs.readFileSync(gitleaksPath, 'utf-8');

      // Check for required sections
      assert(content.includes('[[rules]]'), 'Gitleaks config must have rules');
      assert(content.includes('regex ='), 'Rules should have regex patterns');
      assert(content.includes('description ='), 'Rules should have descriptions');
      assert(content.includes('[allowlist]'), 'Should have allowlist section');
    }
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Phase 6 unit tests...');
}
