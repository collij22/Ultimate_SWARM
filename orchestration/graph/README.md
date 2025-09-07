# DAG Runner

Production-grade Directed Acyclic Graph (DAG) execution engine for Swarm1.

## Quick Start

```bash
# Compile backlog to graph
node orchestration/cli.mjs graph-from-backlog capabilities/backlog.yaml -o my-graph.yaml

# Run graph
node orchestration/cli.mjs run-graph my-graph.yaml

# Resume after failure
node orchestration/cli.mjs run-graph my-graph.yaml --resume RUN-abc123
```

## Features

- **Parallel Execution**: 60%+ performance improvement
- **Dependency Management**: Topological sorting with cycle detection
- **Resource Locks**: Prevents conflicts (deadlock-free)
- **State Persistence**: Full resume capability
- **Retry Logic**: Exponential backoff for transient failures
- **Process Management**: Automatic cleanup, no orphaned processes

## Architecture

### Core Components

- `runner.mjs` - Main execution engine
- `compile_from_backlog.mjs` - Backlog to DAG compiler
- `spec.schema.yaml` - JSON Schema for validation

### Node Types

- `server` - Start/ensure mock server
- `playwright` - UI test execution
- `lighthouse` - Performance audits
- `cvf` - Capability validation
- `agent_task` - Agent execution (future)
- `package`/`report` - Packaging/reporting (future)

### State Management

State persisted to `runs/graph/<RUN-ID>/state.json`:
- Per-node status (queued/running/succeeded/failed)
- Attempt counts and timestamps
- Error messages for debugging

### Resource Locks

Prevents conflicts via sorted acquisition:
```javascript
const sorted = [...resources].sort();
for (const resource of sorted) {
  await this.lockManager.acquire(resource);
}
```

## Implementation Details

### Run ID Generation
Uses Node's built-in `crypto.randomUUID()`:
```javascript
crypto.randomUUID().replace(/-/g, '').slice(0, 12)
```

### Process Lifecycle
- Unix: Process groups with `detached: true` and `unref()`
- Windows: Direct process management
- Cleanup in finally block ensures no orphaned processes

### AUV_ID Resolution
Extracts base ID from node IDs:
```javascript
const auvFromId = (node.id.match(/^AUV-\d{4}/) || [])[0];
```

## Testing

```bash
# Unit tests
node tests/unit/graph_schema.test.mjs
node tests/unit/graph_runner.test.mjs
node tests/unit/auv-id-resolution.test.mjs

# Integration tests
node tests/integration/graph-parallelization.test.mjs
node tests/integration/graph-resume.test.mjs

# Process cleanup tests
node tests/process-group-cleanup.test.mjs
node tests/server-cleanup.test.mjs
```

## Example Graph

```yaml
version: '1.0'
project_id: demo-01
concurrency: 3
nodes:
  - id: server
    type: server
    resources: [server]
  - id: AUV-0101-ui
    type: playwright
    requires: [server]
    params:
      specs: [tests/robot/playwright/auv-0101.spec.ts]
edges:
  - [server, AUV-0101-ui]
```

## Performance

With 8 AUVs:
- Serial execution: ~4 minutes
- Parallel (concurrency=3): ~1.5 minutes
- **60%+ time reduction**

## Troubleshooting

### Resume After Crash
```bash
# Find run ID in logs or state files
ls runs/graph/
# Resume with specific run
node orchestration/cli.mjs run-graph graph.yaml --resume RUN-xyz123
```

### Debug State
```bash
# View current state
cat runs/graph/RUN-xyz123/state.json | jq .
```

### Check Logs
```bash
# View observability events
tail -f runs/observability/hooks.jsonl | jq .
```