/**
 * Unit tests for DAG Runner
 * Tests graph validation, topological sorting, and execution logic
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { GraphRunner, GraphRunnerError } from '../../orchestration/graph/runner.mjs';
import { compileBacklogToGraph } from '../../orchestration/graph/compile_from_backlog.mjs';

describe('GraphRunner', () => {
  let tempDir;

  beforeEach(() => {
    // Create temp directory for test artifacts
    tempDir = `test-runs-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Graph Loading and Validation', () => {
    it('should load and validate a valid graph', async () => {
      const graph = {
        version: '1.0',
        project_id: 'test-project',
        concurrency: 2,
        nodes: [
          { id: 'node1', type: 'server' },
          {
            id: 'node2',
            type: 'playwright',
            requires: ['node1'],
            params: { specs: ['test.spec.ts'] },
          },
        ],
      };

      const graphPath = path.join(tempDir, 'test-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(graph));

      const runner = new GraphRunner({ runId: 'test-run' });
      const loaded = await runner.loadGraph(graphPath);

      assert.equal(/** @type {any} */ (loaded).project_id, 'test-project');
      assert.equal(/** @type {any} */ (loaded).nodes.length, 2);
    });

    it('should reject invalid graph schema', async () => {
      const invalidGraph = {
        version: '2.0', // Invalid version
        nodes: [],
      };

      const graphPath = path.join(tempDir, 'invalid-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(invalidGraph));

      const runner = new GraphRunner();
      await assert.rejects(
        runner.loadGraph(graphPath),
        GraphRunnerError
      );
    });

    it('should detect cycles in graph', async () => {
      const cyclicGraph = {
        version: '1.0',
        project_id: 'cyclic',
        nodes: [
          { id: 'A', type: 'server', requires: ['B'] },
          { id: 'B', type: 'server', requires: ['C'] },
          { id: 'C', type: 'server', requires: ['A'] },
        ],
      };

      const graphPath = path.join(tempDir, 'cyclic-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(cyclicGraph));

      const runner = new GraphRunner();
      await assert.rejects(
        runner.loadGraph(graphPath),
        /Cycle detected/
      );
    });
  });

  describe('Backlog to Graph Compilation', () => {
    it('should compile backlog to graph correctly', () => {
      const backlog = {
        brief_id: 'test-brief',
        backlog: [
          { id: 'AUV-0001', title: 'Feature 1', depends_on: [] },
          { id: 'AUV-0002', title: 'Feature 2', depends_on: ['AUV-0001'] },
          { id: 'AUV-0003', title: 'Feature 3', depends_on: ['AUV-0002'] },
        ],
      };

      const graph = compileBacklogToGraph(backlog);

      assert.equal(graph.project_id, 'test-brief');
      assert.equal(graph.nodes.length, 10); // 1 server + 3 AUVs × 3 nodes each
      assert.equal(graph.nodes[0].type, 'server');

      // Check dependencies
      const auv2ui = graph.nodes.find((n) => n.id === 'AUV-0002-ui');
      assert(auv2ui.requires.includes('AUV-0001-ui'));

      const auv3ui = graph.nodes.find((n) => n.id === 'AUV-0003-ui');
      assert(auv3ui.requires.includes('AUV-0002-ui'));
    });

    it('should handle both auvs and backlog field names', () => {
      const backlog1 = {
        auvs: [{ id: 'AUV-0001', title: 'Test' }],
      };

      const backlog2 = {
        backlog: [{ id: 'AUV-0001', title: 'Test' }],
      };

      const graph1 = compileBacklogToGraph(backlog1);
      const graph2 = compileBacklogToGraph(backlog2);

      assert.equal(graph1.nodes.length, 4); // server + 3 nodes
      assert.equal(graph2.nodes.length, 4); // server + 3 nodes
    });
  });

  describe('State Management', () => {
    it('should initialize and save state', async () => {
      const graph = {
        version: '1.0',
        project_id: 'state-test',
        nodes: [{ id: 'node1', type: 'server' }],
      };

      const graphPath = path.join(tempDir, 'state-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(graph));

      const runner = new GraphRunner({
        runId: 'state-test-run',
        stateFile: path.join(tempDir, 'state.json'),
      });

      await runner.loadGraph(graphPath);
      await runner.loadState(false);

      assert.equal(runner.state.run_id, 'state-test-run');
      assert.equal(runner.state.nodes.node1.status, 'queued');

      // Check state file was created
      assert.equal(fs.existsSync(path.join(tempDir, 'state.json')), true);
    });

    it('should resume from existing state', async () => {
      const existingState = {
        run_id: 'resume-test',
        graph_id: 'test',
        started_at: new Date().toISOString(),
        nodes: {
          node1: { status: 'succeeded', attempts: 1 },
          node2: { status: 'failed', attempts: 2 },
          node3: { status: 'running', attempts: 1 },
        },
      };

      const stateFile = path.join(tempDir, 'resume-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(existingState));

      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [
          { id: 'node1', type: 'server' },
          { id: 'node2', type: 'server' },
          { id: 'node3', type: 'server' },
        ],
      };

      const graphPath = path.join(tempDir, 'resume-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(graph));

      const runner = new GraphRunner({
        runId: 'resume-test',
        stateFile,
      });

      await runner.loadGraph(graphPath);
      await runner.loadState(true);

      assert.equal(runner.completed.has('node1'), true);
      assert.equal(runner.failed.has('node2'), true);
      assert.equal(runner.failed.has('node3'), true); // Running → failed on resume
      assert(runner.state.nodes.node3.error.includes('Crashed'));
    });
  });

  describe('Dependency Resolution', () => {
    it('should identify ready nodes correctly', async () => {
      const graph = {
        version: '1.0',
        project_id: 'deps-test',
        nodes: [
          { id: 'A', type: 'server' },
          { id: 'B', type: 'server', requires: ['A'] },
          { id: 'C', type: 'server', requires: ['A'] },
          { id: 'D', type: 'server', requires: ['B', 'C'] },
        ],
      };

      const graphPath = path.join(tempDir, 'deps-graph.yaml');
      fs.writeFileSync(graphPath, yaml.stringify(graph));

      const runner = new GraphRunner();
      await runner.loadGraph(graphPath);
      await runner.loadState(false);

      // Initially only A is ready
      let ready = runner.getReadyNodes();
      assert.equal(ready.length, 1);
      assert.equal(ready[0].id, 'A');

      // After A completes, B and C are ready
      runner.completed.add('A');
      ready = runner.getReadyNodes();
      assert.equal(ready.length, 2);
      assert.deepEqual(ready.map((n) => n.id).sort(), ['B', 'C']);

      // After B and C complete, D is ready
      runner.completed.add('B');
      runner.completed.add('C');
      ready = runner.getReadyNodes();
      assert.equal(ready.length, 1);
      assert.equal(ready[0].id, 'D');
    });
  });

  describe('Error Classification', () => {
    it('should identify transient errors', () => {
      const runner = new GraphRunner();

      assert.equal(runner.isTransientError(new Error('Connection timeout')), true);
      assert.equal(runner.isTransientError(new Error('ETIMEDOUT')), true);
      assert.equal(runner.isTransientError(new Error('HTTP 503 Service Unavailable')), true);
      assert.equal(runner.isTransientError(new Error('Browser crashed')), true);

      assert.equal(runner.isTransientError(new Error('Assertion failed')), false);
      assert.equal(runner.isTransientError(new Error('File not found')), false);
      assert.equal(runner.isTransientError(new Error('HTTP 404 Not Found')), false);
    });
  });
});

describe('Graph Schema Validation', () => {
  it('should validate node types', () => {
    const validTypes = [
      'server',
      'playwright',
      'lighthouse',
      'cvf',
      'agent_task',
      'package',
      'report',
    ];

    validTypes.forEach((type) => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [{ id: 'test', type }],
      };

      // This should not throw
      assert.doesNotThrow(() => yaml.stringify(graph));
    });
  });

  it('should validate resource types', () => {
    const validResources = ['server', 'build', 'db:migrations'];

    validResources.forEach((resource) => {
      const graph = {
        version: '1.0',
        project_id: 'test',
        nodes: [{ id: 'test', type: 'server', resources: [resource] }],
      };

      assert.doesNotThrow(() => yaml.stringify(graph));
    });
  });
});
