#!/usr/bin/env node
/**
 * Phase 13 Demo Integration Tests
 *
 * Validates all Secondary tool demos work correctly with:
 * - TEST_MODE enabled
 * - Tenant-scoped artifact paths
 * - Proper consent handling
 * - Report generation
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// Test configuration
const demos = [
  {
    name: 'Payments Test Demo',
    file: 'payments-test-demo.yaml',
    expectedArtifacts: [
      'runs/tenants/default/payments_demo/payment_intent.json',
      'runs/tenants/default/payments_demo/charge.json',
    ],
  },
  {
    name: 'Cloud DB Demo',
    file: 'cloud-db-demo.yaml',
    expectedArtifacts: [
      'runs/tenants/default/db_demo/connectivity.json',
      'runs/tenants/default/db_demo/roundtrip.json',
      'runs/tenants/default/db_demo/schema.json',
    ],
  },
  {
    name: 'SEO Audit Large Demo',
    file: 'seo-audit-large.yaml',
    expectedArtifacts: [
      'runs/tenants/default/crawl_demo/urls.json',
      'runs/tenants/default/crawl_demo/graph.json',
    ],
  },
  {
    name: 'Cloud TTS Demo',
    file: 'tts-cloud-demo.yaml',
    expectedArtifacts: ['runs/tenants/default/tts_cloud_demo/narration.wav'],
  },
];

/**
 * Run a demo graph with specified mode
 */
async function runDemo(demoFile, mode = 'deterministic') {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      TEST_MODE: 'true',
      SWARM_MODE: mode,
      SECONDARY_CONSENT: 'true',
    };

    const proc = spawn(
      process.execPath,
      ['orchestration/graph/runner.mjs', `orchestration/graph/projects/${demoFile}`],
      {
        cwd: projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Demo ${demoFile} failed with code ${code}\n${stderr}`));
      }
    });
  });
}

/**
 * Verify artifacts exist
 */
function verifyArtifacts(expectedArtifacts) {
  const missing = [];
  const found = [];

  for (const artifact of expectedArtifacts) {
    const fullPath = path.join(projectRoot, artifact);
    if (fs.existsSync(fullPath)) {
      found.push(artifact);
    } else {
      missing.push(artifact);
    }
  }

  return { found, missing };
}

/**
 * Clean up old artifacts
 */
function cleanupArtifacts() {
  const dirs = [
    'runs/tenants/default/payments_demo',
    'runs/tenants/default/db_demo',
    'runs/tenants/default/crawl_demo',
    'runs/tenants/default/tts_cloud_demo',
    'runs/cache',
  ];

  for (const dir of dirs) {
    const fullPath = path.join(projectRoot, dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('=== Phase 13 Demo Integration Tests ===\n');

  let totalPassed = 0;
  let totalFailed = 0;

  // Test both modes
  const modes = ['deterministic', 'claude'];

  for (const mode of modes) {
    console.log(`\n=== Testing in ${mode.toUpperCase()} mode ===\n`);

    for (const demo of demos) {
      console.log(`Testing: ${demo.name} (${mode} mode)`);
      console.log(`  File: ${demo.file}`);

      // Clean up before test
      cleanupArtifacts();

      try {
        // Run the demo
        const result = await runDemo(demo.file, mode);

        // Check if it completed successfully
        if (result.stdout.includes('Success: ✅')) {
          console.log('  ✅ Demo completed successfully');

          // Verify artifacts
          const { found, missing } = verifyArtifacts(demo.expectedArtifacts);

          if (missing.length === 0) {
            console.log(`  ✅ All ${found.length} artifacts created`);
            totalPassed++;
          } else {
            console.log('  ❌ Missing artifacts:');
            missing.forEach((a) => console.log(`     - ${a}`));
            totalFailed++;
          }
        } else {
          console.log('  ❌ Demo did not complete successfully');
          console.log('  Output:', result.stdout.slice(-200));
          totalFailed++;
        }
      } catch (error) {
        console.log(`  ❌ Demo failed: ${error.message}`);
        totalFailed++;
      }

      console.log();
    }
  }

  // Summary
  console.log('=== Test Summary ===');
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(
    `Total: ${demos.length * modes.length} (${demos.length} demos × ${modes.length} modes)`,
  );

  // Validate tenant paths
  console.log('\n=== Tenant Path Validation ===');
  const tenantDir = path.join(projectRoot, 'runs/tenants/default');
  if (fs.existsSync(tenantDir)) {
    const subdirs = fs.readdirSync(tenantDir);
    console.log(`✅ Tenant directory exists with ${subdirs.length} subdirectories`);
    subdirs.forEach((d) => console.log(`   - ${d}`));
  } else {
    console.log('❌ Tenant directory does not exist');
  }

  // Exit code
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
