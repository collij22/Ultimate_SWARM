#!/usr/bin/env node
/**
 * Demo: Brave Search + Fetch → tangible artifacts
 * - Uses BRAVE_API_KEY from environment (primary web.search)
 * - Queries Brave, saves JSON
 * - Fetches first result URL, saves HTML and a text snippet
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const TEST_MODE = process.env.TEST_MODE === 'true';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'ref-tools mcp server github';

  if (!BRAVE_API_KEY) {
    console.error('Missing BRAVE_API_KEY in environment.');
    process.exit(2);
  }

  if (!TEST_MODE) {
    // Safety parity with policies (web.search typically requires test mode)
    console.warn('TEST_MODE is not set to true; proceeding anyway for demo.');
  }

  const outDir = 'runs/websearch_demo';
  mkdirSync(outDir, { recursive: true });

  // 1) Brave Search
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '3');

  const res = await fetch(url, {
    headers: {
      'X-Subscription-Token': BRAVE_API_KEY,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Brave Search failed: ${res.status} ${res.statusText} -> ${text}`);
    process.exit(1);
  }

  /** @type {any} */
  const data = await res.json();
  const searchPath = join(outDir, 'brave_search.json');
  writeFileSync(searchPath, JSON.stringify(data, null, 2));

  const first = data?.web?.results?.[0];
  if (!first?.url) {
    console.error('No results returned from Brave Search.');
    process.exit(3);
  }

  // 2) Fetch first result
  const page = await fetch(first.url, { headers: { 'User-Agent': 'Swarm1-Demo/1.0' } });
  if (!page.ok) {
    console.error(`Fetch failed for ${first.url}: ${page.status} ${page.statusText}`);
    process.exit(4);
  }
  const html = await page.text();

  const htmlPath = join(outDir, 'first_result.html');
  writeFileSync(htmlPath, html);

  // crude snippet (first 500 chars, stripped)
  const snippet = html.replace(/\s+/g, ' ').slice(0, 500);
  const snippetPath = join(outDir, 'first_result_snippet.txt');
  writeFileSync(snippetPath, `${first.title || ''}\n${first.url}\n\n${snippet}\n`);

  // Summary
  const summary = {
    query,
    selected: {
      title: first.title,
      url: first.url,
    },
    artifacts: {
      search_json: searchPath,
      html: htmlPath,
      snippet: snippetPath,
    },
  };
  const summaryPath = join(outDir, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n✅ Demo complete');
  console.log(`Query: ${query}`);
  console.log(`Title: ${first.title}`);
  console.log(`URL:   ${first.url}`);
  console.log(
    `Artifacts:\n  - ${summaryPath}\n  - ${searchPath}\n  - ${htmlPath}\n  - ${snippetPath}`,
  );
}

main().catch((err) => {
  console.error('Demo error:', err.message);
  process.exit(1);
});
