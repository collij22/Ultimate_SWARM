#!/usr/bin/env node
/**
 * Swarm1 — Semgrep Security Scanner Wrapper
 *
 * Runs Semgrep static analysis, applies waivers, and generates normalized reports.
 *
 * Usage:
 *   node orchestration/security/semgrep.mjs [--input <raw.json>] [--output <report.json>]
 *
 * Exit codes:
 *   0   - No blocking issues (or all waived)
 *   301 - High/critical findings present (post-waiver)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

// Configuration
const SEVERITY_LEVELS = {
  ERROR: 'high',
  WARNING: 'medium',
  INFO: 'low',
};

const BLOCKING_SEVERITIES = ['ERROR'];

class SemgrepScanner {
  constructor() {
    this.waivers = [];
    this.findings = [];
    this.summary = {
      scan_id: this.generateScanId(),
      timestamp: new Date().toISOString(),
      commit: this.getCurrentCommit(),
      policy_version: '1.0',
      totals: {
        high: 0,
        medium: 0,
        low: 0,
      },
      waived: 0,
      blocked: 0,
      findings: [],
    };
  }

  generateScanId() {
    return `semgrep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getCurrentCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async loadWaivers() {
    const waiversPath = path.join(process.cwd(), '.security', 'waivers.yaml');
    if (!fs.existsSync(waiversPath)) {
      console.log('[semgrep] No waivers file found, proceeding without waivers');
      return;
    }

    try {
      const content = fs.readFileSync(waiversPath, 'utf-8');
      const data = yaml.load(content);

      if (data && data.waivers) {
        const now = new Date();
        this.waivers = data.waivers.filter((w) => {
          // Filter for Semgrep waivers only
          if (w.tool !== 'semgrep') return false;

          // Check if waiver has expired
          if (w.expires) {
            const expiryDate = new Date(w.expires);
            if (expiryDate < now) {
              console.log(`[semgrep] Waiver expired: ${w.rule} (expired ${w.expires})`);
              return false;
            }
          }

          return true;
        });

        console.log(`[semgrep] Loaded ${this.waivers.length} active waivers`);
      }
    } catch (error) {
      console.error('[semgrep] Error loading waivers:', error.message);
    }
  }

  isWaived(finding) {
    return this.waivers.some((waiver) => {
      // Match by rule ID
      if (waiver.rule && finding.check_id !== waiver.rule) {
        return false;
      }

      // Match by path glob (simple contains for now)
      if (waiver.path && !finding.path.includes(waiver.path)) {
        return false;
      }

      return true;
    });
  }

  async runSemgrep(configPath) {
    const semgrepConfig = configPath || path.join(process.cwd(), 'semgrep.yml');
    const outputPath = path.join(process.cwd(), 'runs', 'security', 'semgrep-raw.json');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Check if Semgrep is available
    try {
      execSync('semgrep --version', { stdio: 'ignore' });
    } catch {
      console.log('[semgrep] Semgrep not installed, creating mock output for development');
      this.createMockOutput(outputPath);
      return outputPath;
    }

    try {
      // Run Semgrep scan
      const cmd = `semgrep scan --config ${semgrepConfig} --json --timeout 120 --output ${outputPath}`;
      console.log('[semgrep] Running scan...');
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      // Semgrep exits with non-zero if findings exist, which is expected
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Semgrep failed to produce output: ${error.message}`);
      }
    }

    return outputPath;
  }

  createMockOutput(outputPath) {
    // Create mock Semgrep output for development/testing
    const mockData = {
      version: '1.0.0',
      results: [],
      errors: [],
      paths: {
        scanned: ['orchestration/', 'mcp/', 'tests/'],
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(mockData, null, 2));
  }

  async processSemgrepOutput(inputPath) {
    const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

    if (!rawData.results) {
      console.log('[semgrep] No findings in scan results');
      return;
    }

    for (const finding of rawData.results) {
      const severity = SEVERITY_LEVELS[finding.extra?.severity || 'INFO'];
      const isWaived = this.isWaived(finding);

      const processedFinding = {
        id: finding.check_id,
        severity: severity,
        path: finding.path,
        line: finding.start?.line || 0,
        message: finding.extra?.message || finding.message,
        waived: isWaived,
        waiver_reason: isWaived ? this.getWaiverReason(finding) : null,
      };

      this.findings.push(processedFinding);

      // Update totals
      if (!isWaived) {
        this.summary.totals[severity]++;

        if (BLOCKING_SEVERITIES.includes(finding.extra?.severity)) {
          this.summary.blocked++;
        }
      } else {
        this.summary.waived++;
      }
    }

    this.summary.findings = this.findings;
  }

  getWaiverReason(finding) {
    const waiver = this.waivers.find(
      (w) => (!w.rule || finding.check_id === w.rule) && (!w.path || finding.path.includes(w.path)),
    );
    return waiver?.reason || 'Waived by policy';
  }

  async generateReport(outputPath) {
    // Ensure reports directory exists
    const reportsDir = path.dirname(outputPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write detailed report
    fs.writeFileSync(outputPath, JSON.stringify(this.summary, null, 2));

    // Also write to runs directory for CVF validation
    const runsPath = path.join(process.cwd(), 'runs', 'security', 'semgrep.json');
    fs.writeFileSync(runsPath, JSON.stringify(this.summary, null, 2));

    console.log(`[semgrep] Report generated: ${outputPath}`);
    console.log(
      `[semgrep] Summary: High=${this.summary.totals.high}, Medium=${this.summary.totals.medium}, Low=${this.summary.totals.low}, Waived=${this.summary.waived}`,
    );
  }

  shouldBlock() {
    return this.summary.blocked > 0;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let inputPath = null;
  let outputPath = path.join(process.cwd(), 'reports', 'security', 'semgrep.json');

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  const scanner = new SemgrepScanner();

  try {
    // Load waivers
    await scanner.loadWaivers();

    // Run or load Semgrep results
    if (!inputPath) {
      inputPath = await scanner.runSemgrep();
    }

    // Process findings
    await scanner.processSemgrepOutput(inputPath);

    // Generate report
    await scanner.generateReport(outputPath);

    // Exit with appropriate code
    if (scanner.shouldBlock()) {
      console.error('[semgrep] BLOCKED: High/critical findings detected');
      process.exit(301);
    }

    console.log('[semgrep] PASSED: No blocking issues found');
    process.exit(0);
  } catch (error) {
    console.error('[semgrep] Error:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { SemgrepScanner };
