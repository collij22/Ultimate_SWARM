# Swarm1 Reporting System (Phase 14 Enhanced)

## Overview

The Swarm1 reporting system generates comprehensive HTML reports from package manifests, enhanced in Phase 14 with reference visuals, intent comparison, and rich offline-first presentation.

## Features

### Core Features (Pre-Phase 14)

- Package manifest visualization
- CVF status and performance metrics
- Security scan results
- Visual regression results
- Artifacts browser
- Subagent narrative (Phase 10b)
- Domain-specific sections (data, charts, SEO, media, DB)

### Phase 14 Enhancements

- **Reference Visuals Browser**: Display ingested reference images/videos
- **Intent Comparison**: Advisory side-by-side comparison of UI vs references
- **Spend Summary**: MCP tool usage costs (Primary vs Secondary)
- **Offline-First Theme**: Dark/light modes with embedded assets
- **Responsive Design**: Mobile-friendly with print optimization

## Usage

### Basic Report Generation

```bash
# Generate standard report
node orchestration/cli.mjs report AUV-0005

# Or via orchestration/report.mjs directly
node orchestration/report.mjs AUV-0005
```

### Phase 14 Enhanced Reports

```bash
# Include reference visuals and intent comparison
node orchestration/cli.mjs report AUV-0005 \
  --include-references \
  --references-brief briefs/demo-01/references/references.json \
  --intent-compare \
  --theme light \
  --embed-small-assets-kb 128 \
  --strict-references \
  --spend-source auto
```

### Reference Ingestion

```bash
# Ingest references from brief
node orchestration/cli.mjs ingest-references AUV-0005 briefs/demo-01/references/references.json

# References are stored in a tenant-aware path:
#   runs/tenants/{tenant}/<AUV>/references/ (non-default tenants)
#   runs/<AUV>/references/                 (default tenant)
```

### Intent Comparison

```bash
# Run advisory intent comparison
node orchestration/visual/compare.mjs --auv AUV-0005 --intent --threshold 0.10

# Results written to reports/visual/intent_compare.json
```

## Reference Visuals

### Brief Schema

References are defined in the brief with labels, types, and routes:

```json
{
  "references": [
    {
      "label": "Hero Section",
      "type": "image",
      "source": "briefs/demo-01/references/hero.png",
      "route": "/",
      "notes": "Main landing page hero"
    },
    {
      "label": "Design System",
      "type": "url",
      "source": "https://example.com/design",
      "notes": "External design reference"
    }
  ]
}
```

### Ingestion Process

1. References copied/fetched to `runs/<AUV>/references/`
2. SHA-256 deduplication applied
3. Size limits enforced (10MB default)
4. Index written to `references_index.json`

## Intent Comparison

### How It Works

- **Advisory Only**: Never blocks CVF gates
- **Route Matching**: Maps references to UI screenshots by route
- **Diff Methods**: pixelmatch or SSIM
- **Interactive Slider**: Side-by-side comparison in report

### Comparison Results

```json
{
  "auv_id": "AUV-0005",
  "mode": "intent",
  "method": "pixelmatch",
  "threshold": 0.1,
  "comparisons": [
    {
      "label": "Hero Section",
      "route": "/",
      "diff_pct": 0.08,
      "status": "pass"
    }
  ]
}
```

## Report Sections

### References Browser

- Grid layout with labels and notes
- Inline embedding for small assets (<100KB)
- Large assets copied under `dist/<AUV>/assets/**` with preserved structure
- Support for images, videos, and URLs

### Intent Compare Section

- Summary metrics (method, threshold, avg diff)
- Interactive slider for each comparison
- Pass/advisory status indicators
- Diff overlay links

### Spend Summary

- Primary vs Secondary tool costs
- Per-capability breakdown
- Budget status indicators
- Aggregated from observability ledgers

## Offline-First Design

### Asset Policy

- Small assets (<100KB, configurable) embedded as data URIs
- Large assets copied to `dist/<AUV>/assets/` (original relative structure preserved)
- Tenant-aware resolution; no `runs/**` references remain in HTML
- Path traversal protections and Windows-safe path handling

