#!/usr/bin/env node
/**
 * Cross-platform sequential test runner for CI reliability
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get all test files
const testFiles = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort() // Ensure consistent order
  .map((f) => path.join(__dirname, f));

console.log('TAP version 13');
let totalPass = 0;
let totalFail = 0;
let testIndex = 0;

async function runTest(file) {
  return new Promise((resolve) => {
    const testName = path.basename(file);
    console.log(`# Running ${testName}`);

    // Use forward slashes for cross-platform compatibility
    const testPath = file.replace(/\\/g, '/');

    const proc = spawn(process.execPath, ['--test', testPath], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
      shell: false,
    });

    let output = '';
    let timedOut = false;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('error', (err) => {
      console.error(`# Error spawning test process: ${err.message}`);
      testIndex++;
      console.log(`not ok ${testIndex} - ${testName} (spawn error)`);
      totalFail++;
      resolve();
    });

    // Kill hanging tests after 30 seconds
    const timeout = setTimeout(() => {
      if (!proc.killed) {
        timedOut = true;
        console.error(`# Test ${testName} timed out after 30s`);
        // Use SIGKILL for more forceful termination
        proc.kill(process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
      }
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        testIndex++;
        console.log(`not ok ${testIndex} - ${testName} (timeout)`);
        totalFail++;
        resolve();
        return;
      }

      // Parse test results from output
      const passMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);

      if (passMatch) totalPass += parseInt(passMatch[1], 10);
      if (failMatch) totalFail += parseInt(failMatch[1], 10);

      testIndex++;
      if (code !== 0) {
        console.log(`not ok ${testIndex} - ${testName}`);
        if (!failMatch) totalFail++; // Count as failure if not already counted
      } else {
        console.log(`ok ${testIndex} - ${testName}`);
      }

      resolve();
    });
  });
}

// Run tests sequentially
async function runAllTests() {
  console.log(`# Found ${testFiles.length} test files`);
  console.log(`# Platform: ${process.platform}`);
  console.log(`# Node: ${process.version}`);

  for (const file of testFiles) {
    try {
      await runTest(file);
    } catch (err) {
      console.error(`# Fatal error running ${path.basename(file)}: ${err.message}`);
      testIndex++;
      console.log(`not ok ${testIndex} - ${path.basename(file)} (fatal error)`);
      totalFail++;
    }
  }

  // Print summary
  console.log(`1..${testIndex}`);
  console.log(`# tests ${totalPass + totalFail}`);
  console.log(`# pass ${totalPass}`);
  console.log(`# fail ${totalFail}`);
  console.log('# done');

  // Exit with proper code
  const exitCode = totalFail > 0 ? 1 : 0;
  console.log(`# Exit code: ${exitCode}`);
  process.exit(exitCode);
}

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('# Uncaught exception in test runner:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('# Unhandled rejection in test runner:', err);
  process.exit(1);
});

// Start test execution
runAllTests().catch((err) => {
  console.error('# Test runner failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
