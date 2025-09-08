#!/usr/bin/env node
/**
 * Swarm1 DAG Runner
 *
 * Executes graphs with parallel execution, dependencies, retries, and resume capability.
 * Artifacts-first approach with machine-verifiable outputs.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import yaml from 'yaml';
import Ajv from 'ajv';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load schema for validation
const schemaPath = path.join(__dirname, 'spec.schema.yaml');
const schema = yaml.parse(fs.readFileSync(schemaPath, 'utf8'));

/**
 * Graph Runner Error
 */
export class GraphRunnerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GraphRunnerError';
    this.code = code;
    this.stdout = '';
    this.stderr = '';
    this.exitCode = 0;
  }
}

/**
 * Resource Lock Manager
 * Manages mutually exclusive resource locks for nodes
 */
class ResourceLockManager {
  constructor(lockDir = 'runs/locks') {
    this.lockDir = lockDir;
    this.locks = new Map(); // resource -> Set of node IDs holding it
    this.waiting = new Map(); // resource -> Array of {nodeId, resolve} waiting

    // Ensure lock directory exists
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
  }

  async acquire(nodeId, resources = []) {
    if (!resources.length) return true;

    // Sort resources to prevent deadlocks
    const sortedResources = [...resources].sort();

    for (const resource of sortedResources) {
      await this._acquireOne(nodeId, resource);
    }
    return true;
  }

  async _acquireOne(nodeId, resource) {
    // Check if resource is available
    const holders = this.locks.get(resource) || new Set();

    if (holders.size === 0) {
      // Resource is free, acquire it
      holders.add(nodeId);
      this.locks.set(resource, holders);

      // Write lock file for cross-process safety
      const lockFile = path.join(this.lockDir, `${resource}.lock`);
      fs.writeFileSync(
        lockFile,
        JSON.stringify({
          nodeId,
          acquired: new Date().toISOString(),
        }),
      );
      return;
    }

    // Resource is busy, wait for it
    return new Promise((resolve) => {
      const waitQueue = this.waiting.get(resource) || [];
      waitQueue.push({ nodeId, resolve });
      this.waiting.set(resource, waitQueue);
    });
  }

  release(nodeId, resources = []) {
    for (const resource of resources) {
      const holders = this.locks.get(resource);
      if (holders) {
        holders.delete(nodeId);

        // Clean up lock file
        const lockFile = path.join(this.lockDir, `${resource}.lock`);
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }

        // Wake up next waiter
        const waitQueue = this.waiting.get(resource);
        if (waitQueue && waitQueue.length > 0) {
          const next = waitQueue.shift();
          const newHolders = this.locks.get(resource) || new Set();
          newHolders.add(next.nodeId);
          this.locks.set(resource, newHolders);

          // Write lock file for new holder
          const lockFile = path.join(this.lockDir, `${resource}.lock`);
          fs.writeFileSync(
            lockFile,
            JSON.stringify({
              nodeId: next.nodeId,
              acquired: new Date().toISOString(),
            }),
          );

          next.resolve();
        }
      }
    }
  }

  cleanup() {
    // Release all locks and clean up lock files
    for (const [resource] of this.locks.entries()) {
      const lockFile = path.join(this.lockDir, `${resource}.lock`);
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    }
    this.locks.clear();
    this.waiting.clear();
  }
}

/**
 * Node Executors
 * Implementations for each node type
 */
class NodeExecutors {
  constructor(env = {}, runId = null) {
    this.baseEnv = {
      STAGING_URL: process.env.STAGING_URL || 'http://127.0.0.1:3000',
      API_BASE: process.env.API_BASE || 'http://127.0.0.1:3000/api',
      SWARM_ACTIVE: 'true',
      ...env,
    };
    this.runId = runId;
    // Track a server we started so we can terminate it on graph completion
    this.serverProc = null;
    this.serverStartedByRunner = false;
  }

