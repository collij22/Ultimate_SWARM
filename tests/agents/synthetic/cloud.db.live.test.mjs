#!/usr/bin/env node
/**
 * Live integration tests for Supabase (cloud.db)
 * These tests are gated by API keys and will skip if not available
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { executeToolRequest } from '../../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';

const SKIP_LIVE_TESTS = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY;

describe('Supabase Live Integration', { skip: SKIP_LIVE_TESTS }, () => {
  const tenant = 'test-tenant';
  
  before(() => {
    // Ensure we're in live mode
    process.env.TEST_MODE = 'false';
    console.log('Running Supabase live tests with:', {
      url: process.env.SUPABASE_URL?.replace(/https:\/\/([^.]+).*/, 'https://***.$1'),
      hasKey: !!process.env.SUPABASE_SERVICE_KEY
    });
  });
  
  describe('Connectivity', () => {
    it('should test live connectivity and return valid JSON', async () => {
      const runId = 'test-supabase-live-connect-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'connectivity'
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      // Verify capability
      assert.strictEqual(result.capability, 'cloud.db');
      assert.ok(result.artifacts, 'Should have artifacts');
      assert.ok(result.artifacts.length > 0, 'Should have at least one artifact');
      
      // Check connectivity.json
      const connectPath = result.artifacts.find(a => a.includes('connectivity.json'));
      assert.ok(connectPath, 'Should have connectivity.json');
      assert.ok(fs.existsSync(connectPath), 'Connectivity file should exist');
      
      const connectivity = JSON.parse(fs.readFileSync(connectPath, 'utf8'));
      
      // Validate connectivity structure
      assert.ok(connectivity.status, 'Should have status');
      assert.ok(connectivity.latency_ms >= 0, 'Should have non-negative latency');
      assert.ok(connectivity.timestamp, 'Should have timestamp');
      assert.ok(connectivity.url.includes('***'), 'URL should be sanitized');
      assert.ok(!connectivity.url.includes('.supabase.'), 'Should not leak project ID');
      
      // Validate outputs
      assert.ok(result.outputs, 'Should have outputs');
      if (connectivity.status === 'connected') {
        assert.ok(result.outputs.latency_ms >= 0, 'Output should have latency');
      }
      
      console.log('Connectivity test passed:', {
        status: connectivity.status,
        latency: connectivity.latency_ms + 'ms'
      });
    });
  });
  
  describe('Query Operations', () => {
    it('should execute a query and return results', async () => {
      const runId = 'test-supabase-live-query-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'query',
          table: 'test_table', // This table might not exist
          limit: 5
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      assert.strictEqual(result.capability, 'cloud.db');
      assert.ok(result.artifacts);
      
      // Check roundtrip.json
      const roundtripPath = result.artifacts.find(a => a.includes('roundtrip.json'));
      assert.ok(roundtripPath, 'Should have roundtrip.json');
      
      if (fs.existsSync(roundtripPath)) {
        const roundtrip = JSON.parse(fs.readFileSync(roundtripPath, 'utf8'));
        
        assert.strictEqual(roundtrip.table, 'test_table');
        assert.strictEqual(roundtrip.operation, 'select');
        assert.ok(roundtrip.duration_ms >= 0, 'Should have query duration');
        assert.ok(typeof roundtrip.success === 'boolean', 'Should have success flag');
        
        if (!roundtrip.success) {
          console.log('Query failed (expected if table does not exist):', roundtrip.error);
        } else {
          assert.ok(roundtrip.result_count >= 0, 'Should have result count');
          console.log('Query succeeded:', {
            table: roundtrip.table,
            rows: roundtrip.result_count,
            time: roundtrip.duration_ms + 'ms'
          });
        }
      }
    });
  });
  
  describe('Schema Documentation', () => {
    it('should document schema without creating tables', async () => {
      const runId = 'test-supabase-live-schema-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'create_schema',
          schema_name: 'test_schema_' + Date.now(),
          tables: [
            {
              name: 'test_users',
              columns: [
                { name: 'id', type: 'serial', primary: true },
                { name: 'email', type: 'varchar(255)' }
              ]
            }
          ]
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      assert.strictEqual(result.capability, 'cloud.db');
      
      // Check schema.json
      const schemaPath = result.artifacts.find(a => a.includes('schema.json'));
      assert.ok(schemaPath, 'Should have schema.json');
      
      if (fs.existsSync(schemaPath)) {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        
        assert.ok(schema.name.startsWith('test_schema_'));
        assert.ok(Array.isArray(schema.tables));
        assert.ok(schema.created_at);
        assert.strictEqual(schema.environment, 'production');
        
        // Verify table documentation
        const table = schema.tables[0];
        assert.strictEqual(table.name, 'test_users');
        assert.strictEqual(table.status, 'documented');
        assert.ok(table.note.includes('SQL permissions'));
        
        console.log('Schema documented:', {
          name: schema.name,
          tables: schema.tables.length,
          environment: schema.environment
        });
      }
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid table gracefully', async () => {
      const runId = 'test-supabase-live-error-' + Date.now();
      
      const toolRequest = {
        capability: 'cloud.db',
        input_spec: {
          operation: 'query',
          table: 'definitely_nonexistent_table_xyz',
          limit: 1
        }
      };
      
      const result = await executeToolRequest({ 
        tenant, 
        runId,
        toolRequest,
        selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }]
      });
      
      // Should not throw, but return error in artifacts
      assert.strictEqual(result.capability, 'cloud.db');
      assert.ok(result.artifacts);
      
      // Check for error handling
      const roundtripPath = result.artifacts.find(a => a.includes('roundtrip.json'));
      if (roundtripPath && fs.existsSync(roundtripPath)) {
        const roundtrip = JSON.parse(fs.readFileSync(roundtripPath, 'utf8'));
        
        // Table likely doesn't exist
        if (!roundtrip.success) {
          assert.ok(roundtrip.error, 'Should have error message');
          assert.ok(!roundtrip.error.includes(process.env.SUPABASE_SERVICE_KEY), 
            'Error should not leak API key');
          console.log('Error handled correctly for non-existent table');
        }
      }
    });
  });
});

// Export for use in other tests
export { SKIP_LIVE_TESTS };