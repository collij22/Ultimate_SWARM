#!/usr/bin/env node
/**
 * Sequential test runner to avoid hanging issues with Node.js test runner
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
  .map((f) => path.join(__dirname, f));

console.log('TAP version 13');
let totalPass = 0;
let totalFail = 0;
let testIndex = 0;

async function runTest(file) {
  return new Promise((resolve) => {
    const testName = path.basename(file);
    console.log(`# Running ${testName}`);

    const proc = spawn(process.execPath, ['--test', file], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      // Parse test results from output
      const passMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);

      if (passMatch) totalPass += parseInt(passMatch[1]);
      if (failMatch) totalFail += parseInt(failMatch[1]);

      testIndex++;
      if (code !== 0) {
        console.log(`not ok ${testIndex} - ${testName}`);
        totalFail++;
      } else {
        console.log(`ok ${testIndex} - ${testName}`);
      }

      resolve();
    });

    // Kill hanging tests after 30 seconds
    setTimeout(() => {
      if (!proc.killed) {
        console.error(`# Test ${testName} timed out after 30s`);
        proc.kill('SIGTERM');
      }
    }, 30000);
  });
}

// Run tests sequentially
async function runAllTests() {
  for (const file of testFiles) {
    await runTest(file);
  }

  // Print summary
  console.log(`1..${testIndex}`);
  console.log(`# tests ${totalPass + totalFail}`);
  console.log(`# pass ${totalPass}`);
  console.log(`# fail ${totalFail}`);
  console.log('# done');

  process.exit(totalFail > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