  async execute(node, runId) {
    const executor = this[node.type];
    if (!executor) {
      throw new GraphRunnerError(`Unknown node type: ${node.type}`, 'UNKNOWN_TYPE');
    }

    // Derive base AUV id (e.g., "AUV-0101") from node params or id
    const auvFromParams = node.params?.auv;
    const auvFromId = (node.id.match(/^AUV-\d{4}/) || [])[0];
    const AUV_ID =
      auvFromParams || auvFromId || (this.baseEnv && /** @type {any} */ (this.baseEnv).AUV_ID);
    const nodeEnv = { ...this.baseEnv, ...node.env, ...(AUV_ID ? { AUV_ID } : {}) };

    // Router preview (read-only for Phase 4)
    if (
      process.env.ROUTER_DRY === 'true' &&
      AUV_ID &&
      ['playwright', 'lighthouse', 'cvf'].includes(node.type)
    ) {
      try {
        const { planTools, loadConfig, deriveCapabilities } = await import('../../mcp/router.mjs');
        const { registry, policies } = loadConfig();

        // Try to load AUV spec for better capability derivation
        let capabilities = [];
        try {
          const auvPath = path.resolve('capabilities', `${AUV_ID}.yaml`);
          if (fs.existsSync(auvPath)) {
            const yaml = await import('yaml');
            const auvSpec = yaml.parse(fs.readFileSync(auvPath, 'utf8'));
            capabilities = deriveCapabilities(auvSpec);
          } else {
            // Fallback to basic capabilities based on node type
            capabilities =
              node.type === 'playwright'
                ? ['browser.automation']
                : node.type === 'lighthouse'
                  ? ['web.perf_audit']
                  : node.type === 'cvf'
                    ? ['browser.automation', 'web.perf_audit']
                    : [];
          }
        } catch (err) {
          // Fallback to basic capabilities
          capabilities =
            node.type === 'playwright'
              ? ['browser.automation']
              : node.type === 'lighthouse'
                ? ['web.perf_audit']
                : node.type === 'cvf'
                  ? ['browser.automation', 'web.perf_audit']
                  : [];
        }

        const routerResult = planTools({
          agentId: 'A1.orchestrator',
          requestedCapabilities: capabilities,
          budgetUsd: 0.25,
          secondaryConsent: false,
          env: nodeEnv,
          registry,
          policies,
        });

        // Write preview
        const previewPath = path.resolve('runs', AUV_ID, `router_preview_${node.type}.json`);
        fs.mkdirSync(path.dirname(previewPath), { recursive: true });
        fs.writeFileSync(previewPath, JSON.stringify(routerResult.decision, null, 2));

        console.log(`[router:preview] ${node.type} decision written to ${previewPath}`);

        // Emit to hooks log and update ledger
        const { appendToHooks, updateLedger } = await import('../../mcp/router.mjs');
        appendToHooks({
          event: 'RouterPreview',
          auv_id: AUV_ID,
          node_type: node.type,
          tool_count: routerResult.toolPlan.length,
          total_cost_usd: routerResult.budget,
        });

        // Update spend ledger
        const sessionId = process.env.SESSION_ID || this.runId;
        updateLedger(sessionId, routerResult.toolPlan);
      } catch (err) {
        console.warn(`[router:preview] Failed for ${node.type}:`, err.message);
      }
    }

    return await executor.call(this, node, nodeEnv, runId);
  }

