# Web Crawl (Secondary) - Firecrawl Capability

## Overview

The `web.crawl` capability with Secondary tool (firecrawl) enables large-scale website crawling beyond Primary tool limits.

## When to Use Secondary

- When crawling > 100 pages
- When depth > 2 levels
- When comprehensive site analysis needed
- When rate limiting is required for large sites

## Requirements

- `TEST_MODE=true` for all executions
- Secondary consent required (`secondary_consent: true`)
- FIRECRAWL_API_KEY environment variable (live mode only)
- Budget allocation (typically $0.10 per run)

## Input Specification

```yaml
capability: web.crawl
hints:
  crawl:
    max_pages: 500 # Triggers Secondary selection
    depth: 3
input:
  url: 'https://example.com'
  max_pages: 500
  depth: 3
  rate_limit: 10 # Requests per second
  robots: true # Respect robots.txt
  follow_redirects: true
```

## Expected Artifacts

- `runs/crawl_demo/urls.json` - Array of discovered URLs
- `runs/crawl_demo/graph.json` - Link graph structure
- `runs/crawl_demo/log.txt` - Crawl execution log

## TEST_MODE Behavior

In TEST_MODE, generates deterministic fixture data:

- Creates synthetic URL list based on max_pages
- Builds simple graph structure
- No actual network requests

## Validation

CVF checks for:

- Valid JSON in urls.json (array format)
- Graph structure with nodes and edges
- URL count matching expectations

## Common Patterns

```javascript
// In tool_request
{
  capability: 'web.crawl',
  purpose: 'Comprehensive site audit for SEO analysis',
  input_spec: {
    url: 'http://127.0.0.1:3000',
    max_pages: 500,
    depth: 3
  },
  constraints: {
    test_mode: true,
    max_cost_usd: 0.10,
    secondary_consent: true
  },
  expected_artifacts: [
    'runs/crawl_demo/urls.json',
    'runs/crawl_demo/graph.json'
  ]
}
```

## Integration with SEO Audit

Crawl results feed into SEO audit:

1. Execute web.crawl to discover pages
2. Pass urls.json to seo.audit capability
3. Generate comprehensive SEO report

## Safety Considerations

- Always use TEST_MODE for development
- Never crawl production sites without permission
- Respect rate limits and robots.txt
- Monitor costs for large crawls
