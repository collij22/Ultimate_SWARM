/**
 * Unit tests for database migration validation functions
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateMigrationResult } from '../../orchestration/lib/db_migration_validator.mjs';
import { writeFile, rm, mkdir } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('DB Migration Validator', () => {
  const tempDir = path.join(tmpdir(), 'db-migration-validator-test');

  async function createTempFile(filename, content) {
    const filePath = path.join(tempDir, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return filePath;
  }

  // Clean up temp files after tests
  async function cleanup() {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {}
  }

  describe('validateMigrationResult', () => {
    it('should validate a successful migration result', async () => {
      const validResult = {
        generated_at: new Date().toISOString(),
        engine: 'sqlite',
        engine_version: '3.40.0',
        applied: true,
        database_name: 'test_db',
        schema_version: '1.0.0',
        migrations: [
          {
            id: '001_create_users',
            filename: '001_create_users.sql',
            status: 'applied',
            execution_time_ms: 15,
            affected_rows: 0,
          },
          {
            id: '002_add_indexes',
            filename: '002_add_indexes.sql',
            status: 'applied',
            execution_time_ms: 10,
            affected_rows: 0,
          },
        ],
        validation_ok: true,
        validation_results: [
          {
            name: 'users_table_exists',
            query: 'SELECT COUNT(*) FROM users',
            rows: 0,
            expected_rows: 0,
            passed: true,
          },
        ],
        rollback_available: true,
        rollback_performed: false,
        total_execution_time_ms: 25,
      };

      const resultPath = await createTempFile('migration-result.json', JSON.stringify(validResult));
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.schemaValid, true);
      assert.strictEqual(result.migrationsApplied, true);
      assert.strictEqual(result.validationPassed, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.stats.applied, 2);
      assert.strictEqual(result.stats.failed, 0);

      await cleanup();
    });

    it('should fail when migrations were not applied', async () => {
      const failedResult = {
        engine: 'postgres-local',
        applied: false, // Migrations failed
        migrations: [
          {
            id: '001_create_table',
            status: 'failed',
            error_message: 'Table already exists',
          },
        ],
        validation_ok: false,
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(failedResult),
      );
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.migrationsApplied, false);
      assert.ok(result.errors.some((e) => e.includes('not successfully applied')));

      await cleanup();
    });

    it('should fail when failed migrations exceed threshold', async () => {
      const mixedResult = {
        engine: 'duckdb',
        applied: true,
        migrations: [
          { id: '001', status: 'applied' },
          { id: '002', status: 'failed', error_message: 'Syntax error' },
          { id: '003', status: 'failed', error_message: 'Permission denied' },
          { id: '004', status: 'applied' },
        ],
        validation_ok: false,
      };

      const resultPath = await createTempFile('migration-result.json', JSON.stringify(mixedResult));
      const result = await validateMigrationResult(resultPath, {
        max_failed_migrations: 1, // Allow max 1 failure
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('exceeds maximum')));
      assert.strictEqual(result.stats.failed, 2);
      assert.strictEqual(result.stats.applied, 2);

      await cleanup();
    });

    it('should warn but pass when failures are within threshold', async () => {
      const mixedResult = {
        engine: 'duckdb',
        applied: true,
        migrations: [
          { id: '001', status: 'applied' },
          { id: '002', status: 'failed', error_message: 'Non-critical migration' },
          { id: '003', status: 'applied' },
        ],
        validation_ok: true,
      };

      const resultPath = await createTempFile('migration-result.json', JSON.stringify(mixedResult));
      const result = await validateMigrationResult(resultPath, {
        max_failed_migrations: 1, // Allow max 1 failure
      });

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some((w) => w.includes('Migration 002 failed')));

      await cleanup();
    });

    it('should fail when validation is not ok', async () => {
      const invalidValidation = {
        engine: 'sqlite',
        applied: true,
        migrations: [{ id: '001', status: 'applied' }],
        validation_ok: false, // Validation failed
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(invalidValidation),
      );
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.validationPassed, false);
      assert.ok(result.errors.some((e) => e.includes('Post-migration validation failed')));

      await cleanup();
    });

    it('should fail when validation queries fail', async () => {
      const failedValidationChecks = {
        engine: 'postgres-local',
        applied: true,
        migrations: [{ id: '001', status: 'applied' }],
        validation_ok: true,
        validation_results: [
          {
            name: 'check_user_count',
            rows: 0,
            expected_rows: 10,
            passed: false,
            message: 'Expected 10 users, found 0',
          },
          {
            name: 'check_indexes',
            rows: 2,
            expected_rows: 2,
            passed: true,
          },
        ],
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(failedValidationChecks),
      );
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('validation check(s) failed')));
      assert.ok(result.errors.some((e) => e.includes('Expected 10 users, found 0')));

      await cleanup();
    });

    it('should fail when validation is required but not performed', async () => {
      const noValidation = {
        engine: 'sqlite',
        applied: true,
        migrations: [{ id: '001', status: 'applied' }],
        validation_ok: true,
        // No validation_results array
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(noValidation),
      );
      const result = await validateMigrationResult(resultPath, {
        validation_required: true,
      });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) =>
          e.includes('No validation queries were executed but validation is required'),
        ),
      );

      await cleanup();
    });

    it('should pass when validation is not required', async () => {
      const noValidation = {
        engine: 'sqlite',
        applied: true,
        migrations: [{ id: '001', status: 'applied' }],
        validation_ok: true,
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(noValidation),
      );
      const result = await validateMigrationResult(resultPath, {
        validation_required: false,
      });

      assert.strictEqual(result.valid, true);

      await cleanup();
    });

    it('should count skipped and rolled_back migrations correctly', async () => {
      const mixedStatuses = {
        engine: 'mysql-local',
        applied: true,
        migrations: [
          { id: '001', status: 'applied' },
          { id: '002', status: 'skipped' },
          { id: '003', status: 'rolled_back', error_message: 'Rolled back due to error' },
          { id: '004', status: 'applied' },
          { id: '005', status: 'skipped' },
        ],
        validation_ok: true,
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(mixedStatuses),
      );
      const result = await validateMigrationResult(resultPath, {
        max_failed_migrations: 1,
      });

      assert.strictEqual(result.stats.applied, 2);
      assert.strictEqual(result.stats.skipped, 2);
      assert.strictEqual(result.stats.failed, 1); // rolled_back counts as failed

      await cleanup();
    });

    it('should fail on invalid schema', async () => {
      const invalidSchema = {
        // Missing required fields
        migrations: [],
      };

      const resultPath = await createTempFile(
        'migration-result.json',
        JSON.stringify(invalidSchema),
      );
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.schemaValid, false);
      assert.ok(result.errors.some((e) => e.includes('Schema validation failed')));

      await cleanup();
    });

    it('should return error for non-existent file', async () => {
      const result = await validateMigrationResult('/non/existent/file.json');

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('File not found')));
    });

    it('should return error for invalid JSON', async () => {
      const resultPath = await createTempFile('invalid.json', 'not valid json');
      const result = await validateMigrationResult(resultPath);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Invalid JSON')));

      await cleanup();
    });
  });
});