  async server(node, env) {
    // Check if server is healthy
    const healthUrl = `${env.STAGING_URL}/health`;

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return { status: 'success', message: 'Server already healthy' };
      }
    } catch (e) {
      // Server not running, start it
    }

    // Start server
    const serverPath = path.resolve('mock/server.js');
    const proc = spawn(process.execPath, [serverPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    if (process.platform !== 'win32') {
      try {
        proc.unref();
      } catch {
        /* ignore */
      }
    }
    this.serverProc = proc;
    this.serverStartedByRunner = true;

    // Wait for health
    const maxWait = node.timeout_ms || 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(healthUrl);
        if (response.ok) {
          return { status: 'success', message: 'Server started and healthy' };
        }
      } catch (e) {
        // Keep trying
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new GraphRunnerError('Server startup timeout', 'TIMEOUT');
  }

  async stopServer() {
    // Only stop if we started it
    if (this.serverProc && this.serverStartedByRunner) {
      try {
        if (process.platform !== 'win32' && this.serverProc.pid) {
          // Kill the process group when detached
          try {
            process.kill(-this.serverProc.pid);
          } catch {
            /* ignore */
          }
        }
        // Fallback to direct kill
        try {
          this.serverProc.kill();
        } catch {
          /* ignore */
        }

        // Give the OS a moment to release the port
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.serverProc = null;
    this.serverStartedByRunner = false;
  }

  async playwright(node, env) {
    const specs = node.params?.specs || [];
    if (!specs.length) {
      throw new GraphRunnerError('No specs provided for playwright node', 'INVALID_PARAMS');
    }

    const configPath = 'tests/robot/playwright/playwright.config.ts';
    const args = ['playwright', 'test', '-c', configPath, ...specs];

    return await this._runCommand('npx', args, env, node.timeout_ms || 180000);
  }

  async lighthouse(node, env) {
    const url = node.params?.url?.replace('${STAGING_URL}', env.STAGING_URL);
    const out = node.params?.out;

    if (!url || !out) {
      throw new GraphRunnerError('Missing url or out param for lighthouse node', 'INVALID_PARAMS');
    }

    // Ensure output directory exists
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const scriptPath = 'scripts/perf_lighthouse.mjs';
    return await this._runCommand(
      process.execPath,
      [scriptPath, url, out],
      env,
      node.timeout_ms || 90000,
    );
  }

  async cvf(node, env) {
    const auv = node.params?.auv;
    if (!auv) {
      throw new GraphRunnerError('Missing auv param for cvf node', 'INVALID_PARAMS');
    }

    const scriptPath = 'orchestration/cvf-check.mjs';
    return await this._runCommand(
      process.execPath,
      [scriptPath, auv],
      env,
      node.timeout_ms || 60000,
    );
  }

  async agent_task(node) {
    // Placeholder for future agent task execution
    const agent = node.params?.agent;
    const task = node.params?.task;

    console.log(`[agent_task] ${node.id}: Agent=${agent}, Task=${task}`);

    // Write placeholder result card
    const resultPath = `runs/agents/${node.id}/result.json`;
    const resultDir = path.dirname(resultPath);
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    fs.writeFileSync(
      resultPath,
      JSON.stringify(
        {
          node: node.id,
          agent,
          task,
          status: 'placeholder',
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    return { status: 'success', message: 'Agent task placeholder executed' };
  }

  async package(node, env) {
    // Package generation using PackageBuilder
    const auv = node.params?.auv;
    if (!auv) {
      throw new GraphRunnerError('Missing auv param for package node', 'INVALID_PARAMS');
    }

    console.log(`[package] ${node.id}: Creating package for ${auv}`);

    try {
      const { PackageBuilder } = await import('../package.mjs');
      const builder = new PackageBuilder(auv);
      const manifest = await builder.build();

      console.log(`[package] ✅ Package created: ${manifest.bundle.path}`);
      console.log(`[package]   Size: ${(manifest.bundle.size_bytes / 1024).toFixed(2)} KB`);
      console.log(`[package]   Artifacts: ${manifest.artifacts.length}`);

      return {
        status: 'success',
        message: `Package created: ${manifest.bundle.path}`,
        manifest,
      };
    } catch (error) {
      const err = new GraphRunnerError(
        `Package generation failed: ${error.message}`,
        'PACKAGE_FAILED',
      );
      err.stderr = error.stack || error.message;
      err.exitCode = 401;
      throw err;
    }
  }

  async report(node, env) {
    // Report generation using ReportGenerator
    const auv = node.params?.auv;
    if (!auv) {
      throw new GraphRunnerError('Missing auv param for report node', 'INVALID_PARAMS');
    }

    console.log(`[report] ${node.id}: Generating report for ${auv}`);

    try {
      const { ReportGenerator } = await import('../report.mjs');
      const generator = new ReportGenerator(auv);
      const reportPath = await generator.generate();

      console.log(`[report] ✅ Report generated: ${reportPath}`);

      return {
        status: 'success',
        message: `Report generated: ${reportPath}`,
        reportPath,
      };
    } catch (error) {
      const err = new GraphRunnerError(
        `Report generation failed: ${error.message}`,
        'REPORT_FAILED',
      );
      err.stderr = error.stack || error.message;
      err.exitCode = 402;
      throw err;
    }
  }

  async _runCommand(command, args, env, timeout) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new GraphRunnerError(`Command timeout: ${command} ${args.join(' ')}`, 'TIMEOUT'));
      }, timeout);

      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return;

        if (code === 0) {
          resolve({ status: 'success', stdout, stderr });
        } else {
          const error = new GraphRunnerError(`Command failed with code ${code}`, 'COMMAND_FAILED');
          error.stdout = stdout;
          error.stderr = stderr;
          error.exitCode = code;
          reject(error);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new GraphRunnerError(`Command error: ${err.message}`, 'COMMAND_ERROR'));
      });
    });
  }
}

