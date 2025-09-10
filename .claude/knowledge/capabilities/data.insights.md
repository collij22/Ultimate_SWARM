# Data Insights Capability

## Overview

The `data.ingest` and `data.insights` capabilities enable processing raw data files (CSV, JSON, Parquet) to generate statistical insights, aggregations, and metrics.

## Tools Required

- **Primary**: `duckdb` - In-memory SQL analytics
- **Secondary**: `postgres`, `mysql` (for larger datasets)

## Artifacts Produced

### Required Artifacts

1. **insights.json** - Main insights document containing:
   - `data_row_count`: Total rows processed (must be ≥100 by default)
   - `metrics`: Array of computed metrics with id, value, unit, label
   - `source_manifest`: SHA-256 checksums of input files
   - `aggregations`: Summary statistics by dimensions
   - `findings`: Key insights as text

2. **data/raw/\*** - Original input files
3. **data/processed/\*** - Cleaned/transformed data files

### Validation Thresholds

- Minimum rows: 100 (configurable)
- Required metrics: Defined per AUV
- Checksum validation: All source files must match manifest

## Implementation Pattern

```javascript
// 1. Ingest raw data
const data = await duckdb.query(`
  SELECT * FROM read_csv_auto('input.csv')
`);

// 2. Compute metrics
const metrics = [
  {
    id: 'total_revenue',
    label: 'Total Revenue',
    value: 125000.5,
    unit: 'USD',
    category: 'financial',
  },
  {
    id: 'avg_order_value',
    label: 'Average Order Value',
    value: 45.25,
    unit: 'USD',
    category: 'financial',
  },
];

// 3. Generate aggregations
const aggregations = {
  by_category: {
    count: 5,
    sum: 125000.5,
    mean: 25000.1,
  },
};

// 4. Write insights.json
const insights = {
  version: '1.0',
  generated_at: new Date().toISOString(),
  data_row_count: 1500,
  source_manifest: [
    {
      path: 'data/raw/sales.csv',
      sha256: 'abc123...',
      size: 45678,
    },
  ],
  metrics,
  aggregations,
  dimensions: ['category', 'region', 'date'],
  findings: ['Revenue increased 20% YoY', 'Top category represents 45% of sales'],
};
```

## Common Queries

### Basic Statistics

```sql
-- Row count and nulls
SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT id) as unique_ids,
  SUM(CASE WHEN column IS NULL THEN 1 ELSE 0 END) as null_count
FROM table;

-- Numeric summaries
SELECT
  AVG(value) as mean,
  MEDIAN(value) as median,
  MIN(value) as min,
  MAX(value) as max,
  STDDEV(value) as std_dev
FROM table;
```

### Time Series Analysis

```sql
-- Daily aggregations
SELECT
  DATE_TRUNC('day', timestamp) as date,
  COUNT(*) as daily_count,
  SUM(amount) as daily_total
FROM transactions
GROUP BY 1
ORDER BY 1;

-- Moving averages
SELECT
  date,
  value,
  AVG(value) OVER (
    ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as ma7
FROM daily_metrics;
```

### Categorical Analysis

```sql
-- Top N categories
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total,
  AVG(amount) as average
FROM sales
GROUP BY category
ORDER BY total DESC
LIMIT 10;

-- Distribution
SELECT
  category,
  COUNT(*) as frequency,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM data
GROUP BY category;
```

## Validation

Use the data validator to ensure quality:

```bash
# Validate insights.json
node orchestration/lib/data_validator.mjs runs/AUV-DATA-001/insights.json

# With specific requirements
node orchestration/lib/data_validator.mjs runs/AUV-DATA-001/insights.json \
  --min-rows 150 \
  --required revenue,conversion_rate
```

## Best Practices

1. **Always compute checksums** for reproducibility
2. **Include both raw and derived metrics**
3. **Document data quality issues** in findings
4. **Use appropriate precision** for numeric values
5. **Group metrics by category** for better organization
6. **Handle missing data explicitly**
7. **Validate against business rules**

## Error Handling

Common issues and solutions:

- **Insufficient rows**: Check filters, joins, and data quality
- **Missing metrics**: Ensure all required calculations are performed
- **Checksum mismatch**: Verify input files haven't changed
- **Schema validation failure**: Check JSON structure and required fields

## Example AUV Configuration

```yaml
# capabilities/AUV-DATA-001.yaml
auv:
  id: AUV-DATA-001
  name: Sales Data Analysis

capabilities:
  - data.ingest
  - data.insights

artifacts:
  required:
    - runs/AUV-DATA-001/data/raw/sales.csv
    - runs/AUV-DATA-001/data/processed/cleaned.csv
    - runs/AUV-DATA-001/insights.json

thresholds:
  min_rows: 100
  required_metrics:
    - total_revenue
    - transaction_count
    - avg_transaction_value
```
