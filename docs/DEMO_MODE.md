# DEMO_MODE Documentation

## Overview

`DEMO_MODE` is an environment variable that enables demonstration-specific features in the Swarm1 system, particularly for generating demo runbooks and enabling special behaviors for demonstration AUVs (Atomic Units of Value).

## Purpose

The demo mode serves several purposes:

1. **Runbook Generation**: Automatically generates demo runbook summaries for specific AUVs
2. **Test Isolation**: Allows demo features to be tested without affecting production behavior
3. **Documentation**: Creates human-readable summaries of demo pipeline executions
4. **Validation**: Ensures demo pipelines meet quality standards before showcasing

## Affected AUVs

Demo mode currently affects only these specific AUVs:

- **AUV-1201**: Data-to-Video Analytics Pipeline
- **AUV-1202**: SEO Audit and Reporting Pipeline

All other AUVs are unaffected by demo mode.

## How to Enable/Disable

### Enable Demo Mode

```bash
# Windows
set DEMO_MODE=true
node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml

# Unix/Linux/Mac
DEMO_MODE=true node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml
```

### Disable Demo Mode

Simply don't set the environment variable, or explicitly set it to false:

```bash
# Windows
set DEMO_MODE=false

# Unix/Linux/Mac
export DEMO_MODE=false
```

## Behavior

### When DEMO_MODE is Enabled

For AUV-1201 and AUV-1202 only:

1. The `demo_runbook` node in the DAG will generate a runbook summary
2. The runbook will be saved to `runs/AUV-<ID>/result-cards/runbook-summary.json`
3. The runbook includes:
   - AUV metadata (ID, name, description)
   - Execution steps and their statuses
   - Timing information
   - Summary of artifacts generated

### When DEMO_MODE is Disabled

- The `demo_runbook` node will be skipped
- No runbook summary will be generated
- The pipeline continues without any demo-specific artifacts

## Interaction with TEST_MODE

`TEST_MODE` also enables demo runbook generation. This is useful for testing:

```bash
TEST_MODE=true node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml
```

If either `DEMO_MODE` or `TEST_MODE` is set to `true`, demo features will be enabled for the supported AUVs.

## Impact on Runbook Generation

The demo runbook generation is handled by the `demo_runbook` node in the DAG, which:

1. **Checks conditions**: Only runs for AUV-1201/1202 when demo/test mode is enabled
2. **Collects metadata**: Gathers information about the pipeline execution
3. **Generates summary**: Creates a JSON summary with:
   - AUV identification
   - Pipeline description
   - Step-by-step execution details
   - Performance metrics
   - Artifact inventory

Example runbook structure:

```json
{
  "auv_id": "AUV-1201",
  "name": "Data-to-Video Analytics Pipeline",
  "description": "Transform raw data into narrated video presentations...",
  "timestamp": "2025-09-10T12:00:00.000Z",
  "run_id": "RUN-abc123",
  "tenant": "default",
  "steps": [
    {
      "name": "data.ingest",
      "status": "completed",
      "duration_ms": 1000
    }
  ],
  "total_duration_ms": 5000,
  "artifact_count": 6
}
```

## Testing

The demo runbook generation is tested in:

- `tests/unit/demo_runbook.test.mjs` - Unit tests for the runbook module
- `tests/integration/packaging-e2e.test.mjs` - E2E tests including demo mode

To run tests:

```bash
# Run unit test
node --test tests/unit/demo_runbook.test.mjs

# Run integration tests with demo mode
TEST_MODE=true node --test tests/integration
```

## Best Practices

1. **Production**: Never set `DEMO_MODE` in production environments
2. **CI/CD**: Use `TEST_MODE` instead of `DEMO_MODE` in CI pipelines
3. **Development**: Use `DEMO_MODE` when developing or showcasing demo pipelines
4. **Documentation**: Always document when demo mode is required for specific workflows

## Troubleshooting

### Runbook Not Generated

Check that:

1. `DEMO_MODE` or `TEST_MODE` is set to `true`
2. You're running AUV-1201 or AUV-1202
3. The DAG includes a `demo_runbook` node
4. The demo_runbook node has proper dependencies

### Runbook Location

Runbooks are saved to:

```
runs/<AUV-ID>/result-cards/runbook-summary.json
```

If the directory doesn't exist, it will be created automatically.

## Future Enhancements

Potential future improvements:

- Support for additional demo AUVs
- Configurable runbook formats (HTML, Markdown)
- Integration with reporting dashboard
- Real-time runbook streaming
