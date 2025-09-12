#!/usr/bin/env node
/**
 * Graph Normalizer — prereq autowiring and param normalization
 * Writes diff to runs/diagnostics/graph-normalized.diff
 */
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const CANONICAL_CHAINS = [
  ['data.ingest', 'data.insights', 'chart.render'],
  ['audio.tts', 'video.compose'],
  ['web.search', 'seo.audit', 'doc.generate'],
  ['youtube.transcript', 'nlp.extract', 'nlp.summarize', 'doc.generate'],
  ['ocr.extract', 'nlp.extract', 'doc.generate'],
  ['rss.fetch', 'nlp.summarize'],
  ['audio.transcribe', 'nlp.extract', 'nlp.summarize'],
];

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function ensureArray(x) {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

export function normalizeGraph(graph) {
  const original = deepClone(graph);

  // Map node id → node
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));

  // Prereq autowiring for canonical chains
  for (const chain of CANONICAL_CHAINS) {
    for (const node of graph.nodes) {
      if (node.type !== 'agent_task') continue;
      const cap = node.params?.capability;
      const idx = chain.indexOf(cap);
      if (idx <= 0) continue; // either not in chain or first element

      // Ensure previous capability exists as a node and is wired
      const prevCap = chain[idx - 1];
      const prevId = `${prevCap.replace(/\./g, '_')}-${node.id}`;
      if (!idToNode.has(prevId)) {
        const newNode = {
          id: prevId,
          type: 'agent_task',
          params: { capability: prevCap },
        };
        graph.nodes.push(newNode);
        idToNode.set(prevId, newNode);
      }
      node.requires = Array.from(new Set([...(node.requires || []), prevId]));
    }
  }

  // Param normalization: coerce simple string input to object { path: str } for data.ingest
  for (const node of graph.nodes) {
    if (node.type !== 'agent_task') continue;
    const cap = node.params?.capability;
    if (cap === 'data.ingest') {
      const input = node.params?.input;
      if (typeof input === 'string') {
        node.params.input = { path: input };
      }
    }
    if (cap === 'doc.generate' && typeof node.params?.template === 'string') {
      node.params.input = node.params.input || {};
      node.params.input.template = node.params.template;
      if (node.params.format) node.params.input.format = node.params.format;
      delete node.params.template;
      delete node.params.format;
    }
    if (cap === 'chart.render' && Array.isArray(node.params?.charts)) {
      node.params.input = node.params.input || {};
      node.params.input.charts = node.params.charts;
      delete node.params.charts;
    }
    if (cap === 'nlp.summarize' && typeof node.params?.content === 'string') {
      node.params.input = node.params.input || {};
      node.params.input.content = node.params.content;
      if (node.params.max_sentences) node.params.input.max_sentences = node.params.max_sentences;
      delete node.params.content;
      delete node.params.max_sentences;
    }
  }

  return { normalized: graph, changed: JSON.stringify(graph) !== JSON.stringify(original) };
}

export function writeDiff(before, after) {
  const outDir = path.join(process.cwd(), 'runs', 'diagnostics');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'graph-normalized.diff');
  const content = `--- before\n${yaml.stringify(before)}\n+++ after\n${yaml.stringify(after)}`;
  fs.writeFileSync(outPath, content);
  return outPath;
}

// CLI
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) || process.argv[1]?.endsWith('graph_normalizer.mjs')) {
  const graphPath = process.argv[2];
  const shouldFix = process.argv.includes('--fix');
  if (!graphPath) {
    console.error('Usage: node orchestration/lib/graph_normalizer.mjs <graph.yaml> [--fix]');
    process.exit(2);
  }

  const raw = fs.readFileSync(graphPath, 'utf8');
  const graph = yaml.parse(raw);
  const before = deepClone(graph);
  const { normalized, changed } = normalizeGraph(graph);

  const diffPath = writeDiff(before, normalized);
  console.log(`Graph normalization diff written to: ${diffPath}`);

  if (changed && shouldFix) {
    fs.writeFileSync(graphPath, yaml.stringify(normalized));
    console.log('Applied normalization to graph file');
    process.exit(0);
  }

  if (changed && !shouldFix) {
    console.error('Normalization required but not applied. Run with --fix to persist.');
    process.exit(502);
  }

  console.log('No normalization needed');
  process.exit(0);
}


