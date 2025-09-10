import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tenantPath } from './tenant.mjs';

export async function runWebSearchFetch({ query, tenant = 'default', outDir = 'websearch' }) {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
  const TEST_MODE = process.env.TEST_MODE === 'true';
  
  const baseOut = tenantPath(tenant, `${outDir}/`);
  mkdirSync(baseOut, { recursive: true });
  
  // Use fixture fallback in TEST_MODE or when API key is missing
  if (!BRAVE_API_KEY || TEST_MODE) {
    console.log('[web_search_fetch] TEST_MODE or no API key: Using fixture fallback');
    
    // Read mock HTML from fixture
    const fixturePath = resolve('tests/fixtures/mock-seo-page.html');
    let mockHtml = '<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Test</h1></body></html>';
    
    if (existsSync(fixturePath)) {
      mockHtml = readFileSync(fixturePath, 'utf-8');
    }
    
    // Create mock search results
    const mockData = {
      web: {
        results: [{
          title: 'Example Company - Leading Provider of Quality Products | Home',
          url: 'https://example.com/',
          description: 'Discover our wide range of electronics, furniture, and office supplies. Mock result for TEST_MODE.',
          snippet: 'Example Company provides quality products...'
        }]
      },
      query: {
        original: query
      }
    };
    
    // Write mock outputs to expected locations
    const searchPath = join(baseOut, 'brave_search.json');
    writeFileSync(searchPath, JSON.stringify(mockData, null, 2));
    
    const htmlPath = join(baseOut, 'first_result.html');
    writeFileSync(htmlPath, mockHtml);
    
    const snippetPath = join(baseOut, 'first_result_snippet.txt');
    const snippet = mockHtml.replace(/\s+/g, ' ').slice(0, 500);
    writeFileSync(snippetPath, `${mockData.web.results[0].title}\n${mockData.web.results[0].url}\n\n${snippet}\n`);
    
    const summaryPath = join(baseOut, 'summary.json');
    writeFileSync(summaryPath, JSON.stringify({
      query,
      first_result_url: mockData.web.results[0].url,
      first_result_title: mockData.web.results[0].title,
      test_mode: true,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`[web_search_fetch] ✅ ${mockData.web.results[0].title} -> ${mockData.web.results[0].url}`);
    
    return { ok: true, test_mode: true };
  }

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
  /** @type {any} */
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
