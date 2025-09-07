#!/usr/bin/env node
/**
 * Swarm1 Backlog to Graph Compiler
 *
 * Transforms capabilities/backlog.yaml into an executable DAG graph
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compile backlog to graph
 */
export function compileBacklogToGraph(backlog, options = {}) {
  const { projectId = backlog.brief_id || 'compiled', concurrency = 3 } = options;

  // Handle both 'auvs' and 'backlog' field names
  const auvList = backlog.auvs || backlog.backlog || [];

  const graph = {
    version: '1.0',
    project_id: projectId,
    concurrency: Math.min(concurrency, auvList.length || 3),
    defaults: {
      retries: {
        max: 1,
        backoff_ms: 1000,
      },
      timeout_ms: 180000,
    },
    nodes: [],
    edges: [],
  };

  // Add server node
  graph.nodes.push({
    id: 'server',
    type: 'server',
    timeout_ms: 15000,
    resources: ['server'],
  });

  // Process each AUV
  const auvMap = new Map();

  for (const auv of auvList) {
    const auvId = auv.id;
    auvMap.set(auvId, auv);

    // UI node
    const uiNode = {
      id: `${auvId}-ui`,
      type: 'playwright',
      requires: ['server'],
      params: {
        specs: [`tests/robot/playwright/${auvId.toLowerCase()}.spec.ts`],
      },
    };

    // Add AUV dependencies (handle both 'dependencies' and 'depends_on' fields)
    const deps = auv.dependencies || auv.depends_on || [];
    if (deps.length > 0) {
      for (const dep of deps) {
        // Depend on the UI completion of the dependency
        uiNode.requires.push(`${dep}-ui`);
      }
    }

    graph.nodes.push(uiNode);

    // Performance node
    const perfNode = {
      id: `${auvId}-perf`,
      type: 'lighthouse',
      requires: [`${auvId}-ui`],
      params: {
        url: '${STAGING_URL}' + _getPageForAuv(auv),
        out: `runs/${auvId}/perf/lighthouse.json`,
      },
    };

    graph.nodes.push(perfNode);

    // CVF node
    const cvfNode = {
      id: `${auvId}-cvf`,
      type: 'cvf',
      requires: [`${auvId}-perf`],
      params: {
        auv: auvId,
      },
    };

    graph.nodes.push(cvfNode);

    // Add edges (explicit for clarity, though requires field is sufficient)
    graph.edges.push(['server', `${auvId}-ui`]);
    graph.edges.push([`${auvId}-ui`, `${auvId}-perf`]);
    graph.edges.push([`${auvId}-perf`, `${auvId}-cvf`]);

    // Add dependency edges (handle both 'dependencies' and 'depends_on' fields)
    const dependencies = auv.dependencies || auv.depends_on || [];
    if (dependencies.length > 0) {
      for (const dep of dependencies) {
        graph.edges.push([`${dep}-ui`, `${auvId}-ui`]);
      }
    }
  }

  return graph;
}

/**
 * Infer page URL from AUV title/id
 */
function _getPageForAuv(auv) {
  const title = (auv.title || '').toLowerCase();

  if (title.includes('product') || title.includes('catalog') || title.includes('list')) {
    return '/products.html';
  }
  if (title.includes('cart')) {
    return '/cart.html';
  }
  if (title.includes('checkout') || title.includes('payment')) {
    return '/checkout.html';
  }
  if (title.includes('search') || title.includes('filter')) {
    return '/products.html';
  }
  if (title.includes('home') || title.includes('landing')) {
    return '/index.html';
  }

  // Default
  return '/products.html';
}

/**
 * Load backlog from file
 */
export async function loadBacklog(backlogPath) {
  if (!fs.existsSync(backlogPath)) {
    throw new Error(`Backlog file not found: ${backlogPath}`);
  }

  const content = fs.readFileSync(backlogPath, 'utf8');
  return yaml.parse(content);
}

/**
 * Save graph to file
 */
export async function saveGraph(graph, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const yamlContent = yaml.stringify(graph, {
    lineWidth: 120,
    nullStr: '',
  });

  fs.writeFileSync(outputPath, yamlContent);
  return outputPath;
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      'Usage: node compile_from_backlog.mjs <backlog.yaml> [-o output.yaml] [--concurrency N]',
    );
    process.exit(1);
  }

  const backlogPath = args[0];
  const outputIdx = args.indexOf('-o');
  const outputPath =
    outputIdx > -1
      ? args[outputIdx + 1]
      : `orchestration/graph/projects/${path.basename(backlogPath, '.yaml')}.graph.yaml`;

  const concurrencyIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyIdx > -1 ? parseInt(args[concurrencyIdx + 1]) : 3;

  try {
    console.log(`[compiler] Loading backlog from: ${backlogPath}`);
    const backlog = await loadBacklog(backlogPath);

    const auvList = backlog.auvs || backlog.backlog || [];
    console.log(`[compiler] Compiling graph for ${auvList.length} AUVs`);
    const graph = compileBacklogToGraph(backlog, {
      projectId: backlog.brief_id || path.basename(backlogPath, '.yaml'),
      concurrency,
    });

    console.log(`[compiler] Writing graph to: ${outputPath}`);
    await saveGraph(graph, outputPath);

    // Summary
    console.log('\n✅ Graph compilation complete:');
    console.log(`  Project ID: ${graph.project_id}`);
    console.log(`  Nodes: ${graph.nodes.length}`);
    console.log(`  Edges: ${graph.edges.length}`);
    console.log(`  Concurrency: ${graph.concurrency}`);
    console.log(`  Output: ${outputPath}`);

    // Show execution order
    if (auvList.length > 0) {
      console.log('\nExecution chains:');
      for (const auv of auvList) {
        console.log(`  ${auv.id}: ui → perf → cvf`);
      }
    }

    console.log(`\nNext step: node orchestration/graph/runner.mjs ${outputPath}`);
  } catch (error) {
    console.error(`❌ Compilation error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) ||
  process.argv[1]?.endsWith('compile_from_backlog.mjs')
) {
  main();
}

export default { compileBacklogToGraph, loadBacklog, saveGraph };
