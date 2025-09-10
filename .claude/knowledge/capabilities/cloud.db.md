# Cloud Database - Supabase Capability

## Overview

The `cloud.db` capability provides hosted PostgreSQL database operations via Supabase for demos and staging environments.

## Requirements

- `TEST_MODE=true` mandatory for all executions
- Secondary consent required (`secondary_consent: true`)
- SUPABASE_SERVICE_KEY environment variable (service role key)
- Budget allocation (typically $0.05 per run)
- Restricted to demo schema namespace

## Input Specification

```yaml
capability: cloud.db
input:
  check: 'connectivity' # or 'roundtrip'
  host: 'project.supabase.co'
  database: 'postgres'

  # For roundtrip check
  query: 'SELECT version(), current_timestamp'

  # For schema operations
  operation: 'create_schema'
  schema_name: 'demo_schema'
  tables:
    - name: 'users'
      columns:
        - { name: 'id', type: 'serial', primary: true }
        - { name: 'email', type: 'varchar(255)', unique: true }
        - { name: 'created_at', type: 'timestamp', default: 'now()' }
```

## Expected Artifacts

- `runs/db_demo/connectivity.json` - Connection status
- `runs/db_demo/roundtrip.json` - Query execution results
- `runs/db_demo/schema.json` - Schema creation results

## TEST_MODE Behavior

In TEST_MODE, simulates database operations:

- Returns connected status with mock latency
- Generates synthetic query results
- No actual database connections
- All operations marked with test_mode: true

## Live Mode Behavior

- Connects to actual Supabase instance
- Restricted to public_demo schema
- No DDL outside demo namespace
- Connection pooling enabled
- Automatic retry on transient failures

## Validation

CVF checks for:

- Connectivity status === 'connected'
- Roundtrip query successful
- Schema operations without errors
- Latency within acceptable range

## Common Patterns

```javascript
// Database connectivity test
{
  capability: 'cloud.db',
  purpose: 'Verify database connectivity',
  input_spec: {
    check: 'connectivity',
    host: 'demo.supabase.co'
  },
  constraints: {
    test_mode: true,
    max_cost_usd: 0.05,
    secondary_consent: true
  },
  expected_artifacts: [
    'runs/db_demo/connectivity.json'
  ]
}

// Schema migration
{
  capability: 'cloud.db',
  purpose: 'Apply database schema',
  input_spec: {
    operation: 'migrate',
    migrations: [
      'CREATE TABLE demo_schema.products (...)',
      'CREATE INDEX idx_products_name ON ...'
    ]
  },
  constraints: {
    test_mode: true,
    schema_namespace: 'demo_schema'
  }
}
```

## Integration Patterns

### With Data Ingestion

1. Create schema with cloud.db
2. Ingest data with data.ingest
3. Query with data.query
4. Generate insights

### With API Development

1. Set up database schema
2. Implement CRUD endpoints
3. Validate with api.test
4. Generate API documentation

## Schema Namespace Rules

- All operations restricted to `public_demo` or specified namespace
- Cannot modify system schemas
- Cannot create databases
- Cannot grant privileges

## Connection Management

```javascript
// Connection pooling configuration
{
  max_connections: 10,
  idle_timeout_ms: 30000,
  connection_timeout_ms: 5000,
  statement_timeout_ms: 30000
}
```

## Safety Considerations

- **Never use production database URLs**
- Restrict operations to demo namespaces
- Use read replicas for queries when possible
- Monitor connection pool usage
- Implement query timeouts
- Sanitize all inputs to prevent SQL injection
- Use parameterized queries only

## Common Operations

### Check Connectivity

```sql
SELECT 1 as connectivity_check
```

### Get Schema Info

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'demo_schema'
```

### Create Demo Table

```sql
CREATE TABLE IF NOT EXISTS demo_schema.test_table (
  id SERIAL PRIMARY KEY,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
)
```

## Error Handling

Common errors and resolutions:

- Connection refused: Check SUPABASE_SERVICE_KEY
- Permission denied: Verify service role key
- Schema not found: Create schema first
- Timeout: Check network/firewall settings
- Pool exhausted: Reduce concurrent connections
