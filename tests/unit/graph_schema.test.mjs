/**
 * Unit test for graph schema validation
 * Validates demo graphs against the schema
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import Ajv from 'ajv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Graph Schema Validation', () => {
  let ajv;
  let validate;
  
  beforeAll(() => {
    // Load the schema
    const schemaPath = path.join(__dirname, '../../orchestration/graph/spec.schema.yaml');
    const schema = yaml.parse(fs.readFileSync(schemaPath, 'utf8'));
    
    ajv = new Ajv({ allErrors: true });
    validate = ajv.compile(schema);
  });
  
  describe('Demo Graph Files', () => {
    it('should validate demo-validation.yaml', () => {
      const graphPath = path.join(__dirname, '../../orchestration/graph/projects/demo-validation.yaml');
      const graph = yaml.parse(fs.readFileSync(graphPath, 'utf8'));
      
      const valid = validate(graph);
      if (!valid) {
        console.error('Validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
      expect(graph.version).toBe('1.0');
      expect(graph.nodes).toBeDefined();
      expect(graph.nodes.length).toBeGreaterThan(0);
    });
    
    it('should validate working-demo.yaml', () => {
      const graphPath = path.join(__dirname, '../../orchestration/graph/projects/working-demo.yaml');
      const graph = yaml.parse(fs.readFileSync(graphPath, 'utf8'));
      
      const valid = validate(graph);
      expect(valid).toBe(true);
      expect(graph.concurrency).toBe(3);
    });
    
    it('should validate compiled-demo.yaml if exists', () => {
      const graphPath = path.join(__dirname, '../../orchestration/graph/projects/compiled-demo.yaml');
      
      if (fs.existsSync(graphPath)) {
        const graph = yaml.parse(fs.readFileSync(graphPath, 'utf8'));
        
        const valid = validate(graph);
        expect(valid).toBe(true);
        expect(graph.nodes.length).toBe(25); // 1 server + 8 AUVs × 3 nodes
        expect(graph.edges.length).toBe(27);
      }
    });
  });
  
  describe('Schema Constraints', () => {
    it('should reject invalid version', () => {
      const graph = {
        version: '2.0',
        project_id: 'test',
        nodes: []
      };
      
      const valid = validate(graph);
      expect(valid).toBe(false);
      expect(validate.errors.some(e => e.instancePath === '/version')).toBe(true);
    });
    
    it('should reject invalid node type', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          { id: 'test', type: 'invalid_type' }
        ]
      };
      
      const valid = validate(graph);
      expect(valid).toBe(false);
      expect(validate.errors.some(e => e.message.includes('enum'))).toBe(true);
    });
    
    it('should validate resource constraints', () => {
      const validGraph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          { id: 'test', type: 'server', resources: ['server', 'build'] }
        ]
      };
      
      const invalidGraph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          { id: 'test', type: 'server', resources: ['invalid_resource'] }
        ]
      };
      
      expect(validate(validGraph)).toBe(true);
      expect(validate(invalidGraph)).toBe(false);
    });
    
    it('should validate retry constraints', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        defaults: {
          retries: {
            max: 5,
            backoff_ms: 2000
          }
        },
        nodes: []
      };
      
      expect(validate(graph)).toBe(true);
      
      // Test max bounds
      graph.defaults.retries.max = 11;
      expect(validate(graph)).toBe(false);
      
      graph.defaults.retries.max = -1;
      expect(validate(graph)).toBe(false);
    });
    
    it('should validate concurrency bounds', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        concurrency: 5,
        nodes: []
      };
      
      expect(validate(graph)).toBe(true);
      
      graph.concurrency = 11;
      expect(validate(graph)).toBe(false);
      
      graph.concurrency = 0;
      expect(validate(graph)).toBe(false);
    });
  });
  
  describe('Node Parameters', () => {
    it('should validate playwright node params', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          {
            id: 'test',
            type: 'playwright',
            params: {
              specs: ['test.spec.ts']
            }
          }
        ]
      };
      
      expect(validate(graph)).toBe(true);
    });
    
    it('should validate lighthouse node params', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          {
            id: 'test',
            type: 'lighthouse',
            params: {
              url: 'http://localhost:3000',
              out: 'lighthouse.json'
            }
          }
        ]
      };
      
      expect(validate(graph)).toBe(true);
    });
    
    it('should validate cvf node params', () => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          {
            id: 'test',
            type: 'cvf',
            params: {
              auv: 'AUV-0001'
            }
          }
        ]
      };
      
      expect(validate(graph)).toBe(true);
      
      // Invalid AUV format
      graph.nodes[0].params.auv = 'INVALID';
      expect(validate(graph)).toBe(false);
    });
  });
});

// Run tests if invoked directly
if (process.argv[1]?.endsWith('graph_schema.test.mjs')) {
  console.log('Running graph schema validation tests...');
  
  // Simple test runner for direct execution
  const schemaPath = path.join(__dirname, '../../orchestration/graph/spec.schema.yaml');
  const schema = yaml.parse(fs.readFileSync(schemaPath, 'utf8'));
  
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  
  // Test demo files
  const demoFiles = [
    'demo-validation.yaml',
    'working-demo.yaml',
    'compiled-demo.yaml'
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const file of demoFiles) {
    const graphPath = path.join(__dirname, '../../orchestration/graph/projects/', file);
    if (fs.existsSync(graphPath)) {
      const graph = yaml.parse(fs.readFileSync(graphPath, 'utf8'));
      const valid = validate(graph);
      
      if (valid) {
        console.log(`✅ ${file} is valid`);
        passed++;
      } else {
        console.log(`❌ ${file} is invalid:`, validate.errors);
        failed++;
      }
    } else {
      console.log(`⚠️ ${file} not found`);
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}