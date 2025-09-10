#!/usr/bin/env node
/**
 * Checksum Manifest Validator
 *
 * Validates file checksums against a manifest to ensure input integrity.
 * Used for data pipelines, media composition, and migration validation.
 */

import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Calculate SHA-256 checksum of a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function calculateChecksum(filePath) {
  const hash = createHash('sha256');
  const data = await readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Create a manifest of files with checksums
 * @param {string[]} filePaths - Array of file paths
 * @returns {Promise<Array>} Manifest entries with path, sha256, and size
 */
export async function createManifest(filePaths) {
  const manifest = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const [checksum, stats] = await Promise.all([calculateChecksum(filePath), stat(filePath)]);

    manifest.push({
      path: path.relative(process.cwd(), filePath),
      sha256: checksum,
      size: stats.size,
    });
  }

  return manifest;
}

/**
 * Validate files against a manifest
 * @param {Array} manifest - Manifest entries with expected checksums
 * @param {string} basePath - Base path for resolving relative paths
 * @returns {Promise<Object>} Validation result
 */
export async function validateManifest(manifest, basePath = process.cwd()) {
  const results = {
    valid: true,
    total: manifest.length,
    passed: 0,
    failed: 0,
    errors: [],
  };

  for (const entry of manifest) {
    const filePath = path.resolve(basePath, entry.path);

    if (!existsSync(filePath)) {
      results.valid = false;
      results.failed++;
      results.errors.push({
        path: entry.path,
        error: 'File not found',
      });
      continue;
    }

    try {
      const [actualChecksum, stats] = await Promise.all([
        calculateChecksum(filePath),
        stat(filePath),
      ]);

      if (actualChecksum !== entry.sha256) {
        results.valid = false;
        results.failed++;
        results.errors.push({
          path: entry.path,
          error: 'Checksum mismatch',
          expected: entry.sha256,
          actual: actualChecksum,
        });
      } else if (entry.size !== undefined && stats.size !== entry.size) {
        results.valid = false;
        results.failed++;
        results.errors.push({
          path: entry.path,
          error: 'Size mismatch',
          expected: entry.size,
          actual: stats.size,
        });
      } else {
        results.passed++;
      }
    } catch (error) {
      results.valid = false;
      results.failed++;
      results.errors.push({
        path: entry.path,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Validate a single file checksum
 * @param {string} filePath - Path to file
 * @param {string} expectedChecksum - Expected SHA-256 checksum
 * @returns {Promise<boolean>} True if checksum matches
 */
export async function validateFileChecksum(filePath, expectedChecksum) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const actualChecksum = await calculateChecksum(filePath);
  return actualChecksum === expectedChecksum;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Checksum Manifest Validator

Usage:
  node checksum_manifest.mjs create <file1> [file2...] > manifest.json
  node checksum_manifest.mjs validate <manifest.json>
  node checksum_manifest.mjs check <file> <expected-sha256>

Commands:
  create   - Create manifest with checksums for files
  validate - Validate files against a manifest
  check    - Check single file against expected checksum

Examples:
  node checksum_manifest.mjs create data/*.csv > data-manifest.json
  node checksum_manifest.mjs validate data-manifest.json
  node checksum_manifest.mjs check data.csv abc123...
`);
    process.exit(0);
  }

  const command = args[0];

  try {
    if (command === 'create') {
      const files = args.slice(1);
      if (files.length === 0) {
        console.error('Error: No files specified');
        process.exit(1);
      }
      const manifest = await createManifest(files);
      console.log(JSON.stringify(manifest, null, 2));
    } else if (command === 'validate') {
      const manifestPath = args[1];
      if (!manifestPath) {
        console.error('Error: No manifest file specified');
        process.exit(1);
      }
      const manifestData = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);
      const result = await validateManifest(manifest);

      console.log(`Validation: ${result.valid ? 'PASSED' : 'FAILED'}`);
      console.log(`Total: ${result.total}, Passed: ${result.passed}, Failed: ${result.failed}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  ${error.path}: ${error.error}`);
          if (error.expected) {
            console.log(`    Expected: ${error.expected}`);
            console.log(`    Actual: ${error.actual}`);
          }
        }
      }

      process.exit(result.valid ? 0 : 1);
    } else if (command === 'check') {
      const [filePath, expectedChecksum] = args.slice(1);
      if (!filePath || !expectedChecksum) {
        console.error('Error: File path and expected checksum required');
        process.exit(1);
      }

      const valid = await validateFileChecksum(filePath, expectedChecksum);
      const actualChecksum = await calculateChecksum(filePath);

      console.log(`File: ${filePath}`);
      console.log(`Expected: ${expectedChecksum}`);
      console.log(`Actual: ${actualChecksum}`);
      console.log(`Valid: ${valid ? 'YES' : 'NO'}`);

      process.exit(valid ? 0 : 1);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
