# Retrieval (Knowledge Index)

Build the index:

```bash
node orchestration/cli.mjs knowledge build-index
```

Query in code via `orchestration/lib/knowledge_retriever.mjs`:

```js
import { retrieveByTags } from 'orchestration/lib/knowledge_retriever.mjs';
const items = retrieveByTags(['browser.automation']);
```

Artifacts:

- Index: `reports/knowledge/index.json`
- Tags from path and heuristics; deterministic and versioned by file hashes.
