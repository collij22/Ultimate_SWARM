import { loadKnowledgeIndex } from './knowledge_indexer.mjs';

export function retrieveByTags(tags = [], { indexFile = 'reports/knowledge/index.json' } = {}) {
  const index = loadKnowledgeIndex(indexFile);
  if (!tags || tags.length === 0) return index.items;
  const required = new Set(tags);
  return index.items.filter((it) => {
    const itemTags = new Set(it.tags || []);
    for (const t of required) {
      if (!itemTags.has(t)) return false;
    }
    return true;
  });
}
