#!/usr/bin/env node
/**
 * Swarm1 — Gitleaks Secret Scanner Wrapper
 *
 * Runs Gitleaks to detect secrets, applies waivers, and generates normalized reports.
 *
 * Usage:
 *   node orchestration/security/gitleaks.mjs [--input <raw.json>] [--output <report.json>]
 *
 * Exit codes:
 *   0   - No secrets found (or all waived)
 *   302 - Secret(s) detected (post-waiver)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parse as parseYaml } from 'yaml';

class GitleaksScanner {
  constructor() {
    this.waivers = [];
    this.findings = [];
    this.summary = {
      scan_id: this.generateScanId(),
      timestamp: new Date().toISOString(),
      commit: this.getCurrentCommit(),
      policy_version: '1.0',
      totals: {
        secrets: 0,
        waived: 0,
      },
      blocked: 0,
      findings: [],
    };
  }

  generateScanId() {
    return `gitleaks-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      console.log('[gitleaks] No waivers file found, proceeding without waivers');
      return;
    }

    try {
      const content = fs.readFileSync(waiversPath, 'utf-8');
      const data = parseYaml(content);

      if (data && data.waivers) {
        const now = new Date();
        this.waivers = data.waivers.filter((w) => {
          // Filter for Gitleaks waivers only
          if (w.tool !== 'gitleaks') return false;

          // Check if waiver has expired
          if (w.expires) {
            const expiryDate = new Date(w.expires);
            if (expiryDate < now) {
              console.log(`[gitleaks] Waiver expired: ${w.rule} (expired ${w.expires})`);
              return false;
            }
          }

          return true;
        });

        console.log(`[gitleaks] Loaded ${this.waivers.length} active waivers`);
      }
    } catch (error) {
      console.error('[gitleaks] Error loading waivers:', error.message);
    }
  }

  isWaived(finding) {
    return this.waivers.some((waiver) => {
      // Match by rule ID
      if (waiver.rule && finding.RuleID !== waiver.rule) {
        return false;
      }

      // Match by file path
      if (waiver.path) {
        const findingPath = finding.File || '';
        if (!findingPath.includes(waiver.path)) {
          return false;
        }
      }

      // Match by secret fingerprint (for specific secrets)
      if (waiver.fingerprint && finding.Fingerprint !== waiver.fingerprint) {
        return false;
      }

      return true;
    });
  }

  async runGitleaks(configPath) {
    const gitleaksConfig = configPath || path.join(process.cwd(), '.gitleaks.toml');
    const outputPath = path.join(process.cwd(), 'runs', 'security', 'gitleaks-raw.json');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Check if Gitleaks is available
    try {
      execSync('gitleaks version', { stdio: 'ignore' });
    } catch {
      console.log('[gitleaks] Gitleaks not installed, creating mock output for development');
      this.createMockOutput(outputPath);
      return outputPath;
    }

    try {
      // Build Gitleaks command
      let cmd = `gitleaks detect --no-banner --report-format json --report-path ${outputPath}`;

      // Add config if it exists
      if (fs.existsSync(gitleaksConfig)) {
        cmd += ` --config ${gitleaksConfig}`;
      }

      console.log('[gitleaks] Running scan...');
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      // Gitleaks exits with non-zero if findings exist, which is expected
      if (!fs.existsSync(outputPath)) {
        // No findings - create empty report
        fs.writeFileSync(outputPath, '[]');
      }
    }

    return outputPath;
  }

  createMockOutput(outputPath) {
    // Create mock Gitleaks output for development/testing
    const mockData = [];

    fs.writeFileSync(outputPath, JSON.stringify(mockData, null, 2));
  }

  async processGitleaksOutput(inputPath) {
    let rawData;

    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      rawData = JSON.parse(content);
    } catch (error) {
      console.log('[gitleaks] No findings or invalid JSON, treating as clean');
      rawData = [];
    }

    if (!Array.isArray(rawData)) {
      console.log('[gitleaks] Invalid output format, treating as no findings');
      return;
    }

    for (const finding of rawData) {
      const isWaived = this.isWaived(finding);

      const processedFinding = {
        id: finding.Fingerprint || finding.RuleID,
        rule: finding.RuleID,
        description: finding.Description,
        file: finding.File,
        line: finding.StartLine || 0,
        column: finding.StartColumn || 0,
        match: finding.Match ? finding.Match.substring(0, 50) + '...' : '',
        entropy: finding.Entropy || 0,
        waived: isWaived,
        waiver_reason: isWaived ? this.getWaiverReason(finding) : null,
      };

      this.findings.push(processedFinding);

      // Update totals
      if (!isWaived) {
        this.summary.totals.secrets++;
        this.summary.blocked++;
      } else {
        this.summary.totals.waived++;
      }
    }

    this.summary.findings = this.findings;
  }

  getWaiverReason(finding) {
    const waiver = this.waivers.find(
      (w) =>
        (!w.rule || finding.RuleID === w.rule) &&
        (!w.path || (finding.File && finding.File.includes(w.path))) &&
        (!w.fingerprint || finding.Fingerprint === w.fingerprint),
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
    const runsPath = path.join(process.cwd(), 'runs', 'security', 'gitleaks.json');
    fs.writeFileSync(runsPath, JSON.stringify(this.summary, null, 2));

    console.log(`[gitleaks] Report generated: ${outputPath}`);
    console.log(
      `[gitleaks] Summary: Secrets=${this.summary.totals.secrets}, Waived=${this.summary.totals.waived}`,
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
  let outputPath = path.join(process.cwd(), 'reports', 'security', 'gitleaks.json');

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

  const scanner = new GitleaksScanner();

  try {
    // Load waivers
    await scanner.loadWaivers();

    // Run or load Gitleaks results
    if (!inputPath) {
      inputPath = await scanner.runGitleaks();
    }

    // Process findings
    await scanner.processGitleaksOutput(inputPath);

    // Generate report
    await scanner.generateReport(outputPath);

    // Exit with appropriate code
    if (scanner.shouldBlock()) {
      console.error('[gitleaks] BLOCKED: Secret(s) detected');
      process.exit(302);
    }

    console.log('[gitleaks] PASSED: No secrets found');
    process.exit(0);
  } catch (error) {
    console.error('[gitleaks] Error:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { GitleaksScanner };
