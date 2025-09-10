#!/usr/bin/env node
/**
 * DB Migration Validator
 *
 * Validates database migration results including successful application,
 * schema integrity, and validation query results.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { validateFileChecksum } from './checksum_manifest.mjs';

/**
 * Load and compile migration result schema
 */
async function loadSchema() {
  const schemaPath = path.resolve(process.cwd(), 'schemas', 'migration-result.schema.json');
  const schemaData = await readFile(schemaPath, 'utf8');
  const schema = JSON.parse(schemaData);

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Validate database migration results
 * @param {string} resultPath - Path to migration-result.json
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateMigrationResult(resultPath, options = {}) {
  const result = {
    valid: true,
    schemaValid: false,
    migrationsApplied: false,
    validationPassed: false,
    checksumValid: false,
    errors: [],
    warnings: [],
    stats: {},
    data: null,
  };

  // Check file exists
  if (!existsSync(resultPath)) {
    result.valid = false;
    result.errors.push(`File not found: ${resultPath}`);
    return result;
  }

  try {
    // Load migration result data
    const resultData = await readFile(resultPath, 'utf8');
    let migrationResult;
    try {
      migrationResult = JSON.parse(resultData);
    } catch (e) {
      result.valid = false;
      result.errors.push('Invalid JSON');
      return result;
    }
    result.data = migrationResult;

    // Validate against schema
    const validate = await loadSchema();
    const schemaValid = validate(migrationResult);
    result.schemaValid = schemaValid;

    if (!schemaValid) {
      result.valid = false;
      result.errors.push('Schema validation failed');
      if (validate.errors) {
        validate.errors.forEach((err) => {
          result.errors.push(`  ${err.instancePath || '/'}: ${err.message}`);
        });
      }
      return result;
    }

    // Collect stats
    result.stats = {
      engine: migrationResult.engine,
      totalMigrations: migrationResult.migrations.length,
      applied: 0,
      skipped: 0,
      failed: 0,
      totalExecutionTime: migrationResult.total_execution_time_ms || 0,
    };

    // Check migrations application status
    if (!migrationResult.applied) {
      result.valid = false;
      result.migrationsApplied = false;
      result.errors.push('Migrations were not successfully applied');
    } else {
      result.migrationsApplied = true;
    }

    // Analyze individual migrations
    const failedMigrations = [];
    for (const migration of migrationResult.migrations) {
      switch (migration.status) {
        case 'applied':
          result.stats.applied++;
          break;
        case 'skipped':
          result.stats.skipped++;
          break;
        case 'failed':
          result.stats.failed++;
          failedMigrations.push(migration);
          break;
        case 'rolled_back':
          result.stats.failed++;
          failedMigrations.push(migration);
          break;
      }

      // Validate migration file checksums if provided
      if (migration.checksum && migration.filename && options.migrationsPath) {
        const migrationPath = path.join(options.migrationsPath, migration.filename);
        if (existsSync(migrationPath)) {
          try {
            const valid = await validateFileChecksum(migrationPath, migration.checksum);
            if (!valid) {
              result.checksumValid = false;
              result.warnings.push(`Checksum mismatch for ${migration.filename}`);
            }
          } catch (err) {
            result.warnings.push(`Could not verify checksum for ${migration.filename}`);
          }
        }
      }
    }

    // Report failed migrations (allow tolerance without failing when within threshold)
    const maxFailed = options.max_failed_migrations ?? 0;
    if (failedMigrations.length > maxFailed) {
      result.valid = false;
      result.errors.push(
        `${failedMigrations.length} migration(s) failed, exceeds maximum ${maxFailed}`,
      );

      failedMigrations.forEach((migration) => {
        const error = migration.error_message || 'Unknown error';
        result.errors.push(`  ${migration.id}: ${error}`);
      });
    } else if (failedMigrations.length > 0) {
      // Within threshold: warn but do not fail
      failedMigrations.forEach((migration) => {
        const error = migration.error_message || 'Unknown error';
        result.warnings.push(`Migration ${migration.id} failed: ${error}`);
      });
    }

    // Check validation results
    if (!migrationResult.validation_ok) {
      result.valid = false;
      result.validationPassed = false;
      result.errors.push('Post-migration validation failed');
    } else {
      result.validationPassed = true;
    }

    // Analyze validation query results
    const requireValidation = options.validation_required ?? options.requireValidation ?? false;
    if (migrationResult.validation_results && migrationResult.validation_results.length > 0) {
      let validationFailures = 0;

      migrationResult.validation_results.forEach((check) => {
        if (!check.passed) {
          validationFailures++;
          const message =
            check.message || `Expected ${check.expected_rows} rows, got ${check.rows}`;
          result.errors.push(`  Validation '${check.name}': ${message}`);
        }
      });

      if (validationFailures > 0) {
        result.valid = false;
        result.errors.push(`${validationFailures} validation check(s) failed`);
      }
    } else if (requireValidation) {
      result.valid = false;
      result.errors.push('No validation queries were executed but validation is required');
    }

    // Check for schema snapshot
    if (!migrationResult.schema_snapshot) {
      result.warnings.push('No schema snapshot captured');
    } else {
      const snapshot = migrationResult.schema_snapshot;

      if (snapshot.tables) {
        result.stats.tableCount = snapshot.tables.length;
        result.stats.totalRows = snapshot.tables.reduce((sum, t) => sum + (t.row_count || 0), 0);
      }

      if (snapshot.indexes) {
        result.stats.indexCount = snapshot.indexes.length;
      }
    }

    // Check rollback availability
    if (migrationResult.rollback_performed) {
      result.warnings.push('Rollback was performed - database may be in previous state');
    } else if (!migrationResult.rollback_available && result.stats.applied > 0) {
      result.warnings.push('No rollback scripts available for applied migrations');
    }

    // Performance check
    if (result.stats.totalExecutionTime > 60000) {
      // More than 1 minute
      result.warnings.push(
        `Migrations took ${(result.stats.totalExecutionTime / 1000).toFixed(1)}s to complete`,
      );
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Error processing migration result: ${error.message}`);
  }

  return result;
}

/**
 * Extract migration summary for reporting
 * @param {Object} migrationResult - Validated migration result data
 * @returns {Object} Summary for reports
 */
export function extractMigrationSummary(migrationResult) {
  if (!migrationResult) return null;

  const summary = {
    engine: migrationResult.engine,
    database: migrationResult.database_name,
    schemaVersion: migrationResult.schema_version,
    success: migrationResult.applied && migrationResult.validation_ok,
    stats: {
      total: migrationResult.migrations.length,
      applied: 0,
      skipped: 0,
      failed: 0,
    },
    executionTime: migrationResult.total_execution_time_ms,
    tables: [],
    issues: [],
  };

  // Count migration statuses
  migrationResult.migrations.forEach((m) => {
    switch (m.status) {
      case 'applied':
        summary.stats.applied++;
        break;
      case 'skipped':
        summary.stats.skipped++;
        break;
      case 'failed':
      case 'rolled_back':
        summary.stats.failed++;
        summary.issues.push(`${m.id}: ${m.error_message || 'Failed'}`);
        break;
    }
  });

  // Extract table info if available
  if (migrationResult.schema_snapshot && migrationResult.schema_snapshot.tables) {
    summary.tables = migrationResult.schema_snapshot.tables.map((t) => ({
      name: t.name,
      columns: t.columns.length,
      rows: t.row_count || 0,
    }));
  }

  return summary;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
DB Migration Validator

Usage:
  node db_migration_validator.mjs <migration-result.json> [options]

Options:
  --migrations-path <dir>   Directory containing migration files for checksum validation
  --no-validation-required  Don't require validation queries

Examples:
  node db_migration_validator.mjs db/migration-result.json
  node db_migration_validator.mjs db/migration-result.json --migrations-path db/migrations

Exit codes:
  0 - Validation passed
  1 - Validation failed
  309 - DB migration failure (reserved for CVF)
`);
    process.exit(0);
  }

  const resultPath = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--migrations-path' && args[i + 1]) {
      options.migrationsPath = args[i + 1];
      i++;
    } else if (args[i] === '--no-validation-required') {
      options.requireValidation = false;
    }
  }

  try {
    const result = await validateMigrationResult(resultPath, options);

    console.log(`\nValidation: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Schema: ${result.schemaValid ? '✓' : '✗'}`);
    console.log(`  Migrations Applied: ${result.migrationsApplied ? '✓' : '✗'}`);
    console.log(`  Validation Passed: ${result.validationPassed ? '✓' : '✗'}`);
    console.log(`  Checksums: ${result.checksumValid !== false ? '✓' : '✗'}`);

    if (result.stats) {
      console.log('\nStats:');
      console.log(`  Engine: ${result.stats.engine}`);
      console.log(`  Total Migrations: ${result.stats.totalMigrations}`);
      console.log(`  Applied: ${result.stats.applied}`);
      console.log(`  Skipped: ${result.stats.skipped}`);
      console.log(`  Failed: ${result.stats.failed}`);

      if (result.stats.totalExecutionTime) {
        console.log(`  Execution Time: ${(result.stats.totalExecutionTime / 1000).toFixed(1)}s`);
      }

      if (result.stats.tableCount !== undefined) {
        console.log(`  Tables: ${result.stats.tableCount}`);
        console.log(`  Total Rows: ${result.stats.totalRows}`);
      }

      if (result.stats.indexCount !== undefined) {
        console.log(`  Indexes: ${result.stats.indexCount}`);
      }
    }

    if (result.data && result.data.schema_snapshot && result.data.schema_snapshot.tables) {
      console.log('\nSchema Summary:');
      result.data.schema_snapshot.tables.slice(0, 5).forEach((table) => {
        console.log(
          `  ${table.name}: ${table.columns.length} columns, ${table.row_count || 0} rows`,
        );
      });

      if (result.data.schema_snapshot.tables.length > 5) {
        console.log(`  ... and ${result.data.schema_snapshot.tables.length - 5} more tables`);
      }
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((err) => console.log(`  ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach((warn) => console.log(`  ${warn}`));
    }

    process.exit(result.valid ? 0 : 309);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
