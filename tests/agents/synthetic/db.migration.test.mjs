/**
 * Synthetic test for database migration capability
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { validateMigrationResult } from '../../../orchestration/lib/db_migration_validator.mjs';

test('db.migration fast-tier: applies migrations and validates schema', async () => {
  const testDir = 'runs/test-db-migration';
  const dbDir = path.join(testDir, 'db');
  const migrationsDir = path.join(dbDir, 'migrations');

  try {
    // Setup test directories
    await mkdir(migrationsDir, { recursive: true });

    // Create mock migration files
    const migration1 = `-- Migration: Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

    const migration2 = `-- Migration: Create posts table
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`;

    const migration3 = `-- Migration: Add indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published_at);
CREATE INDEX idx_users_email ON users(email);`;

    await writeFile(path.join(migrationsDir, '001_create_users.sql'), migration1);
    await writeFile(path.join(migrationsDir, '002_create_posts.sql'), migration2);
    await writeFile(path.join(migrationsDir, '003_add_indexes.sql'), migration3);

    // Create migration result
    const migrationResult = {
      generated_at: new Date().toISOString(),
      engine: 'sqlite',
      engine_version: '3.40.0',
      applied: true,
      database_name: 'test_app.db',
      schema_version: '1.0.3',
      migrations: [
        {
          id: '001_create_users',
          filename: '001_create_users.sql',
          status: 'applied',
          execution_time_ms: 25,
          affected_rows: 0,
        },
        {
          id: '002_create_posts',
          filename: '002_create_posts.sql',
          status: 'applied',
          execution_time_ms: 18,
          affected_rows: 0,
        },
        {
          id: '003_add_indexes',
          filename: '003_add_indexes.sql',
          status: 'applied',
          execution_time_ms: 35,
          affected_rows: 0,
        },
      ],
      validation_ok: true,
      validation_results: [
        {
          name: 'users_table_exists',
          query: 'SELECT COUNT(*) FROM sqlite_master WHERE type="table" AND name="users"',
          rows: 1,
          expected_rows: 1,
          passed: true,
        },
        {
          name: 'posts_table_exists',
          query: 'SELECT COUNT(*) FROM sqlite_master WHERE type="table" AND name="posts"',
          rows: 1,
          expected_rows: 1,
          passed: true,
        },
        {
          name: 'indexes_created',
          query: 'SELECT COUNT(*) FROM sqlite_master WHERE type="index"',
          rows: 3,
          expected_rows: 3,
          passed: true,
        },
      ],
      rollback_available: true,
      rollback_performed: false,
      schema_snapshot: {
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER', nullable: false, primary_key: true },
              { name: 'username', type: 'VARCHAR(50)', nullable: false },
              { name: 'email', type: 'VARCHAR(100)', nullable: false },
              { name: 'created_at', type: 'TIMESTAMP', nullable: true },
            ],
            row_count: 0,
          },
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'INTEGER', nullable: false, primary_key: true },
              { name: 'user_id', type: 'INTEGER', nullable: false, foreign_key: 'users.id' },
              { name: 'title', type: 'VARCHAR(200)', nullable: false },
              { name: 'content', type: 'TEXT', nullable: true },
              { name: 'published_at', type: 'TIMESTAMP', nullable: true },
              { name: 'created_at', type: 'TIMESTAMP', nullable: true },
            ],
            row_count: 0,
          },
        ],
        indexes: [
          { name: 'idx_posts_user_id', table: 'posts', columns: ['user_id'], unique: false },
          { name: 'idx_posts_published', table: 'posts', columns: ['published_at'], unique: false },
          { name: 'idx_users_email', table: 'users', columns: ['email'], unique: false },
        ],
      },
      total_execution_time_ms: 78,
      warnings: [],
    };

    // Write migration result file
    const resultPath = path.join(dbDir, 'migration-result.json');
    await writeFile(resultPath, JSON.stringify(migrationResult, null, 2));

    // Validate the migration result
    const validation = await validateMigrationResult(resultPath, {
      max_failed_migrations: 0,
      validation_required: false,
    });
    if (!validation.valid) {
      console.log('DEBUG_DB_VALIDATION:', JSON.stringify(validation, null, 2));
    }

    // Assertions
    assert.ok(existsSync(resultPath), 'Migration result file should exist');
    assert.strictEqual(validation.valid, true, 'Migration should pass validation');
    assert.strictEqual(validation.schemaValid, true, 'Schema should be valid');
    assert.strictEqual(validation.migrationsApplied, true, 'Migrations should be applied');
    assert.strictEqual(validation.validationPassed, true, 'Validation should pass');
    assert.strictEqual(validation.stats.applied, 3, 'Should have 3 applied migrations');
    assert.strictEqual(validation.stats.failed, 0, 'Should have no failed migrations');

    // Test with mixed results (some failures)
    const mixedResult = {
      ...migrationResult,
      migrations: [
        ...migrationResult.migrations.slice(0, 2),
        {
          id: '003_add_indexes',
          filename: '003_add_indexes.sql',
          status: 'failed',
          error_message: 'Index already exists',
          execution_time_ms: 5,
        },
        {
          id: '004_add_constraints',
          filename: '004_add_constraints.sql',
          status: 'skipped',
          execution_time_ms: 0,
        },
      ],
    };

    const mixedPath = path.join(dbDir, 'migration-result-mixed.json');
    await writeFile(mixedPath, JSON.stringify(mixedResult, null, 2));

    const mixedValidation = await validateMigrationResult(mixedPath, {
      max_failed_migrations: 1, // Allow 1 failure
    });

    assert.strictEqual(mixedValidation.valid, true, 'Should pass with allowed failures');
    assert.strictEqual(mixedValidation.stats.applied, 2, 'Should have 2 applied');
    assert.strictEqual(mixedValidation.stats.failed, 1, 'Should have 1 failed');
    assert.strictEqual(mixedValidation.stats.skipped, 1, 'Should have 1 skipped');

    // Test with validation failures
    const failedValidation = {
      ...migrationResult,
      validation_ok: false,
      validation_results: [
        {
          name: 'users_table_exists',
          query: 'SELECT COUNT(*) FROM sqlite_master WHERE type="table" AND name="users"',
          rows: 0,
          expected_rows: 1,
          passed: false,
          message: 'Users table not found',
        },
      ],
    };

    const failedPath = path.join(dbDir, 'migration-result-failed.json');
    await writeFile(failedPath, JSON.stringify(failedValidation, null, 2));

    const failedValidationResult = await validateMigrationResult(failedPath);

    assert.strictEqual(failedValidationResult.valid, false, 'Should fail with validation errors');
    assert.strictEqual(
      failedValidationResult.validationPassed,
      false,
      'Validation should not pass',
    );

    // Test rollback scenario
    const rollbackResult = {
      ...migrationResult,
      applied: true,
      rollback_performed: true,
      migrations: migrationResult.migrations.map((m) => ({
        ...m,
        status: 'rolled_back',
        error_message: 'Rolled back due to validation failure',
      })),
    };

    const rollbackPath = path.join(dbDir, 'migration-result-rollback.json');
    await writeFile(rollbackPath, JSON.stringify(rollbackResult, null, 2));

    const rollbackValidation = await validateMigrationResult(rollbackPath, {
      max_failed_migrations: 5, // Allow rollbacks
    });

    assert.strictEqual(rollbackValidation.valid, true, 'Should handle rollback scenario');
    assert.strictEqual(rollbackValidation.stats.failed, 3, 'Rollbacks count as failures');
  } finally {
    // Cleanup
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  }
});
