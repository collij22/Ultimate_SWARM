import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function listFilesRecursive(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function detectTags(filePath, content) {
  const tags = new Set();
  const rel = filePath.replace(/\\/g, '/');
  // Tags from path
  if (rel.includes('/capabilities/')) tags.add('capability');
  if (rel.includes('/patterns/')) tags.add('pattern');
  if (rel.includes('/graphs/')) tags.add('graph');
  if (rel.includes('/ci/')) tags.add('ci');

  // Heuristic capability tags
  const capabilityHints = [
    'browser.automation',
    'api.test',
    'visual.regression',
    'web.perf_audit',
    'security.scan',
    'security.secrets',
    'typecheck',
    'lint',
    'code.codemod',
  ];
  for (const cap of capabilityHints) {
    if (rel.includes(cap) || content.includes(cap)) tags.add(cap);
  }

  return [...tags];
}

export function buildKnowledgeIndex({
  knowledgeRoot = '.claude/knowledge',
  outFile = 'reports/knowledge/index.json',
} = {}) {
  const absRoot = path.join(projectRoot, knowledgeRoot);
  const files = listFilesRecursive(absRoot)
    .filter((p) => /\.(md|markdown|ya?ml|json|mjs|ts)$/i.test(p))
    .sort();

  const items = files.map((absPath) => {
    const rel = path.relative(projectRoot, absPath).replace(/\\/g, '/');
    const text = fs.readFileSync(absPath, 'utf8');
    const hash = sha256(text);
    const tags = detectTags(rel, text);
    return {
      id: randomUUID(),
      path: rel,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: hash,
      tags,
    };
  });

  const index = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    root: knowledgeRoot,
    count: items.length,
    items,
  };

  const outPath = path.join(projectRoot, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  return outPath;
}

export function loadKnowledgeIndex(indexFile = 'reports/knowledge/index.json') {
  const abs = path.join(projectRoot, indexFile);
  if (!fs.existsSync(abs))
    return { version: '1.0', generated_at: null, root: null, count: 0, items: [] };
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}
