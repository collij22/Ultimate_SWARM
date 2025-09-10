import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tenantPath } from './tenant.mjs';

export async function runWebSearchFetch({ query, tenant = 'default', outDir = 'websearch' }) {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
  if (!BRAVE_API_KEY) {
    throw new Error('Missing BRAVE_API_KEY');
  }

  const baseOut = tenantPath(tenant, `${outDir}/`);
  mkdirSync(baseOut, { recursive: true });

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
    throw new Error(`Brave Search failed: ${res.status} ${res.statusText} -> ${text}`);
  }
  const data = await res.json();
  const first = data?.web?.results?.[0];
  if (!first?.url) {
    throw new Error('No results from Brave Search');
  }

  const searchPath = join(baseOut, 'brave_search.json');
  writeFileSync(searchPath, JSON.stringify(data, null, 2));

  const page = await fetch(first.url, { headers: { 'User-Agent': 'Swarm1/1.0' } });
  if (!page.ok) {
    throw new Error(`Fetch failed: ${page.status} ${page.statusText}`);
  }
  const html = await page.text();
  const htmlPath = join(baseOut, 'first_result.html');
  writeFileSync(htmlPath, html);

  const snippetPath = join(baseOut, 'first_result_snippet.txt');
  const snippet = html.replace(/\s+/g, ' ').slice(0, 500);
  writeFileSync(snippetPath, `${first.title || ''}\n${first.url}\n\n${snippet}\n`);

  const summaryPath = join(baseOut, 'summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        query,
        selected: { title: first.title, url: first.url },
        artifacts: { search_json: searchPath, html: htmlPath, snippet: snippetPath },
      },
      null,
      2,
    ),
  );

  return { query, title: first.title, url: first.url, outDir: baseOut };
}
