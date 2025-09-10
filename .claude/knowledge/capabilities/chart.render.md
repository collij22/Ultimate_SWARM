# Chart Rendering Capability

## Overview

The `chart.render` capability generates data visualizations (PNG charts) from insights data using charting libraries or tools.

## Tools Required

- **Primary**: `chart-renderer` - Local chart generation
- **Secondary**: `plotly`, `matplotlib` (Python-based alternatives)

## Artifacts Produced

### Required Artifacts

1. **charts/\*.png** - Chart images with:
   - Minimum dimensions: 800x600 (configurable)
   - Non-uniform pixels (not blank)
   - Valid PNG format
   - SHA-256 checksum for verification

### Validation Requirements

- PNG signature validation
- Dimension checks (width, height)
- Content validation (non-blank)
- Aspect ratio warnings (1.0-2.0 preferred)

## Implementation Pattern

```javascript
// 1. Load insights data
const insights = JSON.parse(fs.readFileSync('insights.json'));

// 2. Prepare chart data
const chartData = {
  type: 'bar',
  data: {
    labels: insights.metrics.map((m) => m.label),
    datasets: [
      {
        label: 'Values',
        data: insights.metrics.map((m) => m.value),
        backgroundColor: '#4CAF50',
      },
    ],
  },
  options: {
    responsive: false,
    width: 1024,
    height: 768,
    title: {
      display: true,
      text: 'Key Metrics Overview',
    },
  },
};

// 3. Render chart to PNG
const canvas = createCanvas(1024, 768);
const ctx = canvas.getContext('2d');
const chart = new Chart(ctx, chartData);

// 4. Save PNG with proper encoding
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('charts/metrics.png', buffer);

// 5. Validate output
const validation = await validateChart('charts/metrics.png');
if (!validation.valid) {
  throw new Error(`Chart validation failed: ${validation.errors[0]}`);
}
```

## Chart Types

### Bar Charts

Best for comparing discrete categories:

```javascript
{
  type: 'bar',
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [{
      label: 'Revenue',
      data: [30000, 35000, 32000, 40000]
    }]
  }
}
```

### Line Charts

Ideal for time series and trends:

```javascript
{
  type: 'line',
  data: {
    labels: dates,
    datasets: [{
      label: 'Daily Active Users',
      data: values,
      fill: false,
      tension: 0.1
    }]
  }
}
```

### Pie/Donut Charts

Show proportions and distributions:

```javascript
{
  type: 'doughnut',
  data: {
    labels: categories,
    datasets: [{
      data: percentages,
      backgroundColor: colors
    }]
  }
}
```

### Scatter Plots

Correlation and distribution analysis:

```javascript
{
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Price vs Volume',
      data: points.map(p => ({x: p.price, y: p.volume}))
    }]
  }
}
```

## Design Guidelines

### Color Schemes

```javascript
const colorSchemes = {
  categorical: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'],
  sequential: ['#E3F2FD', '#90CAF9', '#42A5F5', '#1E88E5', '#1565C0'],
  diverging: ['#F44336', '#FF9800', '#FFEB3B', '#8BC34A', '#4CAF50'],
};
```

### Typography

- Title: 16-20px, bold
- Axis labels: 12-14px
- Data labels: 10-12px
- Legend: 12px

### Layout

- Margins: 10% of dimensions
- Grid lines: subtle gray (#E0E0E0)
- Background: white or light gray
- Border: optional 1px #CCCCCC

## Validation

```bash
# Validate single chart
node orchestration/lib/chart_validator.mjs charts/revenue.png

# Validate with custom dimensions
node orchestration/lib/chart_validator.mjs charts/revenue.png \
  --min-width 1024 \
  --min-height 768

# Validate multiple charts
node orchestration/lib/chart_validator.mjs charts/*.png
```

## Best Practices

1. **Always include titles and labels**
2. **Use consistent color schemes** across related charts
3. **Ensure sufficient contrast** for accessibility
4. **Include legends** when multiple datasets
5. **Format numbers appropriately** (K, M, %)
6. **Test for color blindness** compatibility
7. **Export at appropriate resolution** (min 72 DPI)
8. **Validate dimensions and content** before saving

## Common Issues

### Blank Charts

- Check data arrays aren't empty
- Verify canvas initialization
- Ensure render completes before saving

### Poor Quality

- Increase canvas dimensions
- Use anti-aliasing
- Adjust font sizes for clarity

### Validation Failures

- Verify PNG encoding
- Check file size (>20KB expected)
- Ensure dimensions meet minimums

## Example Chart Set

For a complete data analysis AUV:

1. **revenue.png** - Monthly revenue bar chart
2. **trends.png** - Time series line chart
3. **categories.png** - Category distribution pie chart
4. **correlation.png** - Price/volume scatter plot
5. **heatmap.png** - Regional performance heatmap

## Integration with Reports

Charts are automatically included in HTML reports:

```html
<div class="chart-gallery">
  <figure>
    <img src="charts/revenue.png" alt="Revenue Chart" />
    <figcaption>Monthly Revenue Overview</figcaption>
  </figure>
</div>
```

## Performance Considerations

- Render charts in parallel when possible
- Cache rendered charts by data hash
- Compress PNGs with pngquant if needed
- Consider SVG for vector graphics
- Limit data points for performance (aggregate if >1000)