### Theme Support

- CSS variables for dark/light modes
- High contrast accessibility
- Print-optimized styles
- Responsive breakpoints

## Configuration

### Environment Variables

```bash
TEST_MODE=true         # Use fixtures for references
TENANT_ID=default      # Multi-tenant support
RUN_ID=latest         # Specific run ID
```

### CLI Options

- `--include-references`: Enable reference ingestion
- `--references-brief <path>`: Override references JSON path
- `--intent-compare`: Run intent comparison
- `--theme <light|dark>`: Report theme (default: light)
- `--embed-small-assets-kb <N>`: Embed threshold (default: 100)
- `--strict-references`: Fail if no references ingested when included
- `--spend-source <auto|aggregator|ledger>`: Choose spend data source

### Metadata Output

- `dist/<AUV>/report-metadata.json` contains advisory summaries populated by the report:
  - `report.sections.intent_compare`: `{ total, avg_diff_pct, method, threshold }`
  - `report.sections.spend_summary`: `{ primary_usd, secondary_usd, total_usd }`

## Security Considerations

- **Path Validation**: No traversal allowed
- **HTML Escaping**: All user content sanitized
- **Size Limits**: 10MB max per reference
- **URL Allowlist**: TEST_MODE stubs external fetches
- **Tenant Isolation**: Multi-tenant artifact separation

## Performance

### Optimizations

- Lazy loading for images
- SHA-256 deduplication
- Streaming for large files
- Parallel asset processing
- Cached template compilation

### Benchmarks

- Report generation: <2s for typical AUV
- Reference ingestion: <500ms per 10 items
- Intent comparison: <1s per route
- Asset embedding: <100ms per MB

## Integration

### With CI/CD

```yaml
- name: Generate Report
  run: |
    node orchestration/cli.mjs report ${{ env.AUV_ID }} \
      --include-references \
      --intent-compare
  env:
    TEST_MODE: true
```

### With DAG Runner

```yaml
- id: report
  type: report
  params:
    auv: AUV-0005
    includeReferences: true
    intentCompare: true
    theme: light
```

## Troubleshooting

### Common Issues

1. **References not appearing**
   - Check `runs/<AUV>/references/` exists
   - Verify references in brief JSON
   - Check ingestion logs in observability

2. **Intent comparison failing**
   - Ensure screenshots exist for routes
   - Verify reference paths are correct
   - Check pixelmatch dependencies

3. **Assets not loading**
   - Verify dist/assets/ directory
   - Check embedding threshold
   - Validate file permissions

### Debug Commands

```bash
# Check references
ls -la runs/<AUV>/references/

# Verify intent compare results
cat reports/visual/intent_compare.json

# Check observability
tail -n 50 runs/observability/hooks.jsonl | grep -E "Reference|Intent|Report"
```

## Manifest Schema (v1.2)

Phase 14 adds to manifest.schema.json:

```json
{
  "references": {
    "count": 3,
    "items": [...]
  },
  "report": {
    "sections": {
      "intent_compare": {
        "total": 2,
        "avg_diff_pct": 0.07
      },
      "spend_summary": {
        "primary_usd": 0.0000,
        "secondary_usd": 0.0500
      }
    }
  }
}
```

## Examples

### Full Pipeline with Phase 14

```bash
# 1. Ingest references
node orchestration/cli.mjs ingest-references AUV-1201

# 2. Run visual capture
node orchestration/visual/capture.mjs --auv AUV-1201

# 3. Intent comparison
node orchestration/visual/compare.mjs --auv AUV-1201 --intent

# 4. Generate enhanced report
node orchestration/cli.mjs report AUV-1201 \
  --include-references \
  --intent-compare \
  --theme dark

# 5. View report
open dist/AUV-1201/report.html
```

### TEST_MODE Demo

```bash
set TEST_MODE=true
node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml
```

## Future Enhancements

- Video comparison support
- Multi-device responsive testing
- A11y compliance scoring
- Performance budget tracking
- Real-time report updates
- Cloud report hosting