/**
 * DAG Runner
 */
export class GraphRunner {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 3;
    const gen = () =>
      crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 14);
    this.runId = options.runId || `RUN-${gen()}`;
    this.stateFile = options.stateFile || `runs/graph/${this.runId}/state.json`;
    this.lockManager = new ResourceLockManager();
    this.executors = new NodeExecutors(options.env, this.runId);
    this.state = null;
    this.graph = null;
    this.adjacency = new Map();
    this.indegrees = new Map();
    this.running = new Set();
    this.completed = new Set();
    this.failed = new Set();
  }

  /**
   * Load and validate graph
   */
  async loadGraph(graphPath) {
    if (!fs.existsSync(graphPath)) {
      throw new GraphRunnerError(`Graph file not found: ${graphPath}`, 'FILE_NOT_FOUND');
    }

    const content = fs.readFileSync(graphPath, 'utf8');
    this.graph = yaml.parse(content);

    // Validate against schema
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    if (!validate(this.graph)) {
      const errors = validate.errors.map((e) => `${e.instancePath}: ${e.message}`).join(', ');
      throw new GraphRunnerError(`Invalid graph: ${errors}`, 'INVALID_SCHEMA');
    }

    // Build adjacency and check for cycles
    this._buildAdjacency();
    this._detectCycles();

    return this.graph;
  }

  /**
   * Build adjacency list and indegrees from nodes and edges
   */
  _buildAdjacency() {
    // Initialize
    for (const node of this.graph.nodes) {
      this.adjacency.set(node.id, new Set());
      this.indegrees.set(node.id, 0);
    }

    // Process requires fields
    for (const node of this.graph.nodes) {
      if (node.requires) {
        for (const dep of node.requires) {
          this.adjacency.get(dep).add(node.id);
          this.indegrees.set(node.id, this.indegrees.get(node.id) + 1);
        }
      }
    }

    // Process explicit edges
    if (this.graph.edges) {
      for (const [from, to] of this.graph.edges) {
        if (!this.adjacency.has(from) || !this.adjacency.has(to)) {
          throw new GraphRunnerError(`Invalid edge: ${from} -> ${to}`, 'INVALID_EDGE');
        }
        this.adjacency.get(from).add(to);
        this.indegrees.set(to, this.indegrees.get(to) + 1);
      }
    }
  }

  /**
   * Detect cycles using DFS
   */
  _detectCycles() {
    const visited = new Set();
    const recStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of this.adjacency.get(node)) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of this.graph.nodes) {
      if (!visited.has(node.id) && hasCycle(node.id)) {
        throw new GraphRunnerError('Cycle detected in graph', 'CYCLE_DETECTED');
      }
    }
  }

  /**
   * Load or initialize state
   */
  async loadState(resume = false) {
    const stateDir = path.dirname(this.stateFile);

    if (resume && fs.existsSync(this.stateFile)) {
      // Load existing state
      this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));

      // Restore completed/failed sets
      for (const [nodeId, nodeState] of Object.entries(this.state.nodes)) {
        if (nodeState.status === 'succeeded') {
          this.completed.add(nodeId);
        } else if (nodeState.status === 'failed') {
          this.failed.add(nodeId);
        } else if (nodeState.status === 'running') {
          // Mark running nodes as failed on resume (crashed)
          nodeState.status = 'failed';
          nodeState.error = 'Crashed during previous run';
          this.failed.add(nodeId);
        }
      }
    } else {
      // Initialize new state
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      this.state = {
        run_id: this.runId,
        graph_id: this.graph.project_id,
        started_at: new Date().toISOString(),
        finished_at: null,
        nodes: {},
      };

      // Initialize node states
      for (const node of this.graph.nodes) {
        this.state.nodes[node.id] = {
          status: 'queued',
          attempts: 0,
          started_at: null,
          finished_at: null,
          error: null,
        };
      }
    }

    await this.saveState();
  }

  /**
   * Save state to disk
   */
  async saveState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  /**
   * Emit observability event
   */
  emitEvent(event) {
    const logPath = 'runs/observability/hooks.jsonl';
    const logDir = path.dirname(logPath);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const entry = {
      ts: Date.now() / 1000,
      event: event.type,
      module: 'graph_runner',
      run_id: this.runId,
      ...event,
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  }

  /**
   * Get ready nodes (indegree 0 and not started)
   */
  getReadyNodes() {
    const ready = [];

    for (const node of this.graph.nodes) {
      if (this.completed.has(node.id) || this.failed.has(node.id) || this.running.has(node.id)) {
        continue;
      }

      // Check if all dependencies are completed
      const deps = node.requires || [];
      const allDepsCompleted = deps.every((dep) => this.completed.has(dep));

      if (allDepsCompleted) {
        ready.push(node);
      }
    }

    return ready;
  }

  /**
   * Check if error is transient
   */
  isTransientError(error) {
    if (!error) return false;

    const transientPatterns = [
      /timeout/i,
      /ETIMEDOUT/,
      /ECONNREFUSED/,
      /ECONNRESET/,
      /5\d\d/, // HTTP 5xx
      /browser.*crash/i,
      /Target closed/i,
    ];

    const message = error.message || error.toString();
    return transientPatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Execute a single node
   */
  async executeNode(node) {
    const nodeState = this.state.nodes[node.id];
    const maxRetries = node.retries?.max ?? this.graph.defaults?.retries?.max ?? 1;
    const backoffMs = node.retries?.backoff_ms ?? this.graph.defaults?.retries?.backoff_ms ?? 1000;

    nodeState.status = 'running';
    nodeState.started_at = new Date().toISOString();
    this.running.add(node.id);
    await this.saveState();

    this.emitEvent({
      type: 'NodeStarted',
      node_id: node.id,
      node_type: node.type,
      attempt: nodeState.attempts + 1,
    });

    try {
      // Acquire resources
      await this.lockManager.acquire(node.id, node.resources);

      // Execute
      const startTime = Date.now();
      await this.executors.execute(node, this.runId);
      const duration = Date.now() - startTime;

      // Success
      nodeState.status = 'succeeded';
      nodeState.finished_at = new Date().toISOString();
      nodeState.attempts++;

      this.running.delete(node.id);
      this.completed.add(node.id);

      this.emitEvent({
        type: 'NodeSucceeded',
        node_id: node.id,
        node_type: node.type,
        duration_ms: duration,
        attempts: nodeState.attempts,
      });
    } catch (error) {
      nodeState.attempts++;

      // Check if we should retry
      if (nodeState.attempts < maxRetries && this.isTransientError(error)) {
        // Retry with backoff
        nodeState.status = 'queued';
        nodeState.error = `Transient error (attempt ${nodeState.attempts}): ${error.message}`;

        this.emitEvent({
          type: 'NodeRetry',
          node_id: node.id,
          node_type: node.type,
          attempt: nodeState.attempts,
          error: error.message,
        });

        // Exponential backoff
        const delay = Math.min(backoffMs * Math.pow(2, nodeState.attempts - 1), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        this.running.delete(node.id);
      } else {
        // Permanent failure
        nodeState.status = 'failed';
        nodeState.finished_at = new Date().toISOString();
        nodeState.error = error.message;

        this.running.delete(node.id);
        this.failed.add(node.id);

        this.emitEvent({
          type: 'NodeFailed',
          node_id: node.id,
          node_type: node.type,
          attempts: nodeState.attempts,
          error: error.message,
        });
      }
    } finally {
      // Release resources
      this.lockManager.release(node.id, node.resources);
      await this.saveState();
    }
  }

  /**
   * Run the graph
   */
  async run(resume = false) {
    await this.loadState(resume);

    this.emitEvent({
      type: 'GraphStart',
      graph_id: this.graph.project_id,
      node_count: this.graph.nodes.length,
      resume,
    });

    const startTime = Date.now();

    try {
      // Main execution loop
      while (this.completed.size + this.failed.size < this.graph.nodes.length) {
        // Get ready nodes
        const ready = this.getReadyNodes();

        // Start nodes up to concurrency limit
        const toStart = ready.slice(0, this.graph.concurrency - this.running.size);

        if (toStart.length === 0 && this.running.size === 0) {
          // No nodes can progress
          if (this.failed.size > 0) {
            break; // Graph failed
          }
          // This shouldn't happen if graph is valid
          throw new GraphRunnerError('Graph deadlock detected', 'DEADLOCK');
        }

        // Start nodes
        const promises = toStart.map((node) => this.executeNode(node));

        // Wait for at least one to complete
        if (promises.length > 0) {
          await Promise.race(promises);
        } else if (this.running.size > 0) {
          // Wait a bit for running nodes
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Finalize
      const duration = Date.now() - startTime;
      this.state.finished_at = new Date().toISOString();
      await this.saveState();

      const success = this.failed.size === 0;

      this.emitEvent({
        type: success ? 'GraphSucceeded' : 'GraphFailed',
        graph_id: this.graph.project_id,
        duration_ms: duration,
        completed: this.completed.size,
        failed: this.failed.size,
      });

      return {
        success,
        runId: this.runId,
        duration,
        completed: Array.from(this.completed),
        failed: Array.from(this.failed),
        stateFile: this.stateFile,
      };
    } catch (error) {
      this.emitEvent({
        type: 'GraphError',
        graph_id: this.graph.project_id,
        error: error.message,
      });
      throw error;
    } finally {
      this.lockManager.cleanup();
      // Ensure any server we started is terminated to avoid orphaned processes
      if (typeof this.executors.stopServer === 'function') {
        await this.executors.stopServer();
      }
    }
  }
}

// CLI execution
if (
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) ||
  process.argv[1]?.endsWith('runner.mjs')
) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node runner.mjs <graph.yaml> [--resume <RUN-ID>] [--concurrency N]');
    process.exit(1);
  }

  const graphPath = args[0];
  const resumeIdx = args.indexOf('--resume');
  const resumeId = resumeIdx > -1 ? args[resumeIdx + 1] : null;

  const concurrencyIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyIdx > -1 ? parseInt(args[concurrencyIdx + 1]) : 3;

  const runner = new GraphRunner({
    concurrency,
    runId: resumeId,
  });

  try {
    await runner.loadGraph(graphPath);
    const result = await runner.run(!!resumeId);

    console.log('\n📊 Graph execution complete:');
    console.log(`  Run ID: ${result.runId}`);
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`  Completed: ${result.completed.length}`);
    console.log(`  Failed: ${result.failed.length}`);
    console.log(`  State: ${result.stateFile}`);

    process.exit(result.success ? 0 : 204);
  } catch (error) {
    console.error(`\n❌ Graph execution error: ${error.message}`);
    process.exit(error.code === 'CYCLE_DETECTED' ? 203 : 202);
  }
}
