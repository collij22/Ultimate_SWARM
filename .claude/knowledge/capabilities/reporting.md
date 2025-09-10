# Reporting Capability Knowledge

## Overview

The reporting capability generates comprehensive HTML reports from package manifests with Phase 14 enhancements for reference visuals, intent comparison, and offline-first design.

## Agent Guidelines

### When to Generate Reports

- After successful package creation
- When client deliverables are needed
- For visual documentation of AUV completion
- To aggregate spend and performance metrics

### Report Generation Process

1. **Check Prerequisites**

   ```javascript
   // Ensure manifest exists
   const manifestPath = `dist/${auvId}/manifest.json`;
   if (!fs.existsSync(manifestPath)) {
     throw new Error('Package manifest required');
   }
   ```

2. **Configure Options**

   ```javascript
   const options = {
     includeReferences: true, // Phase 14: Reference visuals
     intentCompare: true, // Phase 14: Advisory comparison
     theme: 'light', // or 'dark'
     embedSmallAssetsKb: 100, // Inline threshold
   };
   ```

3. **Generate Report**
   ```javascript
   const generator = new ReportGenerator(auvId, options);
   const reportPath = await generator.generate();
   ```

### Reference Visuals Integration

**Purpose**: Show design intent alongside implementation

**Process**:

1. Ingest references from brief
2. Store in `runs/<AUV>/references/`
3. Display in report grid
4. Enable side-by-side comparison

**Example Brief References**:

```json
{
  "references": [
    {
      "label": "Product Grid",
      "type": "image",
      "source": "mockups/products.png",
      "route": "/products",
      "notes": "Expected layout"
    }
  ]
}
```

### Intent Comparison

**Key Points**:

- **Advisory only** - never blocks gates
- Uses pixelmatch/SSIM algorithms
- Default threshold: 10% difference
- Interactive slider in report

**Running Comparison**:

```bash
node orchestration/visual/compare.mjs \
  --auv AUV-0005 \
  --intent \
  --threshold 0.10
```

### Spend Summary

**What to Include**:

- Primary tool costs (usually $0)
- Secondary tool costs (budgeted)
- Per-capability breakdown
- Total spend vs budget

**Data Sources**:

- `runs/observability/spend_ledger.jsonl`
- Manifest `report.sections.spend_summary`

### Subagent Narrative

**Best Practices**:

- Keep concise (3-5 key decisions)
- Highlight tool alternatives considered
- Note any escalations or constraints
- Link to full transcripts

**Example Narrative**:

```
Executed data.ingest with duckdb (Primary)
Considered firecrawl for web.crawl (Secondary, $0.05)
Fallback to crawler-lite (Primary) due to budget
Generated 3 charts via chart-renderer
```

### Report Sections

#### Required Sections

1. **Summary**: CVF status, performance score
2. **Artifacts**: Table with checksums
3. **Provenance**: Build metadata

#### Phase 14 Sections

1. **References Browser**: Visual design intent
2. **Intent Compare**: Advisory UI comparison
3. **Spend Summary**: Tool usage costs
4. **Enhanced Narratives**: Subagent decisions

### Asset Handling

**Embedding Policy**:

- Inline if ≤100KB (configurable)
- Copy to `dist/assets/` if larger
- Use data URIs for small images
- Preserve paths for uniqueness

**Example**:

```javascript
if (asset.bytes <= threshold * 1024) {
  return embedAsDataUri(asset.path);
} else {
  return copyToAssets(asset.path);
}
```

### Theme Support

**CSS Variables**:

```css
:root {
  --bg-primary: light ? #fff: #1a1a1a;
  --text-primary: light ? #333: #e0e0e0;
  --accent-color: light ? #007acc: #4a9eff;
}
```

**Accessibility**:

- ARIA labels for interactive elements
- Keyboard navigation for sliders
- High contrast ratios
- Print-friendly styles

### Performance Optimization

**Tips**:

- Lazy load images with `loading="lazy"`
- Dedupe by SHA-256
- Stream large files
- Cache compiled templates
- Minimize inline JavaScript

### Error Handling

**Graceful Degradation**:

```javascript
try {
  section = await buildIntentCompare();
} catch (error) {
  console.warn('Intent compare failed:', error);
  section = ''; // Skip section
}
```

### Testing Reports

**Validation Checklist**:

- [ ] Manifest loaded correctly
- [ ] All sections render
- [ ] Assets load (inline/external)
- [ ] Interactive features work
- [ ] Print preview acceptable
- [ ] Offline mode functional

### Common Patterns

**Conditional Sections**:

```handlebars
{{#if references_browser}}
  <section class='references'>
    {{references_browser}}
  </section>
{{/if}}
```

**Asset Paths**:

```javascript
const assetPath =
  tenant === 'default' ? `dist/${auvId}/assets/` : `dist/tenants/${tenant}/${auvId}/assets/`;
```

### Integration Points

**With Packaging**:

- Report requires completed manifest
- Assets from package bundle
- Checksums must match

**With Visual Module**:

- Screenshots for intent compare
- Visual regression results
- Baseline management

**With Observability**:

- Spend tracking
- Event emissions
- Hook integration

### Debugging

**Check Points**:

1. Manifest exists and valid
2. References ingested
3. Intent compare data present
4. Assets accessible
5. Template renders correctly

**Debug Commands**:

```bash
# Check manifest
cat dist/<AUV>/manifest.json | jq .version

# Verify references
ls runs/<AUV>/references/

# Test report generation
TEST_MODE=true node orchestration/cli.mjs report <AUV>
```

### Best Practices

1. **Always TEST_MODE** for demos
2. **Include references** for client work
3. **Light theme** for print/PDF
4. **Embed threshold** based on network
5. **Advisory comparisons** only
6. **Document spend** clearly
7. **Link to artifacts** not copy
8. **Validate offline** functionality

### Output Example

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      /* Inlined CSS */
    </style>
  </head>
  <body>
    <div class="container">
      <!-- CVF Status -->
      <!-- Screenshots Gallery -->
      <!-- References Browser -->
      <!-- Intent Compare -->
      <!-- Spend Summary -->
      <!-- Artifacts Table -->
    </div>
  </body>
</html>
```
